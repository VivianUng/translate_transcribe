# backend/main.py

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
import os
from dotenv import load_dotenv
from supabase import create_client, Client
from app.api.routes import router as api_router

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise Exception("Supabase env vars not set!")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

app = FastAPI()

# CORS setup
origins = [
    "http://localhost:3000",
    "http://localhost:10000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

#  Extra middleware for WebSocket origin check
class WebSocketOriginMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.scope["type"] == "websocket":
            headers = dict(request.scope["headers"])
            origin = headers.get(b"origin", b"").decode()

            if origin not in origins:
                # Reject with 403 if origin not allowed
                from starlette.websockets import WebSocket, WebSocketDisconnect
                websocket = WebSocket(request.scope, request.receive)
                await websocket.close(code=1008)
                raise WebSocketDisconnect

        return await call_next(request)

app.add_middleware(WebSocketOriginMiddleware)

app.include_router(api_router, prefix="/api")

# #  Simple health check
# @app.get("/")
# async def root():
#     return {"message": "Backend is running"}




