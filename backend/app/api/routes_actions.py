from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
import httpx # libretranslate
import pytesseract
from paddleocr import PaddleOCR
import numpy as np
import fitz # pdf
import docx
import speech_recognition as sr
from langdetect import detect_langs
from PIL import Image, UnidentifiedImageError
import imageio_ffmpeg as ffmpeg
import io
import subprocess
import os
from dotenv import load_dotenv
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer, T5ForConditionalGeneration, T5Tokenizer

from app.core.pdf_generator import generate_pdf
from app.core.image_preprocessing import process_image_for_ocr
from app.core.audio_preprocessing import preprocess_audio
from app.core.language_codes import LanguageConverter
from app.models import DetectLangRequest, DetectLangResponse, OCRResponse, SummarizeRequest, SummarizeResponse, TranscribeResponse, TranslateRequest, TranslateResponse, PDFRequest

# from pyannote.audio import Pipeline
import tempfile
# import whisper
# import wave
# import torch

load_dotenv()
router = APIRouter()

LIBRETRANSLATE_URL = os.environ.get("LIBRETRANSLATE_URL")
pytesseract.pytesseract.tesseract_cmd = os.environ.get("TESSERACT_PATH")

# Load once when the app starts
t5_tokenizer = T5Tokenizer.from_pretrained("t5-small")
t5_model = T5ForConditionalGeneration.from_pretrained("t5-small")

# Long input model (handles bigger context)
long_tokenizer = AutoTokenizer.from_pretrained("google/long-t5-tglobal-base")
long_model = AutoModelForSeq2SeqLM.from_pretrained("google/long-t5-tglobal-base")


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

# detection using only libretranslate detect. (provides inaccurate results for short input)
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




@router.post("/detect-language2", response_model=DetectLangResponse)
async def detect_language2(req: DetectLangRequest):
    libre_result = None
    langdetect_result = None

    # 1. LibreTranslate detection
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

    # 2. Langdetect detection
    try:
        candidates = detect_langs(req.text)
        if candidates:
            best = candidates[0]
            langdetect_result = {
                "lang": LanguageConverter.to_libretranslate(
                        LanguageConverter.from_langdetect(best.lang)),
                "confidence": best.prob * 100,
            }
    except Exception:
        pass
    
    SUPPORTED_LANGS = set(lang["code"] for lang in await get_languages())
    # 3. Filter by supported languages
    if libre_result and libre_result["lang"] not in SUPPORTED_LANGS:
        libre_result = None
    if langdetect_result and langdetect_result["lang"] not in SUPPORTED_LANGS:
        langdetect_result = None

    # 4. Decision logic
    chosen = None
    if libre_result and langdetect_result:
        if libre_result["lang"] == langdetect_result["lang"]:
            chosen = max([libre_result, langdetect_result], key=lambda x: x["confidence"])
        else:
            if len(req.text.strip()) < 20:
                chosen = langdetect_result
            else:
                chosen = libre_result
    elif libre_result:
        chosen = libre_result
    elif langdetect_result:
        chosen = langdetect_result
    else:
        raise HTTPException(status_code=400, detail="Could not detect language")

    return DetectLangResponse(
        detected_lang=chosen["lang"],
        confidence=chosen["confidence"],
    )





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

