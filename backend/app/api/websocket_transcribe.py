## Last Functional Code : (some messages are sent too late)

# #backend/app/api/websocket_transcribe.py
# import json
# import numpy as np
# from faster_whisper import WhisperModel
# import asyncio
# from fastapi import APIRouter, WebSocket, WebSocketDisconnect
# from starlette.websockets import WebSocketState
# from collections import deque

# from app.core.language_codes import LanguageConverter

# router = APIRouter()

# SAMPLE_RATE = 16000        # 16 kHz
# # CHUNK_DURATION_SEC = 2      # process every few seconds
# CHUNK_DURATION_SEC = 1.5      # process every few seconds
# OVERLAP_DURATION_SEC = 0.1

# # Calculate number of samples
# CHUNK_SIZE = int(SAMPLE_RATE * CHUNK_DURATION_SEC)
# OVERLAP_SIZE = int(SAMPLE_RATE * OVERLAP_DURATION_SEC)

# # Faster whisper
# model = WhisperModel("base", device="cpu", compute_type="int8")

# async def transcribe_chunk(chunk: np.ndarray, isoLang: str | None):
#     """Transcribe audio chunk with faster-whisper, with language fallback."""
#     try:
#         segments, info = await asyncio.to_thread(
#             model.transcribe,
#             chunk,
#             language=isoLang if isoLang else None,
#             beam_size=5
#         )
#     except ValueError as e:
#         if "language" in str(e).lower() or "invalid language" in str(e).lower():
#             print(f"Unsupported language '{isoLang}', falling back to auto-detect.")
#             segments, info = await asyncio.to_thread(
#                 model.transcribe,
#                 chunk,
#                 language=None,  # auto-detect
#                 beam_size=5
#             )
#         else:
#             # If ValueError for another reason, re-raise
#             raise
#     except RuntimeError as e:
#         print(f"RuntimeError during transcription: {e}")
#         return {"text": "", "language": isoLang, "error": str(e)}
    
#     except Exception as e:
#         # Catch any unexpected error
#         print(f"Unexpected error during transcription: {type(e).__name__}: {e}")
#         return {"text": "", "language": isoLang, "error": str(e)}
    
    
#     text = " ".join([seg.text for seg in segments]).strip()
#     detected_lang = info.language
#     return {"text": text, "language": detected_lang}

# async def safe_send(ws: WebSocket, message: dict):
#     """Send message only if the websocket is still connected."""
#     if ws.application_state == WebSocketState.CONNECTED:
#         try:
#             await ws.send_text(json.dumps(message))
#         except (RuntimeError, WebSocketDisconnect, ConnectionResetError):
#             # Client may have disconnected mid-send
#             pass

# @router.websocket("/transcribe")
# async def websocket_transcribe(ws: WebSocket):
#     await ws.accept()

#     # Read query param
#     input_lang = ws.query_params.get("lang", "en")  # default to English if not provided
#     # convert input_lang to iso639-1 
#     if input_lang != "auto":
#         isoLang = LanguageConverter.convert(input_lang, "libretranslate", "whisper")
#     else : 
#         isoLang = None
#     print(f"WebSocket opened with language={isoLang}")

#     audio_buffer = b""

#     try:
#         while True:
#             try:
#                 data = await ws.receive_bytes()
#             except WebSocketDisconnect:
#                 print("Client disconnected.")
#                 break
#             except Exception as e:
#                 print("Receive error:", e)
#                 break

#             audio_buffer += data

#             # Convert bytes → float32 PCM
#             audio_np = (
#                 np.frombuffer(audio_buffer, dtype=np.int16)
#                 .astype(np.float32) / 32768.0
#             )

#             # Process chunk when enough samples collected
#             if len(audio_np) >= CHUNK_SIZE:
#                 chunk = audio_np[-CHUNK_SIZE:]

#                 result = await transcribe_chunk(chunk, isoLang)
#                 text = result["text"]
#                 detected_lang = result["language"]

#                 if text:
#                     try:
#                         libreLang = LanguageConverter.convert(detected_lang, "whisper", "libretranslate")
#                         await safe_send(ws, {"partial_text": text, "detected_lang": libreLang})
#                     except RuntimeError:
#                         break

#                 # Keep only last overlap for next round
#                 keep_samples = OVERLAP_SIZE
#                 audio_buffer = audio_buffer[-keep_samples * 2 :]  # 2 bytes per int16

#     except Exception as e:
#         print("Error:", e)
#         await safe_send(ws, {"error": str(e)})

