# backend/app/api/websocket_transcribe
"""
Handles real-time audio transcription over WebSocket using the Faster Whisper model.

This module:
    - Listens for incoming audio data chunks via WebSocket
    - Processes and transcribes audio in near real-time
    - Detects the spoken language (if not pre-specified)
    - Sends partial and full transcriptions back to the client

Endpoints:
    /ws/transcribe --> WebSocket route for live transcription
"""

import json
import numpy as np
from faster_whisper import WhisperModel
import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from starlette.websockets import WebSocketState

from app.core.language_codes import LanguageConverter

# Initialize FastAPI router for WebSocket routes
router = APIRouter()

# Constants for Audio Processing
SAMPLE_RATE = 16000         # Expected audio sample rate (Hz)
CHUNK_DURATION_SEC = 2      # Duration of each short chunk (in seconds)
OVERLAP_DURATION_SEC = 0.1  # Overlap between consecutive chunks (in seconds)
RETRANSCRIBE_SEC = 10       # Interval to retranscribe a larger chunk for better accuracy

CHUNK_SIZE = int(SAMPLE_RATE * CHUNK_DURATION_SEC)
OVERLAP_SIZE = int(SAMPLE_RATE * OVERLAP_DURATION_SEC)
RETRANSCRIBE_SIZE = int(SAMPLE_RATE * RETRANSCRIBE_SEC)

# Load Whisper model (base version, optimized for CPU use)
model = WhisperModel("base", device="cpu", compute_type="int8")


async def transcribe_chunk(chunk: np.ndarray, isoLang: str | None):
    """
    Transcribes a single audio chunk using the Whisper model.

    Args:
        chunk (np.ndarray): Audio data array (float32, normalized between -1 and 1)
        isoLang (str | None): ISO language code for transcription language, or None for auto-detect

    Returns:
        dict: {
            "text": str - transcribed text,
            "language": str - detected language code,
            "error": str (optional) - error message if any
        }
    """
    try:
        # Run transcription in a non-blocking background thread
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

    # Combine all recognized text segments into a single string
    text = " ".join([seg.text for seg in segments]).strip()
    detected_lang = info.language
    return {"text": text, "language": detected_lang}


async def safe_send(ws: WebSocket, message: dict):
    """
    Safely sends a JSON message to the WebSocket client.
    Checks that the websocket is still connected before attempting to send

    Args:
        ws (WebSocket): The WebSocket connection instance
        message (dict): Data to send as JSON
    """
    if ws.application_state == WebSocketState.CONNECTED:
        try:
            await ws.send_text(json.dumps(message))
        except (RuntimeError, WebSocketDisconnect, ConnectionResetError):
            # Prevent errors from crashing the connection if the client disconnects
            pass


async def process_chunk(chunk, isoLang, send_queue, is_retranscribe=False):
    """
    Processes and transcribes a chunk of audio, then queues the result for sending.

    Args:
        chunk (np.ndarray): Audio data to transcribe
        isoLang (str): Whisper-compatible language code
        send_queue (asyncio.Queue): Queue to send transcription results to the sender task
        is_retranscribe (bool): Indicates whether this chunk is part of a large retranscription cycle
    """
    result = await transcribe_chunk(chunk, isoLang)
    text = result["text"]
    detected_lang = result["language"]

    if text:
        try:
            # Convert Whisper language code to LibreTranslate format
            libreLang = LanguageConverter.convert(detected_lang, "whisper", "libretranslate")
            # Enqueue partial or retranscribed result for sending
            await send_queue.put({
                "partial_text": text,
                "detected_lang": libreLang,
                "is_retranscribe": is_retranscribe
            })
        except RuntimeError:
            pass


@router.websocket("/transcribe")
async def websocket_transcribe(ws: WebSocket):
    """
    WebSocket endpoint for live transcription.

    Workflow:
        1. Accepts WebSocket connection from the client
        2. Receives audio chunks (PCM16 bytes) continuously
        3. Transcribes short chunks for near real-time feedback
        4. Periodically retranscribes longer segments for improved accuracy
        5. Streams partial and final text results back to the client

    Query Params:
        lang (str): Optional, input language (eg., "en" or "auto" for detection)
    """
    await ws.accept()
    # Retrieve and convert input language
    input_lang = ws.query_params.get("lang", "en")
    isoLang = None if input_lang == "auto" else LanguageConverter.convert(input_lang, "libretranslate", "whisper")
    print(f"WebSocket opened with language={isoLang}")

    # Initialize buffers and queues
    audio_buffer = b""
    sliding_buffer = b""
    send_queue = asyncio.Queue()
    active_tasks = []

    # Internal Task: sender
    async def sender():
        """Continuously sends messages from the send_queue to the WebSocket client."""
        while True:
            msg = await send_queue.get()
            if msg is None:
                break
            await safe_send(ws, msg)

    # Start background sender task
    sender_task = asyncio.create_task(sender())

    try:
        # Continuously receive audio data from the client
        while True:
            data = await ws.receive_bytes()
            audio_buffer += data
            sliding_buffer += data

            # Convert audio bytes to normalized float32 numpy array
            audio_np = np.frombuffer(audio_buffer, dtype=np.int16).astype(np.float32) / 32768.0

            # Process short chunks for low-latency transcription
            if len(audio_np) >= CHUNK_SIZE:
                chunk = audio_np[-CHUNK_SIZE:]
                task = asyncio.create_task(process_chunk(chunk, isoLang, send_queue))
                active_tasks.append(task)
                task.add_done_callback(lambda t: active_tasks.remove(t))

                # Keep overlap to prevent loss of words in between chunks
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
        # Wait for remaining tasks to complete before closing
        if active_tasks:
            await asyncio.gather(*active_tasks)

        # Notify client that transcription is complete
        await send_queue.put({"event": "done"})
        await sender_task

        # Safely close the WebSocket connection
        if ws.application_state == WebSocketState.CONNECTED:
            await ws.close()
        print("WebSocket closed.")