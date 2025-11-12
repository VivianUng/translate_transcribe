# backend/app/api/routes_actions.py
"""
This module defines the main FastAPI routes for the AI-Enhanced Live Transcription & Translation System.

It provides endpoints for:
- Language Detection
- Translation
- Transcription (Speech-to-Text)
- Text Summarization
- Text Extraction (OCR and document files)
- PDF Report Generation
"""

# FastAPI Imports
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

# Asynchronous & HTTP Client
import asyncio
import httpx # Used for calling external APIs like LibreTranslate

# Utility Libraries
import tempfile # For creating temporary files (PDF)
import io
import subprocess
import os
import re
from dotenv import load_dotenv

# OCR & Document Processing
import pytesseract # Optical Character Recognition (OCR) for images
import fitz # PyMuPDF: Extract text from PDFs
import docx # Extract text from Word (.docx) files

# Audio Processing & Speech Recognition
import speech_recognition as sr # Google Speech Recognition
import imageio_ffmpeg as ffmpeg # FFmpeg wrapper for audio format conversion

# Language Detection
from langdetect import detect_langs
import regex

# Image Handling
from PIL import Image, UnidentifiedImageError

# Transformer for Summarization
from transformers import (
    AutoModelForSeq2SeqLM, 
    AutoTokenizer, 
    T5ForConditionalGeneration, 
    T5Tokenizer)

# Import Custom Modules
from app.core.pdf_generator import generate_pdf
from app.core.language_codes import LanguageConverter
# Pydantic Request and Response Models for FastAPI
from app.models import DetectLangRequest, DetectLangResponse, OCRResponse, SummarizeRequest, SummarizeResponse, TranscribeResponse, TranslateRequest, TranslateResponse, PDFRequest


load_dotenv() # Load API keys, URLs, and configuration from .env
router = APIRouter() # FastAPI Router Instance

# Get environment variables
LIBRETRANSLATE_URL = os.environ.get("LIBRETRANSLATE_URL")
pytesseract.pytesseract.tesseract_cmd = os.environ.get("TESSERACT_PATH")

# Load once when the app starts
t5_tokenizer = T5Tokenizer.from_pretrained("t5-small")
t5_model = T5ForConditionalGeneration.from_pretrained("t5-small")

# Long input model (handles bigger context)
long_tokenizer = AutoTokenizer.from_pretrained("google/long-t5-tglobal-base")
long_model = AutoModelForSeq2SeqLM.from_pretrained("google/long-t5-tglobal-base")

# Global variable to cache supported languages after first fetch
LANG_MAP = None
# Lock to prevent multiple concurrent language fetches (race condition protection)
_LANGS_LOCK = asyncio.Lock()

async def fetch_languages():
    """
    Fetch the list of supported languages from the LibreTranslate API.

    This function sends an asynchronous GET request to the /languages endpoint
    of the LibreTranslate server, then formats the response to a simplified list
    of dictionaries containing 'code' and 'label' keys.

    Returns:
        list[dict]: A list of supported languages, e.g. [{"code": "en", "label": "English"}, ...]
    """
    print("Getting Languages")
    async with httpx.AsyncClient() as client:
        # Send GET request to LibreTranslate to retrieve supported languages
        response = await client.get(f"{LIBRETRANSLATE_URL}/languages")
        response.raise_for_status()
        data = response.json()
        # LibreTranslate returns [{"code": "en", "name": "English"}, ...]
        # Map to {code, label}
        return [{"code": lang["code"], "label": lang["name"]} for lang in data]

async def get_supported_langs():
    """
    Retrieve cached list of supported languages, or fetch it if not yet loaded.

    This uses a global cache (LANG_MAP) to avoid repeatedly calling the API.
    If multiple requests come at once, the asyncio.Lock ensures only one
    fetch happens at a time.

    Returns:
        list[dict]: Cached or freshly fetched list of supported languages.
    """
    global LANG_MAP
    if LANG_MAP is None:
        # Acquire lock to ensure only one coroutine fetches languages at a time
        async with _LANGS_LOCK:
            # Double-check inside lock to avoid race conditions
            if LANG_MAP is None:
                LANG_MAP = await fetch_languages()
    return LANG_MAP


