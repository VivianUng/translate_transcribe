# backend/main.py
"""
Main entry point for the FastAPI backend application.

This file initializes the FastAPI app, configures CORS middleware,
and includes both HTTP and WebSocket route modules.

Modules:
    - app.api.routes: Contains standard HTTP REST API endpoints
    - app.api.websocket_routes: Handles real-time WebSocket connections

Routes:
    - HTTP routes are prefixed with "/api"
    - WebSocket routes are prefixed with "/ws"
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router as api_router
from app.api.websocket_routes import router as websocket_router

# Initialize FastAPI Application
app = FastAPI()

# CORS setup
# Allows the frontend (Next.js) to communicate with this backend
# without being blocked by browser security restrictions.
origins = [
    "https://localhost:3000", #https link using localhost
    "https://translate-transcribe.vercel.app" # vercel deployment
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,      # Domains allowed to make cross-origin requests
    allow_credentials=True,     # Allow cookies and authorization headers
    allow_methods=["*"],        # Allow all HTTP methods (GET, POST, PUT, DELETE, etc.)
    allow_headers=["*"],        # Allow all request headers
)

# HTTP routes
app.include_router(api_router, prefix="/api")

# WebSocket routes
app.include_router(websocket_router, prefix="/ws")