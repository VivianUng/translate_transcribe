import os
import tempfile
import json
import numpy as np
import soundfile as sf
import whisperx
from langdetect import detect, DetectorFactory
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

# pyannote imports
from pyannote.audio import Pipeline

# Fix langdetect nondeterminism
DetectorFactory.seed = 0

router = APIRouter()

# -------- CONFIG --------
DEVICE = "cpu" # check if gpu available, use gpu

ASR_MODEL_NAME = "base"   # or "tiny", "small", "base", "large" depending on resources
ASR_BATCH_SIZE = 1

SAMPLE_RATE = 16000                 # audio sample rate (frontend should send 16k PCM int16)
CHUNK_DURATION_SEC = 2.0            # ASR chunk length (seconds) -> low latency
OVERLAP_DURATION_SEC = 0.2          # overlap to reduce cutoff words (seconds)
DIARIZATION_WINDOW_SEC = 30.0       # accumulate this many seconds before running diarization

CHUNK_SIZE = int(SAMPLE_RATE * CHUNK_DURATION_SEC)
OVERLAP_SIZE = int(SAMPLE_RATE * OVERLAP_DURATION_SEC)
DIAR_SAMPLES = int(SAMPLE_RATE * DIARIZATION_WINDOW_SEC)

# Where to store temporary diarization audio files (ensure writeable)
TMP_DIR = tempfile.gettempdir()

# -------- MODELS (load once) --------
# WhisperX ASR model (wraps whisper)
asr_model = whisperx.load_model(ASR_MODEL_NAME, device=DEVICE, compute_type="float32")

# Alignment model for word-level timestamps
align_model, metadata = whisperx.load_align_model(language_code="en", device=DEVICE)

# Pyannote diarization pipeline (pretrained).
HF_TOKEN = os.environ.get("HF_TOKEN", None)
if HF_TOKEN is None:
    print("Warning: HUGGINGFACE_TOKEN not set. Diarization pipeline may require authentication.")
pyannote_pipeline = Pipeline.from_pretrained("pyannote/speaker-diarization", use_auth_token=HF_TOKEN)


# ------------------ Utility helpers ------------------
def int16_bytes_to_float32_np(buf: bytes) -> np.ndarray:
    """Convert raw int16 PCM bytes to float32 numpy array in range [-1, 1]."""
    arr = np.frombuffer(buf, dtype=np.int16).astype(np.float32) / 32768.0
    return arr


def float32_to_wav_file(np_float32: np.ndarray, path: str, sample_rate: int = SAMPLE_RATE):
    """Write float32 numpy audio to a WAV file path (mono)."""
    sf.write(path, np_float32, sample_rate, format="WAV")


