# backend/app/api/routes.py


from ..core.language_codes import LanguageConverter
from ..core.image_preprocessing import process_image_for_ocr
from ..core.audio_preprocessing import preprocess_audio
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Request, Form
from pydantic import BaseModel
from typing import Optional, Literal, List
import httpx
import pytesseract
from paddleocr import PaddleOCR
import numpy as np
import fitz
import docx
import speech_recognition as sr
from langdetect import detect_langs
from PIL import Image, UnidentifiedImageError
import imageio_ffmpeg as ffmpeg
import io
import logging
import subprocess
from supabase import create_client, Client
import os
from dotenv import load_dotenv
from transformers import T5ForConditionalGeneration, T5Tokenizer
# from pyannote.audio import Pipeline
import tempfile
# import whisper
# import wave
# import torch

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

class SummarizeResponse(BaseModel):
    input_text: str
    summarized_text: str

class GenericSavePayload(BaseModel):
    input_text: str
    output_text: str
    input_lang: str
    output_lang: str
    type: Literal["translation", "summary", "conversation"]

class CreateMeetingPayload(BaseModel):
    meeting_name: str
    date: str
    start_time: str
    end_time: str
    participants: List[str]  # list of participant emails

class UpdateMeetingPayload(BaseModel):
    meeting_name: str
    date: str
    start_time: str
    end_time: str
    participants: List[str]

class StatusUpdatePayload(BaseModel):
    status: str

class OCRResponse(BaseModel) :
    extracted_text: str

class RecordUpdate(BaseModel):
    input_text: Optional[str] = None
    output_text: Optional[str] = None
    input_lang: Optional[str] = None
    output_lang: Optional[str] = None

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

@router.post("/save")
async def save_item(payload: GenericSavePayload, current_user=Depends(get_current_user)):
    """
    Save translation/summary/conversation for authenticated user
    """
    try:
        table_map = {
            "translation": "translations",
            "summary": "summaries",
            "conversation": "conversations",
        }
        table_name = table_map[payload.type]

        result = (
            supabase.table(table_name)
            .insert({
                "user_id": current_user.id,
                "input_text": payload.input_text,
                "output_text": payload.output_text,
                "input_lang": payload.input_lang,
                "output_lang": payload.output_lang,
                "created_at": "now()",
            })
            .execute()
        )

        return {"message": f"{payload.type.capitalize()} saved successfully!"}

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to save {payload.type}: {e}")

    
@router.get("/user-history")
async def get_user_history(current_user=Depends(get_current_user)):
    """
    Fetch translations, conversations, and summaries for the logged-in user.
    """
    user_id = current_user.id

    try:
        # Fetch translations
        translations = supabase.table("translations").select("*").eq("user_id", user_id).order("created_at", desc=True).execute()

        # Fetch conversations
        conversations = supabase.table("conversations").select("*").eq("user_id", user_id).order("created_at", desc=True).execute()

        # Fetch summaries
        summaries = supabase.table("summaries").select("*").eq("user_id", user_id).order("created_at", desc=True).execute()

        return {
            "translations": translations.data or [],
            "conversations": conversations.data or [],
            "summaries": summaries.data or []
        }

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to fetch user history: {e}")

def get_table(record_type: str):
    table = record_type
    if not table:
        raise HTTPException(status_code=400, detail="Invalid record type")
    return table

# GET record
@router.get("/records/{record_type}/{record_id}")
async def get_record(record_type: str, record_id: str, current_user=Depends(get_current_user)):
    try:
        table = get_table(record_type)
        result = (
            supabase.table(table)
            .select("*")
            .eq("id", record_id)
            .eq("user_id", current_user.id)
            .single()
            .execute()
        )

        if not result.data:
            raise HTTPException(status_code=404, detail=f"{record_type[:-1].capitalize()} not found")

        return result.data

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error fetching {record_type}: {e}")


