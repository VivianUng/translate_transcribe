# backend/app/api/websocket_routes.py
"""
WebSocket Routing Configuration

Description:
This file defines the centralized WebSocket routing setup for the application. 
It combines all real-time communication endpoints (eg., live transcription 
and translation) into a single router for better modularity and maintainability.

Steps:
1. Import sub-routers:
   - websocket_transcribe: Handles live audio transcription WebSocket endpoints.
   - websocket_translate: Handles real-time translation WebSocket endpoints.
2. Create a main APIRouter instance to serve as the unified WebSocket entry point.
3. Include both sub-routers under the main router for integration with FastAPI.

Returns:
- Combined WebSocket router instance containing all real-time routes.
"""

from fastapi import APIRouter
from .websocket_transcribe import router as transcribe_router
from .websocket_translate import router as translate_router

# Initialize the main WebSocket router
router = APIRouter()

# Include WebSocket route for live transcription
router.include_router(transcribe_router)

# Include WebSocket route for live translation
router.include_router(translate_router)