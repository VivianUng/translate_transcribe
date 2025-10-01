# backend/main.py

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router as api_router
from app.api.websocket import websocket_transcribe
# from app.api.websocket2 import websocket_transcribe

app = FastAPI()

# CORS setup
origins = [
    "http://localhost:3000",
    # "http://192.168.100.11:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api")

# WebSocket
app.add_api_websocket_route("/ws/transcribe", websocket_transcribe)