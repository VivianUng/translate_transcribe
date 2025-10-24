from pydantic import BaseModel, EmailStr
from typing import Optional, List, Literal, Dict


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

class OCRResponse(BaseModel) :
    extracted_text: str

class PDFRequest(BaseModel): 
    content: Dict[str, str] 
    input_language: str = "en"
    output_language: str = "en"





# Payloads for saving / updating database
class SignupRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    origin: str

class ProfileUpdateRequest(BaseModel):
    name: str
    email: str
    auto_save_translations: bool = False
    auto_save_summaries: bool = False
    auto_save_conversations: bool = False
    auto_save_meetings: bool = False
    default_language: str = "en"

class GenericSavePayload(BaseModel):
    input_text: str
    output_text: str
    input_lang: str
    output_lang: str
    type: Literal["translation", "summary", "conversation"]

class MeetingSavePayload(BaseModel):
    meeting_id: str
    translation: Optional[str] = None
    translated_lang: Optional[str] = None
    translated_summary: Optional[str] = None

class MeetingUpdatePayload(BaseModel):
    translation: Optional[str] = None
    translated_lang: Optional[str] = None
    translated_summary: Optional[str] = None

class MeetingDetailsUpdatePayload(BaseModel):
    transcription: Optional[str] = None
    transcription_lang: Optional[str] = None
    en_summary: Optional[str] = None
    translated_summary: Optional[str] = None

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

class RecordUpdatePayload(BaseModel):
    input_text: Optional[str] = None
    output_text: Optional[str] = None
    input_lang: Optional[str] = None
    output_lang: Optional[str] = None