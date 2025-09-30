import json
import numpy as np
import whisper
from fastapi import APIRouter, WebSocket

from app.core.language_codes import LanguageConverter

router = APIRouter()

SAMPLE_RATE = 16000        # 16 kHz
CHUNK_DURATION_SEC = 2      # process every few seconds
OVERLAP_DURATION_SEC = 0.2

# Calculate number of samples
CHUNK_SIZE = int(SAMPLE_RATE * CHUNK_DURATION_SEC)
OVERLAP_SIZE = int(SAMPLE_RATE * OVERLAP_DURATION_SEC)

model = whisper.load_model("base")
@router.websocket("/ws/transcribe")
async def websocket_transcribe(ws: WebSocket):
    await ws.accept()

    # Read query param
    input_lang = ws.query_params.get("lang", "en")  # default to English if not provided
    # convert input_lang to iso639-1 
    if input_lang != "auto":
        isoLang = LanguageConverter.convert(input_lang, "libretranslate", "whisper")
    else : 
        isoLang = "None"
    print(f"WebSocket opened with language={input_lang}")

    audio_buffer = b""

    try:
        while True:
            try:
                data = await ws.receive_bytes()
            except Exception:
                # client disconnected
                break

            audio_buffer += data

            # Convert bytes → float32 PCM
            audio_np = (
                np.frombuffer(audio_buffer, dtype=np.int16)
                .astype(np.float32) / 32768.0
            )

            # Process chunk when enough samples collected
            if len(audio_np) >= CHUNK_SIZE:
                chunk = audio_np[-CHUNK_SIZE:]

                # Transcribe chunk
                try:
                    result = model.transcribe(
                        chunk,
                        language=isoLang if isoLang else None,  # use provided lang if not empty
                        fp16=False,
                        verbose=False
                    )
                except Exception as e:
                    print(f"Language '{isoLang}' not supported, falling back to auto-detect. Error: {e}")
                    result = model.transcribe(
                        chunk,
                        language=None,   # auto-detect mode
                        fp16=False,
                        verbose=False
                    )
                text = result.get("text", "").strip()

                if text:
                    try:
                        await ws.send_text(json.dumps({"partial_text": text}))
                    except RuntimeError:
                        break

                # Keep only last overlap for next round
                keep_samples = OVERLAP_SIZE
                audio_buffer = audio_buffer[-keep_samples * 2 :]  # 2 bytes per int16

                # # clear audio_buffer
                # audio_buffer = b""

    except Exception as e:
        print("Error:", e)
        if ws.client_state.name == "CONNECTED":
            await ws.send_text(json.dumps({"error": str(e)}))

    finally:
        if ws.client_state.name == "CONNECTED":
            await ws.close()