@router.get("/languages")
async def get_languages():
    """
    FastAPI endpoint: GET /languages
    Returns a list of supported languages from LibreTranslate, using cache.

    Returns:
        JSON response: List of supported languages
    Raises:
        HTTPException(500): If fetching languages from LibreTranslate fails.
    """
    try:
        # Retrieve supported languages (cached or freshly fetched)
        langs = await get_supported_langs()   # returns cached LANG_MAP i favailable
        return langs
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch languages: {str(e)}")


def detect_script(text: str):
    """
    Detect the dominant writing script (e.g., Chinese, Korean, Arabic, etc.) in a given text.

    This function uses Unicode script detection via regex to estimate which script
    the text most likely belongs to. It counts occurrences of different script
    character ranges (Han, Hangul, Devanagari, etc.) and determines which script
    is the majority based on proportional frequency.

    Args:
        text (str): Input text to analyze.

    Returns:
        str | None: 
            - The detected script/language code (e.g. "zh-Hans", "ko", "ar", "latin", etc.)
            - "latin" if none of the non-Latin scripts dominates (latin is the most common script type)
            - None if the input is empty or contains only whitespace (invalid input)
    """
    if not text.strip():
        return None  # empty/whitespace case

    # Count occurrences of different script character types in the text
    counts = {
        "zh-Hans": len(regex.findall(r'\p{Han}', text)),    # Chinese (Han characters)
        "ko": len(regex.findall(r'\p{Hangul}', text)),      # Korean (Hangul)
        "ja": len(regex.findall(r'\p{Hiragana}', text)) +
              len(regex.findall(r'\p{Katakana}', text)),    # Japanese (Hiragana + Katakana)
        "he": len(regex.findall(r'\p{Hebrew}', text)),      # Hebrew
        "ar": len(regex.findall(r'\p{Arabic}', text)),      # Arabic Script : Arabic, Urdu, Persian
        "hi": len(regex.findall(r'\p{Devanagari}', text)),  # Hindi (Devanagari)
        "bn": len(regex.findall(r'\p{Bengali}', text)),     # Bengali
        "th": len(regex.findall(r'\p{Thai}', text)),        # Thai
        "cyrl": len(regex.findall(r'\p{Cyrillic}', text)),  # Cyrillic Script : bg, ky, ru, uk
        "el": len(regex.findall(r'\p{Greek}', text))        # Greek
    }

    total = len(text)  # Total number of characters in input
    if total == 0:
        return None # No characters to analyze

    # Calculate proportions
    proportions = {k: v / total for k, v in counts.items() if total > 0}

    # Pick the script with the highest proportion above threshold
    best_lang, best_prop = max(proportions.items(), key=lambda x: x[1], default=(None, 0))

    # If the dominant script occupies more than 60% of the text, return it
    if best_prop > 0.6:
        return best_lang

    return "latin" # default to Latin script

