#backend/app/api/websocket_transcribe.py
import json
import numpy as np
import whisper
import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from starlette.websockets import WebSocketState

from app.core.language_codes import LanguageConverter

router = APIRouter()

SAMPLE_RATE = 16000        # 16 kHz
CHUNK_DURATION_SEC = 2      # process every few seconds
OVERLAP_DURATION_SEC = 0.1

# Calculate number of samples
CHUNK_SIZE = int(SAMPLE_RATE * CHUNK_DURATION_SEC)
OVERLAP_SIZE = int(SAMPLE_RATE * OVERLAP_DURATION_SEC)

model = whisper.load_model("base") # "tiny", "base", "small", "medium"

async def transcribe_chunk(chunk: np.ndarray, isoLang: str | None):
    """Run blocking Whisper transcription in a separate thread."""
    return await asyncio.to_thread(
        model.transcribe,
        chunk,
        language=isoLang if isoLang else None,
        fp16=False,
        verbose=False
    )

async def safe_send(ws: WebSocket, message: dict):
    """Send message only if the websocket is still connected."""
    if ws.application_state == WebSocketState.CONNECTED:
        try:
            await ws.send_text(json.dumps(message))
        except (RuntimeError, WebSocketDisconnect, ConnectionResetError):
            # Client may have disconnected mid-send
            pass

@router.websocket("/transcribe")
async def websocket_transcribe(ws: WebSocket):
    await ws.accept()

    # Read query param
    input_lang = ws.query_params.get("lang", "en")  # default to English if not provided
    # convert input_lang to iso639-1 
    if input_lang != "auto":
        isoLang = LanguageConverter.convert(input_lang, "libretranslate", "whisper")
    else : 
        isoLang = None
    print(f"WebSocket opened with language={isoLang}")

    audio_buffer = b""

    try:
        while True:
            try:
                data = await ws.receive_bytes()
            except WebSocketDisconnect:
                print("Client disconnected.")
                break
            except Exception as e:
                print("Receive error:", e)
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
                    result = await transcribe_chunk(chunk, isoLang)
                except Exception as e:
                    print(f"Language {isoLang} not supported, falling back to auto-detect. Error: {e}")
                    result = model.transcribe(
                        chunk,
                        language=None,   # auto-detect mode
                        fp16=False,
                        verbose=False
                    )
                text = result.get("text", "").strip()
                detected_lang = result.get("language") 

                if text:
                    try:
                        libreLang = LanguageConverter.convert(detected_lang, "whisper", "libretranslate")
                        # await ws.send_text(json.dumps({"partial_text": text, "detected_lang": libreLang}))
                        await safe_send(ws, {"partial_text": text, "detected_lang": libreLang})
                    except RuntimeError:
                        break

                # Keep only last overlap for next round
                keep_samples = OVERLAP_SIZE
                audio_buffer = audio_buffer[-keep_samples * 2 :]  # 2 bytes per int16

                # # clear audio_buffer
                # audio_buffer = b""

    except Exception as e:
        print("Error:", e)
        await safe_send(ws, {"error": str(e)})

    finally:
        if ws.application_state == WebSocketState.CONNECTED:
            await ws.close()
        print("WebSocket closed.")