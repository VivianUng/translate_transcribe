# backend/main.py

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router as api_router
from app.api.websocket_routes import router as websocket_router

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

# HTTP routes
app.include_router(api_router, prefix="/api")

# WebSocket routes
app.include_router(websocket_router, prefix="/ws")