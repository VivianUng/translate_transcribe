# backend/app/api/routes.py

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Request, Form
from pydantic import BaseModel
from typing import Optional
import httpx
from datetime import datetime
import pytesseract
import speech_recognition as sr
from langdetect import detect, detect_langs
from PIL import Image, UnidentifiedImageError
import imageio_ffmpeg as ffmpeg
import io
import logging
import json
import subprocess
from supabase import create_client, Client
import os
from fastapi.security import OAuth2PasswordBearer
from dotenv import load_dotenv
import jwt
from pyannote.audio import Pipeline
from transformers import T5ForConditionalGeneration, T5Tokenizer
# import whisper
# import wave
# import torch
# import tempfile

load_dotenv()

router = APIRouter()

logger = logging.getLogger(__name__)


# Supabase client
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)


class DetectLangRequest(BaseModel):
    text: str

class DetectLangResponse(BaseModel):
    detected_lang: str
    confidence: float

class TranscribeRequest(BaseModel):
    language: str

class TranscribeResponse(BaseModel):
    transcription: str
    language: str

class TranslateRequest(BaseModel):
    text: str
    source_lang: str
    target_lang: str

class TranslateResponse(BaseModel):
    input_text: str
    input_lang: str
    translated_text: str
    output_lang: str

class SummarizeRequest(BaseModel):
    input_text: str
    target_lang: str = "en"

class SummarizeResponse(BaseModel):
    input_text: str
    summarized_text: str
    output_lang: str = "en"

class SaveRequest(BaseModel):
    input_text: str
    input_lang: str
    output_text: str
    output_lang: str

class OCRResponse(BaseModel) :
    extracted_text: str


class TranslationPayload(BaseModel):
    input_text: str
    input_lang: str
    output_text: str
    output_lang: str

class SummaryPayload(BaseModel):
    input_text: str
    output_text: str

class TranscribeSegment(BaseModel):
    speaker: str
    start: float
    end: float
    language: str
    text: str

class Transcribe2Response(BaseModel):
    segments: list[TranscribeSegment]



LIBRETRANSLATE_URL = "http://127.0.0.1:5000"
pytesseract.pytesseract.tesseract_cmd = r"C:\Users\Vivian\AppData\Local\Programs\Tesseract-OCR\tesseract.exe"

def get_current_user(request: Request):
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid Authorization header",
        )

    token = auth_header.split(" ")[1]

    try:
        user = supabase.auth.get_user(token).user
        if user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token",
            )
        return user
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {str(e)}",
        )


@router.post("/save-translation")
async def save_translation(payload: TranslationPayload, current_user = Depends(get_current_user)):
    """
    Save translation for authenticated user
    """
    try:
        result = supabase.table("translations").insert({
            "user_id": current_user.id,
            "input_text": payload.input_text,
            "input_lang": payload.input_lang,
            "output_text": payload.output_text,
            "output_lang": payload.output_lang,
            "created_at": "now()"
        }).execute()

        return {"message": "Translation saved successfully!"}

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to save translation: {e}")
    
@router.post("/save-summary")
async def save_summary(payload: SummaryPayload, current_user = Depends(get_current_user)):
    """
    Save summary for authenticated user
    """
    try:
        result = supabase.table("summaries").insert({
            "user_id": current_user.id,
            "input_text": payload.input_text,
            "output_text": payload.output_text,
            "created_at": "now()"
        }).execute()

        return {"message": "Summary saved successfully!"}

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to save summary: {e}")
    
    
@router.post("/delete-account")
async def delete_account(current_user=Depends(get_current_user)):
    """
    Delete user account (all related rows + profile + auth user)
    """
    try:
        user_id = current_user.id

        # 1. Delete dependent rows (adjust for your schema)
        supabase.table("translations").delete().eq("user_id", user_id).execute()
        supabase.table("summaries").delete().eq("user_id", user_id).execute()
        #supabase.table("conversations").delete().eq("user_id", user_id).execute()
        #deletion for meeting will be dependent on meeting table strucutre
        # add more tables

        # 2. Delete profile
        supabase.table("profiles").delete().eq("id", user_id).execute()

        # 3. Delete auth user
        supabase.auth.admin.delete_user(user_id)

        return {"message": "Account deleted successfully"}

    except Exception as e:
        raise HTTPException(
            status_code=400, detail=f"Failed to delete account: {str(e)}"
        )