@router.post("/detect-language", response_model=DetectLangResponse)
async def detect_language(req: DetectLangRequest):
    """
    FastAPI Endpoint: POST /detect-language

    Detects the most likely language of the provided text using a hybrid approach:
    1. Unicode script detection (fast)
    2. detection via LibreTranslate
    3. detection using the `langdetect` library
    4. Combines results using confidence thresholds and heuristic rules

    Args:
        req (DetectLangRequest): Request body containing the text to analyze.

    Returns:
        DetectLangResponse: Contains the detected language code (in LibreTranslate format)
                            and a confidence score (0–100).

    Raises:
        HTTPException(400): If the system is unable to confidently determine a language.
    """
    libre_result = None
    langdetect_result = None

    # 1. Script detection (quick check based on character Unicode ranges)
    script_lang = detect_script(req.text)

    # If a non-Latin script is detected, handle or return immediately
    if script_lang and script_lang != "latin":
        if script_lang in {"ar", "cyrl"}:
            # Special case: Arabic script could be Arabic, Urdu, or Persian
            # Continue with detection using LibreTranslate & langdetect
            pass
        else:
            # If clear script detected, return directly
            return DetectLangResponse(
                detected_lang=script_lang,
                confidence=100.0
            )

    # 2. LibreTranslate detection
    try:
        async with httpx.AsyncClient() as client:
            detect_resp = await client.post(
                f"{LIBRETRANSLATE_URL}/detect",
                json={"q": req.text},
                timeout=10,
            )
            detect_resp.raise_for_status()
            detections = detect_resp.json()
            if detections:
                best = detections[0]
                libre_result = {
                    "lang": best["language"],
                    "confidence": best["confidence"],
                }
    except Exception:
        pass

    # 3. Langdetect detection
    try:
        candidates = detect_langs(req.text)
        if candidates:
            best = candidates[0] # Frist item is with the highest confidence
            # Convert to LibreTranslate-compatible code
            langdetect_result = {
                "lang": LanguageConverter.convert(best.lang, "langdetect", "libretranslate"),
                "confidence": best.prob * 100,  # Convert probability to %
            }
    except Exception:
        pass
    
    # Retrieve supported language codes from LibreTranslate (cached)
    supported_langs = set(lang["code"] for lang in await get_supported_langs())
    # langdetect sometimes returns languages not supported by LibreTranslate
    LANGDETECT_EXCEPTIONS = {"az", "eu", "eo", "gl", "ga", "ky", "ms"}

    # If langdetect detects an unsupported language, mark it separately
    if langdetect_result and langdetect_result["lang"] not in supported_langs:
        langdetect_result_unsupported = langdetect_result
        langdetect_result = None

    # 4. Decision logic
    chosen = None
    if libre_result and langdetect_result:
        if libre_result["lang"] == langdetect_result["lang"]:
            # Same language then take higher confidence
            chosen = max([libre_result, langdetect_result], key=lambda x: x["confidence"])
        else:
            # langdetect exception cases
            if libre_result["lang"] in LANGDETECT_EXCEPTIONS :
                chosen = libre_result
            # Different language detected by both
            elif libre_result["confidence"] > 85 and langdetect_result["confidence"] > 85:
                # Both high confidence but disagree likely is garbage input
                chosen = {"lang": "und", "confidence": 0}
            elif len(req.text.strip()) < 20:
                # For short input, trust langdetect more
                chosen = langdetect_result
            else:
                # Otherwise, trust libretranslate
                chosen = libre_result

    elif libre_result and libre_result.get("confidence", 0) > 0:
        # Only LibreTranslate succeeded
        chosen = libre_result

    elif langdetect_result:
        # Only langdetect succeeded
        chosen = langdetect_result

    elif langdetect_result_unsupported:
        # langdetect result unsupported by LibreTranslate 
        # indicate 0 confidence to differentiate unsupported language detected
        chosen = {"lang": langdetect_result_unsupported["lang"], "confidence": 0}

    else:
        raise HTTPException(status_code=400, detail="Could not detect language")
    
    # Special handling for Arabic/Urdu
    # restrict result to Arabic, Urdu, or Persian
    if script_lang == "ar":
        if chosen["lang"] not in {"ar", "ur", "fa"}:
            chosen = {"lang": "ar", "confidence": -1}
    
    # Special handling for Cyrillic
    # restrict to supported Cyrillic languages
    if script_lang == "cyrl":
        if chosen["lang"] not in {"ru", "uk", "bg", "ky"}:
            chosen = {"lang": "ru", "confidence": -1}

    return DetectLangResponse(
        detected_lang=chosen["lang"],
        confidence=chosen["confidence"],
    )





@router.post("/translate", response_model=TranslateResponse)
async def translate(req: TranslateRequest,):
    """
    FastAPI Endpoint: POST /translate

    Translates input text from a source language to a target language
    using the LibreTranslate API.

    This endpoint acts as a proxy between the client and the translation API,
    handling request formatting, API calling, and structured response delivery.

    Args:
        req (TranslateRequest): Request body containing:
            - text (str): The text to translate
            - source_lang (str): Source language code (e.g. 'en')
            - target_lang (str): Target language code (e.g. 'fr')

    Returns:
        TranslateResponse: Contains both input and translated text along with
                           the respective language codes.

    Raises:
        HTTPException(500): If the translation service fails or is unreachable.
    """
    # Create an asynchronous HTTP client for non-blocking I/O
    async with httpx.AsyncClient() as client:
        # Send POST request to LibreTranslate's /translate endpoint
        translate_resp = await client.post(
            f"{LIBRETRANSLATE_URL}/translate",
            json={
                "q": req.text,
                "source": req.source_lang,
                "target": req.target_lang,  
                "format": "text",           # Specify plain text (not HTML)
            },
            timeout=10, # Timeout in seconds for API response
        )
        translate_resp.raise_for_status()
        # Parse the translated text from the API response
        translated = translate_resp.json().get("translatedText")

    # Return structured response to client
    return TranslateResponse(
        input_text=req.text,
        input_lang=req.source_lang,
        translated_text=translated,
        output_lang=req.target_lang,
    )


