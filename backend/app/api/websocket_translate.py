# #backend/app/api/websocket_translate.py

import json
import os
import httpx
from dotenv import load_dotenv
from fastapi import APIRouter, WebSocket

load_dotenv()
router = APIRouter()

LIBRETRANSLATE_URL = os.environ.get("LIBRETRANSLATE_URL")

@router.websocket("/translate")
async def websocket_translate(ws: WebSocket):
    await ws.accept()

    input_lang = ws.query_params.get("lang", "en")
    target_lang = ws.query_params.get("target", "en")
    print(f"Translate WebSocket opened with source_lang={input_lang}, target_lang={target_lang}")

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            while True:
                try:
                    message = await ws.receive_text()
                except Exception:
                    break

                try:
                    data = json.loads(message)
                    text_to_translate = data.get("text", "").strip()
                    mode = data.get("mode", "incremental")  # "incremental" or "refresh"
                except Exception:
                    continue

                if not text_to_translate:
                    continue

                # Call LibreTranslate API
                try:
                    resp = await client.post(
                        f"{LIBRETRANSLATE_URL}/translate",
                        json={
                            "q": text_to_translate,
                            "source": input_lang,
                            "target": target_lang,
                            "format": "text",
                        },
                    )
                    resp.raise_for_status()
                    translated_text = resp.json().get("translatedText", "")

                    # Send back via websocket
                    await ws.send_text(json.dumps({
                        "translated_text": translated_text,
                        "mode": mode,
                    }))

                except Exception as e:
                    await ws.send_text(json.dumps({"error": str(e)}))

    except Exception as e:
        print("WebSocket error:", e)
        if ws.client_state.name == "CONNECTED":
            await ws.send_text(json.dumps({"error": str(e)}))

    finally:
        if ws.client_state.name == "CONNECTED":
            await ws.close()