#     finally:
#         if ws.application_state == WebSocketState.CONNECTED:
#             await ws.close()
#         print("WebSocket closed.")

#################################################################################3
## With retranscription every 10 seconds
import json
import numpy as np
from faster_whisper import WhisperModel
import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from starlette.websockets import WebSocketState

from app.core.language_codes import LanguageConverter

router = APIRouter()

SAMPLE_RATE = 16000
CHUNK_DURATION_SEC = 2
OVERLAP_DURATION_SEC = 0.1
RETRANSCRIBE_SEC = 10  # period to retranscribe larger chunk

CHUNK_SIZE = int(SAMPLE_RATE * CHUNK_DURATION_SEC)
OVERLAP_SIZE = int(SAMPLE_RATE * OVERLAP_DURATION_SEC)
RETRANSCRIBE_SIZE = int(SAMPLE_RATE * RETRANSCRIBE_SEC)

model = WhisperModel("base", device="cpu", compute_type="int8")


async def transcribe_chunk(chunk: np.ndarray, isoLang: str | None):
    try:
        segments, info = await asyncio.to_thread(
            model.transcribe,
            chunk,
            language=isoLang if isoLang else None,
            beam_size=5
        )
    except ValueError as e:
        if "language" in str(e).lower() or "invalid language" in str(e).lower():
            segments, info = await asyncio.to_thread(model.transcribe, chunk, language=None, beam_size=5)
        else:
            raise
    except Exception as e:
        return {"text": "", "language": isoLang, "error": str(e)}

    text = " ".join([seg.text for seg in segments]).strip()
    detected_lang = info.language
    return {"text": text, "language": detected_lang}


async def safe_send(ws: WebSocket, message: dict):
    if ws.application_state == WebSocketState.CONNECTED:
        try:
            await ws.send_text(json.dumps(message))
        except (RuntimeError, WebSocketDisconnect, ConnectionResetError):
            pass


async def process_chunk(chunk, isoLang, send_queue, is_retranscribe=False):
    result = await transcribe_chunk(chunk, isoLang)
    text = result["text"]
    detected_lang = result["language"]

    if text:
        try:
            libreLang = LanguageConverter.convert(detected_lang, "whisper", "libretranslate")
            await send_queue.put({
                "partial_text": text,
                "detected_lang": libreLang,
                "is_retranscribe": is_retranscribe
            })
        except RuntimeError:
            pass


@router.websocket("/transcribe")
async def websocket_transcribe(ws: WebSocket):
    await ws.accept()
    input_lang = ws.query_params.get("lang", "en")
    isoLang = None if input_lang == "auto" else LanguageConverter.convert(input_lang, "libretranslate", "whisper")
    print(f"WebSocket opened with language={isoLang}")

    audio_buffer = b""
    sliding_buffer = b""
    send_queue = asyncio.Queue()
    active_tasks = []

    async def sender():
        while True:
            msg = await send_queue.get()
            if msg is None:
                break
            await safe_send(ws, msg)

    sender_task = asyncio.create_task(sender())

    try:
        while True:
            data = await ws.receive_bytes()
            audio_buffer += data
            sliding_buffer += data

            audio_np = np.frombuffer(audio_buffer, dtype=np.int16).astype(np.float32) / 32768.0

            if len(audio_np) >= CHUNK_SIZE:
                chunk = audio_np[-CHUNK_SIZE:]
                task = asyncio.create_task(process_chunk(chunk, isoLang, send_queue))
                active_tasks.append(task)
                task.add_done_callback(lambda t: active_tasks.remove(t))

                audio_buffer = audio_buffer[-OVERLAP_SIZE:]

            # Retranscribe larger chunk for accuracy
            if len(sliding_buffer) >= RETRANSCRIBE_SIZE:
                large_chunk_np = np.frombuffer(sliding_buffer, dtype=np.int16).astype(np.float32) / 32768.0
                task = asyncio.create_task(process_chunk(large_chunk_np, isoLang, send_queue, is_retranscribe=True))
                active_tasks.append(task)
                task.add_done_callback(lambda t: active_tasks.remove(t))

                # Keep last few seconds for next retranscription
                sliding_buffer = sliding_buffer[-OVERLAP_SIZE:]

    except WebSocketDisconnect:
        print("Client disconnected.")
    finally:
        if active_tasks:
            await asyncio.gather(*active_tasks)

        await send_queue.put({"event": "done"})
        await sender_task

        if ws.application_state == WebSocketState.CONNECTED:
            await ws.close()
        print("WebSocket closed.")