# select which model to use depending on input size
@router.post("/summarize", response_model=SummarizeResponse)
async def summarize(req: SummarizeRequest):
    if not req.input_text.strip():
        raise HTTPException(status_code=400, detail="Input text is required.")

    try:
        input_text = req.input_text
        char_length = len(input_text)

        # Decide which model to use
        if char_length <= 4000:  # short input
            tokenizer, model = t5_tokenizer, t5_model
            input_str = "summarize: " + input_text
        else:  # long input
            tokenizer, model = long_tokenizer, long_model
            input_str = "summarize: " + input_text

        # Tokenize
        inputs = tokenizer.encode(
            input_str, return_tensors="pt", max_length=4096, truncation=True
        )
        input_length = inputs.shape[1]

        # Dynamic summary length
        min_len = max(30, int(input_length * 0.1))
        max_len = min(500, int(input_length * 0.3))

        outputs = model.generate(
            inputs,
            max_length=max_len,
            min_length=min_len,
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
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to summarize text: {str(e)}")


## First version : only using pytesseract, fallback is to preprocess the image and try pytesseract again
@router.post("/extract-text", response_model=OCRResponse)
async def extract_text(
    file: UploadFile = File(...),
    input_language: str = Form(...)
):
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Invalid file type. Please upload an image.")

    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Empty file uploaded")

    try:
        lang_tess = LanguageConverter.to_tesseract(input_language)

        # -------------------- First Attempt: No preprocessing --------------------
        img_raw = Image.open(io.BytesIO(contents)).convert("RGB")
        extracted_text = pytesseract.image_to_string(img_raw, lang=lang_tess).strip()

        # -------------------- Fallback: Preprocess if nothing found --------------------
        if not extracted_text:
            processed_img = process_image_for_ocr(contents)
            extracted_text = pytesseract.image_to_string(processed_img, lang=lang_tess).strip()

    except UnidentifiedImageError:
        raise HTTPException(status_code=400, detail="Could not process image file")

    return OCRResponse(extracted_text=extracted_text)


###################################### ocr with paddleOCR##############
# ## Keep a cache of PaddleOCR instances per language
# ocr_paddle_instances = {}

# def get_paddle_ocr(lang_code: str):
#     """
#     Return (and cache) a PaddleOCR instance for a given language.
#     """
#     if lang_code not in ocr_paddle_instances:
#         ocr_paddle_instances[lang_code] = PaddleOCR(use_angle_cls=True, lang=lang_code)
#     return ocr_paddle_instances[lang_code]


# @router.post("/extract-text", response_model=OCRResponse)
# async def extract_text(
#     file: UploadFile = File(...),
#     input_language: str = Form(...)
# ):
#     if not file.content_type.startswith("image/"):
#         raise HTTPException(status_code=400, detail="Invalid file type. Please upload an image.")

#     contents = await file.read()
#     if not contents:
#         raise HTTPException(status_code=400, detail="Empty file uploaded")

#     try:
#         # -------------------- First Attempt: Tesseract --------------------
#         lang_tess = LanguageConverter.to_tesseract(input_language)
#         img_raw = Image.open(io.BytesIO(contents)).convert("RGB")
#         extracted_text = pytesseract.image_to_string(img_raw, lang=lang_tess).strip()

#         # -------------------- Fallback: PaddleOCR if nothing found --------------------
#         # still not working properly.
#         if not extracted_text:
#             lang_paddle = LanguageConverter.to_paddleocr(input_language)
#             ocr_paddle = get_paddle_ocr(lang_paddle)
#             results = ocr_paddle.ocr(np.array(img_raw))
#             extracted_text_list = []
#             for res in results:
#                 for line in res:
#                     if len(line) >= 2:
#                         value = line[1]
#                         if isinstance(value, tuple) and len(value) >= 2:
#                             text, confidence = value
#                         else:
#                             text = value if isinstance(value, str) else ""
#                             confidence = None
#                         if text.strip():
#                             extracted_text_list.append(text.strip())

#             extracted_text = "\n".join(extracted_text_list).strip()

#     except UnidentifiedImageError:
#         raise HTTPException(status_code=400, detail="Could not process image file")

#     return OCRResponse(extracted_text=extracted_text)
#################################################################################################3

@router.post("/extract-doc-text")
async def extract_doc_text(
    file: UploadFile = File(...),
    input_language: str = Form(...)
):
    try:
        content = ""
        if file.filename.endswith(".pdf"):
            pdf_document = fitz.open(stream=file.file.read(), filetype="pdf")
            for page in pdf_document:
                content += page.get_text("text")

        elif file.filename.endswith(".docx"):
            doc = docx.Document(file.file)
            for para in doc.paragraphs:
                content += para.text + "\n"

        elif file.filename.endswith(".txt"):
            content = (await file.read()).decode("utf-8", errors="ignore")

        else:
            raise HTTPException(status_code=400, detail="Unsupported document type")

        if not content.strip():
            raise HTTPException(status_code=400, detail="No text extracted from document")

        return {"extracted_text": content, "input_language": input_language}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/generate-pdf")
async def generate_pdf_route(request: PDFRequest):
    try:
        # Create a temporary file
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp_file:
            tmp_filename = tmp_file.name

        # Generate the PDF
        generate_pdf(request.content, tmp_filename)

        # Return as downloadable response
        return FileResponse(
            tmp_filename,
            media_type="application/pdf",
            filename="generated_output.pdf",
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# # # after complete recording then transcribe 
## file is webm audio file
## input language code of libretranslate code
@router.post("/transcribe")
async def transcribe_audio(
    file: UploadFile = File(...),
    input_language: str = Form(...)
):
    # convert libretranslate code (iso-639) to recognize_google code(bcp-47)
    input_language_bcp = LanguageConverter.to_bcp47(input_language)

    # if language selected was auto-detect (for now default to english)
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

        
        audio_file = io.BytesIO(wav_data)
        # --- Preprocess audio ---
        # audio_file = preprocess_audio(input_data)

        # Transcribe
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
        return TranscribeResponse(
            transcription="",
            language=input_language_bcp
        )
    except Exception as e:
        return TranscribeResponse(
            transcription=f"Error: {str(e)}",
            language=input_language_bcp
        )


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