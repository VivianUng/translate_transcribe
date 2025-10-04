#backend/app/api/websocket_transcribe.py
import json
import numpy as np
import whisper
from fastapi import APIRouter, WebSocket

from app.core.language_codes import LanguageConverter

router = APIRouter()

SAMPLE_RATE = 16000        # 16 kHz
CHUNK_DURATION_SEC = 2      # process every few seconds
OVERLAP_DURATION_SEC = 0.1

# Calculate number of samples
CHUNK_SIZE = int(SAMPLE_RATE * CHUNK_DURATION_SEC)
OVERLAP_SIZE = int(SAMPLE_RATE * OVERLAP_DURATION_SEC)

model = whisper.load_model("base") # "tiny", "base", "small", "medium"
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
                    print(f"Language {isoLang} not supported, falling back to auto-detect. Error: {e}")
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


## try using whisper_live so that don't need custom chunking
# import json
# from fastapi import APIRouter, WebSocket
# from whisper_live.client import TranscriptionClient
# from app.core.language_codes import LanguageConverter

# router = APIRouter()

# # Initialize the streaming client (connect to a running whisper_live server)
# client = TranscriptionClient(
#     host="localhost",
#     port=9090,
#     multilingual=True,
#     language="en",      # target language for transcription
#     translate=False     # set True to auto-translate to English
# )

# @router.websocket("/transcribe")
# async def websocket_transcribe(ws: WebSocket):
#     await ws.accept()

#     # Optional: read language query param and convert to Whisper format
#     input_lang = ws.query_params.get("lang", "en")
#     if input_lang != "auto":
#         isoLang = LanguageConverter.convert(input_lang, "libretranslate", "whisper")
#     else:
#         isoLang = None
#     print(f"WebSocket opened with language={isoLang}")

#     try:
#         # The TranscriptionClient exposes a streaming callback interface
#         def on_partial(text):
#             # send partial transcription back to frontend
#             if text:
#                 try:
#                     ws.send_text(json.dumps({"partial_text": text}))
#                 except RuntimeError:
#                     pass  # client disconnected

#         # Start streaming from the websocket
#         while True:
#             try:
#                 data = await ws.receive_bytes()
#             except Exception:
#                 break  # client disconnected

#             # Feed audio bytes directly to whisper_live
#             # whisper_live accepts PCM int16 or float32 (16 kHz)
#             client.feed_audio(data, language=isoLang or "en", callback=on_partial)

#     except Exception as e:
#         print("Error:", e)
#         if ws.client_state.name == "CONNECTED":
#             await ws.send_text(json.dumps({"error": str(e)}))

#     finally:
#         if ws.client_state.name == "CONNECTED":
#             await ws.close()