# ------------------ WebSocket handler ------------------
@router.websocket("/ws/transcribe")
async def websocket_transcribe(ws: WebSocket):
    """
    WebSocket streaming handler that:
      - receives Int16 PCM bytes from client (AudioWorklet sends Int16 bytes)
      - accumulates bytes in buffers
      - every CHUNK_SIZE samples -> runs ASR (whisperx) on last CHUNK_SIZE samples
        (optionally align words) and sends partial results (text + per-word timestamps)
      - also accumulates a diarization buffer; when that reaches DIAR_SAMPLES, saves to temp WAV
        and runs pyannote diarization on it; sends diarization segments back to client.
    """
    await ws.accept()
    audio_byte_buffer = b""      # raw bytes (int16 PCM)
    diar_byte_buffer = b""       # buffer for diarization (we keep this separate to accumulate larger window)
    prev_incomplete_word = ""    # carry-over from previous chunk (optional)
    try:
        while True:
            try:
                data = await ws.receive_bytes()
            except WebSocketDisconnect:
                break
            except Exception:
                # client disconnected or error receiving bytes
                break

            # Append incoming raw bytes (assume int16 PCM)
            audio_byte_buffer += data
            diar_byte_buffer += data

            # Convert to float32 array for calculations (do not re-copy too often)
            audio_np = int16_bytes_to_float32_np(audio_byte_buffer)

            # If we have enough samples for one ASR chunk, process it:
            if len(audio_np) >= CHUNK_SIZE:
                # Build chunk: last CHUNK_SIZE samples (we keep overlap by retaining extra samples in buffer)
                chunk = audio_np[-CHUNK_SIZE:]

                # ASR via whisperx (fast). Use asr_model.transcribe on chunk (numpy array accepted)
                # This returns 'segments' and text; we run alignment to get word-level timestamps
                try:
                    # Run ASR
                    asr_result = asr_model.transcribe(chunk, batch_size=ASR_BATCH_SIZE)

                    # `asr_result` contains 'segments' list with .start/.end/.text
                    # Align words (gives per-word timestamps)
                    aligned_result = whisperx.align(asr_result["segments"], align_model, metadata, chunk, device=DEVICE)

                    # Build a list of words with timestamps
                    word_segments = []
                    for seg in aligned_result["segments"]:
                        for w in seg.get("words", []):
                            # word dict: {'word': 'hello', 'start': 0.12, 'end': 0.45}
                            word_segments.append({
                                "word": w["word"],
                                "start": float(w["start"]),
                                "end": float(w["end"]),
                            })

                    # Reconstruct chunk-level text (joined words)
                    chunk_text = " ".join([w["word"] for w in word_segments]).strip()

                except Exception as ex:
                    # If ASR or alignment fails, send an error to client and continue
                    try:
                        await ws.send_text(json.dumps({"error": f"asr_error: {str(ex)}"}))
                    except RuntimeError:
                        break
                    # Trim buffer a little to avoid repeated error on same data
                    keep_samples = CHUNK_SIZE + OVERLAP_SIZE
                    audio_byte_buffer = audio_byte_buffer[-keep_samples * 2 :]
                    continue

                # Language detection on the chunk text (uses langdetect)
                detected_lang = None
                try:
                    if chunk_text.strip():
                        detected_lang = detect(chunk_text)
                except Exception:
                    detected_lang = None

                # Send partial ASR result to client:
                # include: chunk_text, detected_lang, word-level list (with timestamps relative to chunk start)
                payload = {
                    "type": "partial_asr",
                    "text": chunk_text,
                    "language": detected_lang,
                    "words": word_segments,
                }
                try:
                    await ws.send_text(json.dumps(payload))
                except RuntimeError:
                    break

                # Trim the audio_byte_buffer so it retains overlap for next chunk.
                # Keep: CHUNK_SIZE + OVERLAP_SIZE samples (as bytes)
                keep_samples = CHUNK_SIZE + OVERLAP_SIZE
                audio_byte_buffer = audio_byte_buffer[-keep_samples * 2 :]

            # If diarization buffer is long enough, run diarization on it (periodic, heavier op)
            diar_np = int16_bytes_to_float32_np(diar_byte_buffer)
            if len(diar_np) >= DIAR_SAMPLES:
                # Save to temp file for pyannote
                with tempfile.NamedTemporaryFile(suffix=".wav", delete=False, dir=TMP_DIR) as tmpfile:
                    wav_path = tmpfile.name
                try:
                    float32_to_wav = lambda arr, p: sf.write(p, arr, SAMPLE_RATE, format="WAV")
                    float32_to_wav(diar_np, wav_path)

                    # Run pyannote diarization pipeline (this may require HF token)
                    diarization = pyannote_pipeline({"audio": wav_path})
                    # diarization is an Annotation; iterate segments
                    diar_results = []
                    for turn, _, speaker in diarization.itertracks(yield_label=True):
                        diar_results.append({
                            "start": float(turn.start),
                            "end": float(turn.end),
                            "speaker": str(speaker)
                        })

                    # Send diarization result to client
                    try:
                        await ws.send_text(json.dumps({
                            "type": "diarization",
                            "segments": diar_results,
                            "wav_path": os.path.basename(wav_path)
                        }))
                    except RuntimeError:
                        # client closed
                        pass

                except Exception as ex:
                    try:
                        await ws.send_text(json.dumps({"type": "diarization_error", "error": str(ex)}))
                    except RuntimeError:
                        pass
                finally:
                    # remove temp wav file
                    try:
                        os.remove(wav_path)
                    except Exception:
                        pass

                    # clear diarization buffer (or keep some overlap prefer)
                    diar_byte_buffer = b""

    except Exception as e:
        # Unexpected server-side error -- try send error to client else log
        try:
            if ws.client_state.name == "CONNECTED":
                await ws.send_text(json.dumps({"type": "error", "message": str(e)}))
        except Exception:
            pass
        print("Unhandled error in websocket_transcribe:", e)

    finally:
        # close websocket if still open
        try:
            if ws.client_state.name == "CONNECTED":
                await ws.close()
        except Exception:
            pass