# UPDATE record
@router.put("/records/{record_type}/{record_id}")
async def update_record(
    record_type: str,
    record_id: str,
    payload: RecordUpdate,
    current_user=Depends(get_current_user)
):
    try:
        table = get_table(record_type)

        updates = {}
        if payload.input_text is not None:
            updates["input_text"] = payload.input_text
        if payload.output_text is not None:
            updates["output_text"] = payload.output_text
        if payload.input_lang is not None:
            updates["input_lang"] = payload.input_lang
        if payload.output_lang is not None:
            updates["output_lang"] = payload.output_lang
        
        if updates : 
            updates["updated_at"] = "now()"

        if not updates:
            raise HTTPException(status_code=400, detail="No updates provided")

        result = (
            supabase.table(table)
            .update(updates)
            .eq("id", record_id)
            .eq("user_id", current_user.id)
            .execute()
        )

        if not result.data:
            raise HTTPException(status_code=404, detail=f"{record_type[:-1].capitalize()} not found")

        return result.data[0]

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error updating {record_type}: {e}")


# DELETE record
@router.delete("/records/{record_type}/{record_id}")
async def delete_record(record_type: str, record_id: str, current_user=Depends(get_current_user)):
    try:
        table = get_table(record_type)

        result = (
            supabase.table(table)
            .delete()
            .eq("id", record_id)
            .eq("user_id", current_user.id)
            .execute()
        )

        if not result.data:
            raise HTTPException(status_code=404, detail=f"{record_type[:-1].capitalize()} not found")

        return {"message": f"{record_type[:-1].capitalize()} deleted successfully"}

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error deleting {record_type}: {e}")

@router.post("/create-meeting")
async def create_meeting(payload: CreateMeetingPayload, current_user=Depends(get_current_user)):
    """
    Create a new meeting with participants for the authenticated user
    """
    try:
        # 1. Insert meeting
        meeting_result = supabase.table("meetings").insert({
            "name": payload.meeting_name,
            "date": payload.date,
            "start_time": payload.start_time,
            "end_time": payload.end_time,
            "host_id": current_user.id
        }).execute()

        # Check for errors
        if not meeting_result.data:
            raise HTTPException(status_code=400, detail=meeting_result["error"]["message"])

        meeting = meeting_result.data[0]  # first inserted row

        # 2. Get participant profiles using RPC
        profiles_result = supabase.rpc("get_profiles_for_emails", {"emails": payload.participants}).execute()
        if not profiles_result.data:
            raise HTTPException(status_code=400, detail=profiles_result["error"]["message"])

        participant_rows = [{"meeting_id": meeting["id"], "participant_id": p["id"]} for p in profiles_result.data]

        # 3. Insert participants into meeting_participants
        participant_result = supabase.table("meeting_participants").insert(participant_rows).execute()
        if not participant_result.data:
            raise HTTPException(status_code=400, detail=participant_result["error"]["message"])

        return {"message": "Meeting created successfully!", "meeting": meeting, "participants": participant_rows}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/meetings/{meeting_id}")
async def get_meeting(meeting_id: str, current_user=Depends(get_current_user)):
    """
    Fetch a single meeting and its participants by meeting ID.
    """
    try:
        # Fetch the meeting
        meeting_res = supabase.table("meetings").select("*").eq("id", meeting_id).execute()
        if not meeting_res.data:
            raise HTTPException(status_code=404, detail="Meeting not found")
        meeting = meeting_res.data[0]

        # Fetch participant emails
        participant_res = (
            supabase.table("meeting_participants")
            .select("participant_id")
            .eq("meeting_id", meeting_id)
            .execute()
        )
        participant_ids = [p["participant_id"] for p in participant_res.data]

        profiles_res = supabase.rpc("get_profiles_for_ids", {"ids": participant_ids}).execute()
        participants = [p["email"] for p in profiles_res.data]

        # Add host email
        host_res = supabase.table("profiles").select("email,name").eq("id", meeting["host_id"]).single().execute()
        host_email = host_res.data["email"] if host_res.data else "Unknown"
        meeting["host_email"] = host_email

        host_id = meeting["host_id"]

        profiles_result = supabase.rpc("get_host_names", {"host_ids": [host_id]}).execute()
        if not profiles_result:
            print("RPC fetch error")

        profiles = profiles_result.data or []
        host_map = {p["host_id"]: p["name"] for p in profiles}

        meeting["host_name"] = host_map.get(host_id, "Unknown")

        return {"meeting": meeting, "participants": participants}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/meetings/{meeting_id}")