# Dynamically selects a summarization model based on input length.
@router.post("/summarize", response_model=SummarizeResponse)
async def summarize(req: SummarizeRequest):
    """
    FastAPI Endpoint: POST /summarize

    Generates a concise summary of the given input text using an AI language model.
    The system automatically selects an appropriate summarization model (T5 or LongT5)
    based on the input text length to ensure efficiency and accuracy.

    Args:
        req (SummarizeRequest): Request body containing:
            - input_text (str): The text content to summarize.

    Returns:
        SummarizeResponse: Contains both the original input and the generated summary.

    Raises:
        HTTPException(400): If input text is missing or empty.
        HTTPException(500): If summarization fails or model inference encounters an error.
    """
    # 1. Validate Input
    if not req.input_text.strip():
        raise HTTPException(status_code=400, detail="Input text is required.")

    try:
        input_text = req.input_text
        char_length = len(input_text) # Character count for model selection

        # 2. Decide which model to use
        # Use a lightweight model (T5) for short text; use LongT5 for longer documents
        if char_length <= 4000:  # short input
            tokenizer, model = t5_tokenizer, t5_model
            input_str = "summarize: " + input_text
        else:  # long input
            tokenizer, model = long_tokenizer, long_model
            input_str = "summarize: " + input_text

        # 3. Tokenize input text
        # Converts text into model-readable tokens, truncating if exceeds max length
        inputs = tokenizer.encode(
            input_str, return_tensors="pt", max_length=4096, truncation=True
        )
        input_length = inputs.shape[1]

        # 4. Determine Dynamic summary length
        # Adjusts min/max summary length proportionally to input size
        min_len = max(30, int(input_length * 0.1))  # At least 30 tokens or 10% of input
        max_len = min(500, int(input_length * 0.3)) # At most 500 tokens or 30% of input

        # 5. Generate summary using beam search
        outputs = model.generate(
            inputs,
            max_length=max_len,
            min_length=min_len,
            length_penalty=2.0,  # Encourages concise output
            num_beams=4,         # Beam search for better summaries
            early_stopping=True
        )

        # 6. Decode model output into readable text
        summary = tokenizer.decode(outputs[0], skip_special_tokens=True)

        # Validate that summary is not empty
        if not summary.strip():
            raise HTTPException(status_code=500, detail="Failed to generate summary.")

        return SummarizeResponse(
            input_text=req.input_text,
            summarized_text=summary,
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to summarize text: {str(e)}")



@router.post("/extract-image-text", response_model=OCRResponse)
async def extract_text(
    file: UploadFile = File(...),
    input_language: str = Form(...)
):
    """
    FastAPI Endpoint: POST /extract-image-text

    Performs Optical Character Recognition (OCR) on an uploaded image to extract text.
    Uses Tesseract OCR to process the image in the specified language.

    Args:
        file (UploadFile): The uploaded image file (e.g., PNG, JPEG).
        input_language (str): Language code of the text in the image (in LibreTranslate format).

    Returns:
        OCRResponse: Contains the extracted text from the image.

    Raises:
        HTTPException(400): If the file is not an image or the image cannot be processed.
        HTTPException(500): If OCR extraction fails unexpectedly.
    """
    # 1. Validate file type
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Invalid file type. Please upload an image.")

    # 2. Read uploaded file content
    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Empty file uploaded")

    try:
        # 3. Convert input language code from libretranslate (iso639) to tesseract code (bcp47)
        lang_tess = LanguageConverter.convert(input_language, "libretranslate", "tesseract")

        # 4. Load image into Pillow
        # Convert image to RGB mode to ensure Tesseract compatibility
        img_raw = Image.open(io.BytesIO(contents)).convert("RGB")
        # 5. OCR using tesseract
        extracted_text = pytesseract.image_to_string(img_raw, lang=lang_tess).strip()

        if lang_tess in ['chi_sim', 'chi_tra', 'jpn', 'kor']: # CJK characters
            extracted_text = extracted_text.replace(" ", "") # remove extra spaces

    except UnidentifiedImageError:
        raise HTTPException(status_code=400, detail="Could not process image file")

    return OCRResponse(extracted_text=extracted_text)


@router.post("/extract-doc-text")
async def extract_doc_text(
    file: UploadFile = File(...),
    input_language: str = Form(...)
):
    """
    FastAPI Endpoint: POST /extract-doc-text

    Extracts text content from uploaded document files (PDF, DOCX, or TXT)
    The endpoint supports multilingual text extraction, preparing data for translation or summarization.

    Args:
        file (UploadFile): The uploaded document file (.pdf, .docx, or .txt).
        input_language (str): The language of the document content (in LibreTranslate format).

    Returns:
        dict: {
            "extracted_text": <string of text content>,
            "input_language": <language code>
        }

    Raises:
        HTTPException(400): If the file type is unsupported or no text is extracted.
        HTTPException(500): For unexpected internal errors during processing.
    """
    try:
        content = "" # Initialize a string to store extracted text
        
        # 1. Handle PDF File content extraction
        if file.filename.endswith(".pdf"):
            # Use PyMuPDF (fitz) to read and extract text from all pages
            pdf_document = fitz.open(stream=file.file.read(), filetype="pdf")
            for page in pdf_document:
                content += page.get_text("text")

        # 2. Handle docx File content extraction
        elif file.filename.endswith(".docx"):
            # Use python-docx to extract each paragraph from docx file
            doc = docx.Document(file.file)
            for para in doc.paragraphs:
                content += para.text + "\n"

        # 3. Handle plain text file (.txt)
        elif file.filename.endswith(".txt"):
            # Decode the file bytes safely to text
            content = (await file.read()).decode("utf-8", errors="ignore")

        # Unsupported File Type
        else:
            raise HTTPException(status_code=400, detail="Unsupported document type")

        if not content.strip():
            raise HTTPException(status_code=400, detail="No text extracted from document")

        return {"extracted_text": content, "input_language": input_language}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/generate-pdf")
async def generate_pdf_route(request: PDFRequest):
    """
    FastAPI Endpoint: POST /generate-pdf

    Generates a downloadable PDF document from the provided text content.

    Args:
        request (PDFRequest): A request model containing the 'content' field (dict with input and output).

    Returns:
        FileResponse: A downloadable PDF file response.

    Raises:
        HTTPException(500): If PDF generation or file handling fails.
    """

    try:
        # 1. Create a temporary file
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp_file:
            tmp_filename = tmp_file.name

        # Generate the PDF
        generate_pdf(request.content, tmp_filename)

        # Return as downloadable response
        return FileResponse(
            tmp_filename,
            media_type="application/pdf",
            filename="translation_output.pdf",
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))