@router.get("/languages")
async def get_languages():
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(f"{LIBRETRANSLATE_URL}/languages")
            response.raise_for_status()
            data = response.json()
            # LibreTranslate returns [{"code": "en", "name": "English"}, ...]
            # Map to {code, label}
            return [{"code": lang["code"], "label": lang["name"]} for lang in data]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch languages: {str(e)}")

@router.post("/detect-language", response_model=DetectLangResponse)
async def detect_language(req: DetectLangRequest):
    async with httpx.AsyncClient() as client:
        detect_resp = await client.post(
            f"{LIBRETRANSLATE_URL}/detect",
            json={"q": req.text},
            timeout=10,
        )
        detect_resp.raise_for_status()
        detections = detect_resp.json()

        if not detections:
            raise HTTPException(status_code=400, detail="Could not detect language")

        best_match = detections[0]
        return DetectLangResponse(
            detected_lang=best_match["language"],
            confidence=best_match["confidence"],
        )

# for testing : second version of detect-lang 
@router.post("/detect-language2", response_model=DetectLangResponse)
async def detect_language2(req: DetectLangRequest):
    try:
        # langdetect can return multiple candidates with probabilities
        candidates = detect_langs(req.text)

        if not candidates:
            raise HTTPException(status_code=400, detail="Could not detect language")

        # pick the best match (highest probability)
        best_match = candidates[0]

        return DetectLangResponse(
            detected_lang=best_match.lang,
            confidence=best_match.prob *100 #prob is out of 1 (libretranslate out of 100)
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Language detection failed: {str(e)}")



@router.post("/translate", response_model=TranslateResponse)
async def translate(
    req: TranslateRequest,
):
    async with httpx.AsyncClient() as client:
        # Directly call translation since frontend already detected source_lang
        translate_resp = await client.post(
            f"{LIBRETRANSLATE_URL}/translate",
            json={
                "q": req.text,
                "source": req.source_lang,
                "target": req.target_lang,
                "format": "text",
            },
            timeout=10,
        )
        translate_resp.raise_for_status()
        translated = translate_resp.json().get("translatedText")

    return TranslateResponse(
        input_text=req.text,
        input_lang=req.source_lang,
        translated_text=translated,
        output_lang=req.target_lang,
    )

@router.post("/summarize", response_model=SummarizeResponse)
async def summarize(req: SummarizeRequest):
    # Load T5 model and tokenizer once
    MODEL_NAME = "t5-small"
    tokenizer = T5Tokenizer.from_pretrained(MODEL_NAME)
    model = T5ForConditionalGeneration.from_pretrained(MODEL_NAME)

    if not req.input_text.strip():
        raise HTTPException(status_code=400, detail="Input text is required.")

    try:
        # Prepare T5 input
        input_str = "summarize: " + req.input_text

        # Tokenize (increase max_length for long transcripts)
        inputs = tokenizer.encode(
            input_str, return_tensors="pt", max_length=1024, truncation=True
        )

        # Generate summary
        outputs = model.generate(
            inputs,
            max_length=150,
            min_length=50,
            length_penalty=2.0,
            num_beams=4,
            early_stopping=True
        )

        summary = tokenizer.decode(outputs[0], skip_special_tokens=True)

        if not summary.strip():
            raise HTTPException(status_code=500, detail="Failed to generate summary.")

        return SummarizeResponse(
            input_text=req.input_text,
            summarized_text=summary,
            output_lang=req.target_lang,
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to summarize text: {str(e)}")

@router.post("/extract-text", response_model=OCRResponse)
async def extract_text(file: UploadFile = File(...)):
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Invalid file type. Please upload an image.")

    try:
        contents = await file.read()
        if not contents:
            raise HTTPException(status_code=400, detail="Empty file uploaded")

        try:
            image = Image.open(io.BytesIO(contents)).convert("RGB")
        except UnidentifiedImageError:
            raise HTTPException(status_code=400, detail="Could not process image file")

        extracted_text = pytesseract.image_to_string(image)
        return OCRResponse(extracted_text=extracted_text.strip())

    except Exception as e:
        logger.exception("OCR failed")
        raise HTTPException(status_code=500, detail=f"Text extraction failed: {str(e)}")
    

# # for testing purpose (after complete recording then transcribe) : 
@router.post("/transcribe")
async def transcribe_audio(file: UploadFile = File(...)):
    recognizer = sr.Recognizer()
    try:
        # Read uploaded audio (WebM)
        input_data = await file.read()

        # Convert WebM/Opus → WAV using ffmpeg
        process = subprocess.Popen(
            [ffmpeg.get_ffmpeg_exe(), "-i", "pipe:0", "-f", "wav", "-ar", "16000", "-ac", "1", "pipe:1"],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL
        )
        wav_data, _ = process.communicate(input=input_data)

        # Transcribe
        audio_file = io.BytesIO(wav_data)
        with sr.AudioFile(audio_file) as source:
            audio = recognizer.record(source)
        text = recognizer.recognize_google(audio)

        return {"transcription": text}
    except sr.UnknownValueError:
        return {"transcription": ""}
    except Exception as e:
        return {"error": str(e)}

# diarization_pipeline = Pipeline.from_pretrained("pyannote/speaker-diarization", use_auth_token=os.getenv("HF_TOKEN"))
# whisper_model = whisper.load_model("base")  # use "tiny" or "base" for lighter
# @router.post("/transcribe2", response_model=Transcribe2Response)
# async def transcribe2(
#     file: UploadFile = File(...),
#     user_lang: str = Form("auto")  # "auto" or "en-US", "fr-FR", etc
# ):
#     try:
#         # --- Step 1: Read audio & convert to WAV ---
#         input_data = await file.read()
#         with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp_wav:
#             process = subprocess.Popen(
#                 ["ffmpeg", "-i", "pipe:0", "-f", "wav", "-ar", "16000", "-ac", "1", tmp_wav.name],
#                 stdin=subprocess.PIPE,
#                 stdout=subprocess.PIPE,
#                 stderr=subprocess.DEVNULL,
#             )
#             process.communicate(input=input_data)
#             wav_path = tmp_wav.name

#         # --- Step 2: Speaker diarization ---
#         diarization = diarization_pipeline(wav_path)

#         # --- Step 3: Process each segment ---
#         recognizer = sr.Recognizer()
#         results = []

#         for turn, _, speaker in diarization.itertracks(yield_label=True):
#             start_time = turn.start
#             end_time = turn.end

#             # Extract segment audio
#             with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as seg_file:
#                 with wave.open(wav_path, "rb") as full_wav:
#                     params = full_wav.getparams()
#                     framerate = full_wav.getframerate()
#                     start_frame = int(start_time * framerate)
#                     end_frame = int(end_time * framerate)
#                     full_wav.setpos(start_frame)
#                     frames = full_wav.readframes(end_frame - start_frame)

#                     with wave.open(seg_file.name, "wb") as seg_wav:
#                         seg_wav.setparams(params)
#                         seg_wav.writeframes(frames)

#                 seg_path = seg_file.name

#             # --- Step 4: Transcription ---
#             seg_text, seg_lang = "", ""

#             if user_lang != "auto":
#                 with sr.AudioFile(seg_path) as source:
#                     audio = recognizer.record(source)
#                 try:
#                     seg_text = recognizer.recognize_google(audio, language=user_lang)
#                     seg_lang = user_lang
#                 except Exception:
#                     seg_text = "[Google failed]"
#                     seg_lang = user_lang
#             else:
#                 result = whisper_model.transcribe(seg_path)
#                 seg_text = result["text"]
#                 seg_lang = result["language"]

#             results.append(
#                 TranscribeSegment(
#                     speaker=speaker,
#                     start=start_time,
#                     end=end_time,
#                     language=seg_lang,
#                     text=seg_text,
#                 )
#             )

#         return Transcribe2Response(segments=results)

#     except Exception as e:
#         raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")
#     finally:
#         if os.path.exists(wav_path):
#             os.remove(wav_path)