async def update_meeting(
    meeting_id: str,
    payload: UpdateMeetingPayload,
    current_user=Depends(get_current_user)
):
    """
    Update an existing meeting. Only the host can update.
    """
    try:
        # 1. Fetch the existing meeting
        meeting_res = supabase.table("meetings").select("*").eq("id", meeting_id).execute()
        if not meeting_res.data:
            raise HTTPException(status_code=404, detail="Meeting not found")
        meeting = meeting_res.data[0]

        # 2. Check if the current user is the host
        if meeting["host_id"] != current_user.id:
            raise HTTPException(status_code=403, detail="Only the host can update the meeting")

        # 3. Update meeting info
        update_res = supabase.table("meetings").update({
            "name": payload.meeting_name,
            "date": payload.date,
            "start_time": payload.start_time,
            "end_time": payload.end_time
        }).eq("id", meeting_id).execute()

        if not update_res.data:
            raise HTTPException(status_code=400, detail=update_res["error"]["message"])

        updated_meeting = update_res.data[0]

        # 4. Update participants: delete old, insert new
        supabase.table("meeting_participants").delete().eq("meeting_id", meeting_id).execute()

        # Fetch participant profiles using RPC
        profiles_res = supabase.rpc("get_profiles_for_emails", {"emails": payload.participants}).execute()
        if not profiles_res.data:
            raise HTTPException(status_code=400, detail=profiles_res["error"]["message"])

        participant_rows = [{"meeting_id": meeting_id, "participant_id": p["id"]} for p in profiles_res.data]

        participant_insert_res = supabase.table("meeting_participants").insert(participant_rows).execute()
        if not participant_insert_res.data:
            raise HTTPException(status_code=400, detail=participant_insert_res["error"]["message"])

        return {"message": "Meeting updated successfully!", "meeting": updated_meeting, "participants": participant_rows}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    
