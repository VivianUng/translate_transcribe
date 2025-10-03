from fastapi import APIRouter
from .websocket_transcribe import router as transcribe_router
from .websocket_translate import router as translate_router

router = APIRouter()
router.include_router(transcribe_router)
router.include_router(translate_router)