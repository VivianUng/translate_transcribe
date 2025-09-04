# backend/app/api/routes.py

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from pydantic import BaseModel
from typing import Optional
import httpx
from app.api.dependencies import get_current_user_optional, get_current_user
from app.db.models import Translation
from app.db.database import database
from datetime import datetime
import pytesseract
from PIL import Image, UnidentifiedImageError
import io
import logging

router = APIRouter()

logger = logging.getLogger(__name__)

class DetectLangRequest(BaseModel):
    text: str


class DetectLangResponse(BaseModel):
    detected_lang: str
    confidence: float

class TranslateRequest(BaseModel):
    text: str
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

LIBRETRANSLATE_URL = "http://127.0.0.1:5000"
pytesseract.pytesseract.tesseract_cmd = r"C:\Users\Vivian\AppData\Local\Programs\Tesseract-OCR\tesseract.exe"

@router.get("/languages")
async def get_languages():
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(f"{LIBRETRANSLATE_URL}/languages")
            response.raise_for_status()
            data = response.json()
            # LibreTranslate returns [{"code": "en", "name": "English"}, ...]
            # Map to {code, label} for your frontend
            return [{"code": lang["code"], "label": lang["name"]} for lang in data]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch languages: {str(e)}")

@router.post("/detect-language", response_model=DetectLangResponse)
async def detect_language(req: DetectLangResponse):
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

        best_match = detections[0]  # usually highest confidence
        return DetectLangResponse(
            detected_lang=best_match["language"],
            confidence=best_match["confidence"],
        )


@router.post("/translate", response_model=TranslateResponse)
async def translate(
    req: TranslateRequest,
    user: Optional[dict] = Depends(get_current_user_optional),
):
    # Call LibreTranslate API to auto-detect and translate
    async with httpx.AsyncClient() as client:
        # Detect language
        detect_resp = await client.post(
            f"{LIBRETRANSLATE_URL}/detect",
            json={"q": req.text},
            timeout=10,
        )
        detect_resp.raise_for_status()
        detections = detect_resp.json()
        if not detections:
            raise HTTPException(status_code=400, detail="Could not detect language")
        detected_lang = detections[0]["language"]

        # Translate
        translate_resp = await client.post(
            f"{LIBRETRANSLATE_URL}/translate",
            json={
                "q": req.text,
                "source": detected_lang,
                "target": req.target_lang,
                "format": "text",
            },
            timeout=10,
        )
        translate_resp.raise_for_status()
        translated = translate_resp.json().get("translatedText")

    return TranslateResponse(
        input_text=req.text,
        input_lang=detected_lang,
        translated_text=translated,
        output_lang=req.target_lang,
    )

@router.post("/save", status_code=201)
async def save_translation(
    req: SaveRequest,
    current_user=Depends(get_current_user),
):
    query = Translation.__table__.insert().values(
        user_id=current_user["id"],
        source_text=req.input_text,
        source_lang=req.input_lang,
        translated_text=req.output_text,
        target_lang=req.output_lang,
        created_at=datetime.utcnow(),
    )
    await database.execute(query)
    return {"message": "Translation saved successfully"}

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