@router.post("/transcribe")
async def transcribe_audio(
    file: UploadFile = File(...),
    input_language: str = Form(...)
):
    """
    FastAPI Endpoint: POST /transcribe

    Converts uploaded audio (.webm) into text using Google Speech Recognition.

    Args: 
        file (UploadFile): The uploaded audio file (.webm) (Converted in frontend)
        input_language (str): The language of the audio speech content (in LibreTranslate format)  
    
    Returns:
        TranscribeResponse: 
            transcription: Contains the transcription of the speech detected in audio file.
            language: language used for speech detection
    """
    # 1. convert libretranslate code (iso-639) to recognize_google code(bcp-47)
    input_language_bcp = LanguageConverter.convert(input_language, "libretranslate", "bcp47")

    recognizer = sr.Recognizer()
    try:
        # 2. Read uploaded audio (WebM)
        input_data = await file.read()

        # 3. Convert WebM/Opus to WAV (for recognize_google supported format) using ffmpeg
        process = subprocess.Popen(
            [ffmpeg.get_ffmpeg_exe(), "-i", "pipe:0", "-f", "wav", "-ar", "16000", "-ac", "1", "pipe:1"],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL
        )
        wav_data, _ = process.communicate(input=input_data)

        
        audio_file = io.BytesIO(wav_data)

        # 4. Transcribe
        with sr.AudioFile(audio_file) as source:
            audio = recognizer.record(source)

        # Recognize speech (with specified or default language)
        text = recognizer.recognize_google(audio, language=input_language_bcp)

        return TranscribeResponse(
            transcription=text,
            language=input_language_bcp
        )

    except sr.UnknownValueError:
        # Return empty transcription if speech not recognized
        return TranscribeResponse(transcription="",language=input_language_bcp)
    
    except sr.RequestError as e:
        # Google API request error
        raise HTTPException(status_code=502, detail=f"Speech recognition service error: {str(e)}")

    except Exception as e:
        return TranscribeResponse(transcription=f"Error: {str(e)}",language=input_language_bcp)