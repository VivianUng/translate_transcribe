# backend/app/api/websocket_translate.py
import json
import os
import httpx
import time
from datetime import datetime
from dotenv import load_dotenv
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

load_dotenv()
router = APIRouter()

LIBRETRANSLATE_URL = os.environ.get("LIBRETRANSLATE_URL")

@router.websocket("/translate")
async def websocket_translate(ws: WebSocket):
    await ws.accept()
    input_lang = "en"
    target_lang = "en"
    print("Translate WebSocket opened")

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
        async with httpx.AsyncClient(timeout=10) as client:
            while True:
                try:
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

                # --- INIT ---
                if msg_type == "init":
                    input_lang = data.get("inputLang", "en")
                    target_lang = data.get("targetLang", "en")
                    print(f"Initialized: {input_lang} to {target_lang}")
                    continue

                # --- CHANGE LANGUAGE ---
                if msg_type == "changeLang":
                    new_input_lang = data.get("inputLang", input_lang)
                    new_target_lang = data.get("targetLang", target_lang)
                    print(f"Lang change: {new_input_lang} to {new_target_lang}")
                    input_lang, target_lang = new_input_lang, new_target_lang
                    continue

                # --- TRANSLATE ---
                if msg_type == "translate":
                    text = data.get("text", "").strip()
                    mode = data.get("mode", "incremental")
                    if not text:
                        continue

                    try:
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
                        translated = resp.json().get("translatedText", "")
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
        end_time = time.time()
        end_dt = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        elapsed = round(end_time - start_time, 2)
        print(f"[{end_dt}] Translate WebSocket closed after {elapsed} seconds.")

        if ws.client_state.name == "CONNECTED":
            try:
                await ws.close()
            except Exception:
                pass
        print("Translate WebSocket closed.")