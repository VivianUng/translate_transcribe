# backend/main.py

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router as api_router
from app.api.websocket_routes import router as websocket_router

app = FastAPI()

# CORS setup
origins = [
    "http://localhost:3000", # normal localhost
    "http://192.168.100.11:3000", # network link with laptop ip
    "https://localhost:3000", #https link using npmrun dev:https
    "https://192.168.100.11:3000", # https network link with laptop ip
    "https://10.118.68.155:3000", #mobile hotspot
    "https://10.116.152.155:3000", #mobile hotspot
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# HTTP routes
app.include_router(api_router, prefix="/api")

# WebSocket routes
app.include_router(websocket_router, prefix="/ws")