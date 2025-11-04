# backend/app/models.py
"""
Pydantic Schemas for API Request and Response Validation.

This module defines all data models used for input validation and structured
responses throughout the system. It includes schemas for:

- Language processing (detection, transcription, translation, summarization, OCR)
- PDF generation
- User authentication and profile management
- Meeting creation, updates, and related payloads
- Generic record saving and updates

Each model ensures type safety and consistent communication between
frontend and backend via FastAPI request/response validation system.
"""

from pydantic import BaseModel, EmailStr
from typing import Optional, List, Literal, Dict


class DetectLangRequest(BaseModel):
    """Request body for detecting language from text."""
    text: str

class DetectLangResponse(BaseModel):
    """Response structure for detected language and confidence score."""
    detected_lang: str
    confidence: float

class TranscribeRequest(BaseModel):
    """Request body for initiating speech transcription."""
    language: str

class TranscribeResponse(BaseModel):
    """Response containing the transcribed text and detected language."""
    transcription: str
    language: str

class TranslateRequest(BaseModel):
    """Request body for text translation between languages."""
    text: str
    source_lang: str
    target_lang: str

class TranslateResponse(BaseModel):
    """Response containing original and translated text with language info."""
    input_text: str
    input_lang: str
    translated_text: str
    output_lang: str

class SummarizeRequest(BaseModel):
    """Request body for text summarization."""
    input_text: str

class SummarizeResponse(BaseModel):
    """Response containing summarized text."""
    input_text: str
    summarized_text: str

class OCRResponse(BaseModel) :
    """Response containing text extracted from an image (OCR)."""
    extracted_text: str

class PDFRequest(BaseModel): 
    """Request body for generating multilingual PDFs."""
    content: Dict[str, str] 
    input_language: str = "en"
    output_language: str = "en"





# Payloads for saving / updating database
class SignupRequest(BaseModel):
    """Request body for new user signup."""
    email: EmailStr
    password: str
    full_name: str
    origin: str

class ProfileUpdateRequest(BaseModel):
    """Request body for updating user profile settings."""
    name: str
    email: str
    auto_save_translations: bool = False
    auto_save_summaries: bool = False
    auto_save_conversations: bool = False
    auto_save_meetings: bool = False
    default_language: str = "en"

class GenericSavePayload(BaseModel):
    """Payload for saving translation, summary, or conversation records."""
    input_text: str
    output_text: str
    input_lang: str
    output_lang: str
    type: Literal["translation", "summary", "conversation"]

class MeetingSavePayload(BaseModel):
    """Payload for saving individual meeting translation or summary data."""
    meeting_id: str
    translation: Optional[str] = None
    translated_lang: Optional[str] = None
    translated_summary: Optional[str] = None

class MeetingUpdatePayload(BaseModel):
    """Payload for updating individual meeting record."""
    translation: Optional[str] = None
    translated_lang: Optional[str] = None
    translated_summary: Optional[str] = None

class MeetingDetailsUpdatePayload(BaseModel):
    """Payload for host-only updates to meeting_details (eg. transcription, summaries)."""
    transcription: Optional[str] = None
    transcription_lang: Optional[str] = None
    en_summary: Optional[str] = None
    translated_summary: Optional[str] = None

class CreateMeetingPayload(BaseModel):
    """Request body for creating a new meeting."""
    meeting_name: str
    date: str
    start_time: str
    end_time: str
    participants: List[str]  # list of participant emails

class UpdateMeetingPayload(BaseModel):
    """Request body for updating existing meeting details."""
    meeting_name: str
    date: str
    start_time: str
    end_time: str
    participants: List[str]

class StatusUpdatePayload(BaseModel):
    """Payload for updating meeting status (eg., ongoing, past)."""
    status: str

class RecordUpdatePayload(BaseModel):
    """Payload for updates to translation/summary/conversation records."""
    input_text: Optional[str] = None
    output_text: Optional[str] = None
    input_lang: Optional[str] = None
    output_lang: Optional[str] = None