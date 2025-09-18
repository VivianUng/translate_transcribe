import io
import subprocess
import tempfile
import ffmpeg
import numpy as np
import soundfile as sf
from pydub import AudioSegment
from pydub.effects import normalize
import noisereduce as nr


def preprocess_audio(webm_bytes: bytes) -> io.BytesIO:
    """
    Preprocess audio from a .webm file.
    Steps:
    1. Convert WebM → WAV (mono, 16kHz) using ffmpeg
    2. Normalize volume
    3. Mild noise reduction
    Returns a BytesIO containing WAV audio.
    """
    # --- Step 1: Convert WebM → WAV ---
    process = subprocess.Popen(
        [ffmpeg.get_ffmpeg_exe(), "-i", "pipe:0", "-f", "wav", "-ar", "16000", "-ac", "1", "pipe:1"],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL
    )
    wav_data, _ = process.communicate(input=webm_bytes)

    ##################################################
    audio_file = io.BytesIO(wav_data)
    audio_file.seek(0)
    return audio_file
    #####################################################

    # # --- Step 2: Load WAV as AudioSegment for normalization ---
    # audio_segment = AudioSegment.from_file(io.BytesIO(wav_data), format="wav")
    # audio_segment = normalize(audio_segment)  # normalize volume

    # # --- Step 3: Convert AudioSegment → numpy for noise reduction ---
    # samples = np.array(audio_segment.get_array_of_samples())
    # reduced_noise = nr.reduce_noise(y=samples, sr=audio_segment.frame_rate)

    # # --- Step 4: Export back to BytesIO ---
    # out_io = io.BytesIO()
    # sf.write(out_io, reduced_noise, samplerate=audio_segment.frame_rate, format="WAV")
    # out_io.seek(0)

    # return out_io
