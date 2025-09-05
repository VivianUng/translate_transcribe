# backend/app/api/routes.py

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Request
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
