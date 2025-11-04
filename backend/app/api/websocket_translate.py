# backend/app/api/websocket_translate.py
"""
Handles real-time text translation over WebSocket using the LibreTranslate API.

This module:
    - Listens for client messages over WebSocket
    - Supports dynamic language switching (source and target)
    - Translates text in real-time using LibreTranslate
    - Sends translated results or errors back to the client

Endpoints:
    /ws/translate : WebSocket route for real-time translation
"""

import json
import os
import httpx
import time
from datetime import datetime
from dotenv import load_dotenv
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

# Load environment variables from .env file
load_dotenv()

# Initialize FastAPI router for WebSocket communication
router = APIRouter()

# LibreTranslate API endpoint (from environment variable)
LIBRETRANSLATE_URL = os.environ.get("LIBRETRANSLATE_URL")

@router.websocket("/translate")
async def websocket_translate(ws: WebSocket):
    """
    WebSocket endpoint for live text translation.

    Workflow:
        1. Client connects to the WebSocket and sends initialization data
        2. Server accepts and stores source/target language preferences
        3. Client sends messages containing text to translate
        4. Server calls the LibreTranslate API and streams back results
        5. Client can also send commands to change languages mid-session

    Supported message types:
        - "init": Initializes source and target languages
        - "changeLang": Dynamically updates language settings
        - "translate": Translates the provided text and returns the result
    """
    await ws.accept()

    # Default language settings
    input_lang = "en"
    target_lang = "en"
    print("Translate WebSocket opened")

    # Logging: start timestamp
    start_time = time.time()
    start_dt = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{start_dt}] Translate WebSocket opened")

    async def safe_send(payload: dict):
        """Safely send a message if connection is open."""
        try:
            if ws.client_state.name == "CONNECTED":
                await ws.send_text(json.dumps(payload))
            else:
                print("Skipped send — socket not connected:", payload)
        except Exception as e:
            print("Send failed:", e)

    try:
        # Create an HTTP client for API requests (shared for all messages)
        async with httpx.AsyncClient(timeout=10) as client:
            while True:
                try:
                    # Wait for message from client
                    message = await ws.receive_text()
                except WebSocketDisconnect:
                    print("Client disconnected.")
                    break
                except Exception as e:
                    print("Receive error:", e)
                    break

                try:
                    data = json.loads(message)
                except Exception:
                    continue

                msg_type = data.get("type")

                #  INIT : Client initializes translation settings
                if msg_type == "init":
                    input_lang = data.get("inputLang", "en")
                    target_lang = data.get("targetLang", "en")
                    print(f"Initialized: {input_lang} to {target_lang}")
                    continue

                # CHANGE LANGUAGE : Update current translation pair
                if msg_type == "changeLang":
                    new_input_lang = data.get("inputLang", input_lang)
                    new_target_lang = data.get("targetLang", target_lang)
                    print(f"Lang change: {new_input_lang} to {new_target_lang}")
                    input_lang, target_lang = new_input_lang, new_target_lang
                    continue

                # TRANSLATE : Process incoming text and translate it
                if msg_type == "translate":
                    text = data.get("text", "").strip()
                    mode = data.get("mode", "incremental")
                    if not text:
                        continue

                    try:
                        # Send translation request to LibreTranslate API
                        resp = await client.post(
                            f"{LIBRETRANSLATE_URL}/translate",
                            json={
                                "q": text,
                                "source": input_lang,
                                "target": target_lang,
                                "format": "text",
                            },
                        )
                        resp.raise_for_status()
                        
                        # Extract translated text from API response
                        translated = resp.json().get("translatedText", "")
                        
                        # Send translation result back to client
                        await safe_send({
                            "translated_text": translated,
                            "mode": mode,
                            "lang_info": {"source": input_lang, "target": target_lang},
                        })
                    except Exception as e:
                        await safe_send({"error": str(e)})
                    continue

                print("Unknown message type:", msg_type)

    except Exception as e:
        print("WebSocket internal error:", e)
        await safe_send({"error": str(e)})

    finally:
        # Log session duration
        end_time = time.time()
        end_dt = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        elapsed = round(end_time - start_time, 2)
        print(f"[{end_dt}] Translate WebSocket closed after {elapsed} seconds.")

        # Ensure WebSocket is closed properly
        if ws.client_state.name == "CONNECTED":
            try:
                await ws.close()
            except Exception:
                pass
        print("Translate WebSocket closed.")