@router.put("/meetings/{meeting_id}/status")
async def update_meeting_status(
    meeting_id: str,
    payload: StatusUpdatePayload,
    current_user=Depends(get_current_user)
):
    """
    Update the status of a meeting (e.g., 'ongoing', 'past').
    Only the host can update.
    """
    try:
        status = payload.status
        # 1. Fetch the existing meeting
        meeting_res = supabase.table("meetings").select("*").eq("id", meeting_id).execute()
        if not meeting_res.data:
            raise HTTPException(status_code=404, detail="Meeting not found")
        meeting = meeting_res.data[0]

        # 2. Check if the current user is the host
        if meeting["host_id"] != current_user.id:
            raise HTTPException(status_code=403, detail="Only the host can update the meeting")

        # 3. Update only the status column
        update_res = (
            supabase.table("meetings")
            .update({"status": status})
            .eq("id", meeting_id)
            .execute()
        )

        if not update_res.data:
            raise HTTPException(status_code=400, detail="Failed to update meeting status")

        return {
            "message": f"Meeting status updated to '{status}' successfully!",
            "meeting": update_res.data[0],
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    
@router.get("/meetings/{meeting_id}/status")
async def get_meeting_status(
    meeting_id: str,
    current_user=Depends(get_current_user)
):
    """
    Get the current status of a meeting (e.g., 'upcoming', 'ongoing', 'past').
    Both host and participants can check.
    """
    try:
        # 1. Fetch the meeting
        meeting_res = supabase.table("meetings").select("id, status").eq("id", meeting_id).execute()
        if not meeting_res.data:
            raise HTTPException(status_code=404, detail="Meeting not found")

        meeting = meeting_res.data[0]

        # 2. Return only meeting id + status
        return {
            "meeting_id": meeting["id"],
            "status": meeting["status"]
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/meetings/{meeting_id}/role")
async def get_meeting_role(meeting_id: str, current_user=Depends(get_current_user)):
    # Fetch meeting
    meeting_res = supabase.table("meetings").select("id, host_id").eq("id", meeting_id).execute()
    if not meeting_res.data:
        raise HTTPException(status_code=404, detail="Meeting not found")

    meeting = meeting_res.data[0]

    # Determine role
    if meeting["host_id"] == current_user.id:
        return {"role": "host"}
    else:
        return {"role": "participant"}

@router.delete("/meetings/{meeting_id}")
async def delete_meeting(meeting_id: str, current_user=Depends(get_current_user)):
    """
    Delete a meeting. Only the host can delete.
    """
    try:
        # Fetch meeting
        meeting_res = supabase.table("meetings").select("*").eq("id", meeting_id).execute()
        if not meeting_res.data:
            raise HTTPException(status_code=404, detail="Meeting not found")

        meeting = meeting_res.data[0]

        # Verify host
        if meeting["host_id"] != current_user.id:
            raise HTTPException(status_code=403, detail="Only the host can delete the meeting")

        # Delete participants first
        supabase.table("meeting_participants").delete().eq("meeting_id", meeting_id).execute()

        # Delete the meeting
        delete_res = supabase.table("meetings").delete().eq("id", meeting_id).execute()
        if not delete_res.data:
            raise HTTPException(status_code=400, detail="Failed to delete meeting")

        return {"message": "Meeting deleted successfully!"}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/meetings")
async def get_user_meetings(current_user=Depends(get_current_user)):
    try:
        # 1. Meetings where user is host
        host_result = supabase.table("meetings").select("*").eq("host_id", current_user.id).execute()
        if not host_result:
            print("Error fetching host meetings")
        host_meetings = host_result.data or []

        # 2. Meetings where user is participant
        participant_links = supabase.table("meeting_participants")\
            .select("meeting_id")\
            .eq("participant_id", current_user.id)\
            .execute()
        if not participant_links:
            print("Error fetching participant links")
        participant_links_data = participant_links.data or []

        participant_meeting_ids = [link["meeting_id"] for link in participant_links_data]
        participant_meetings = []
        if participant_meeting_ids:
            participant_result = supabase.table("meetings")\
                .select("*")\
                .in_("id", participant_meeting_ids)\
                .execute()
            if not participant_result:
                print("Error fetching participant meetings")
            participant_meetings = participant_result.data or []

        # 3. Combine meetings, remove duplicates
        all_meetings_dict = {m["id"]: m for m in host_meetings + participant_meetings}
        all_meetings = list(all_meetings_dict.values())

        # 4. Fetch host names via RPC
        host_map = {}
        if all_meetings:
            host_ids = list({m["host_id"] for m in all_meetings})
            if host_ids:
                profiles_result = supabase.rpc("get_host_names", {"host_ids": host_ids}).execute()
                if not profiles_result:
                    print("RPC fetch error")
                profiles = profiles_result.data or []
                host_map = {p["host_id"]: p["name"] for p in profiles}

        # 5. Attach host_name to each meeting
        for m in all_meetings:
            m["host_name"] = host_map.get(m["host_id"], "Unknown")

        # 6. Sort meetings
        all_meetings.sort(key=lambda m: (m["date"], m["start_time"]))

        return all_meetings

    except Exception as e:
        print("Error fetching meetings:", e)
        return []





@router.post("/delete-account")
async def delete_account(current_user=Depends(get_current_user)):
    """
    Delete user account (all related rows + profile + auth user)
    """
    try:
        user_id = current_user.id

        # 1. Delete dependent rows
        supabase.table("translations").delete().eq("user_id", user_id).execute()
        supabase.table("summaries").delete().eq("user_id", user_id).execute()
        supabase.table("conversations").delete().eq("user_id", user_id).execute()
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

        return {
            "transcription": text,
            "language_used": input_language_bcp
        }
    except sr.UnknownValueError:
        return {"transcription": "", "language_used": input_language_bcp}
    except Exception as e:
        return {"error": str(e), "language_used": input_language_bcp}


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