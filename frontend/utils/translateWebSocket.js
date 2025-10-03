import { useEffect, useRef } from "react";

export function useTranslateWebSocket(inputLang, targetLang, inputText, enabled, setTranslation) {
  const wsRef = useRef(null);
  const lastSentIndexRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;

    wsRef.current = new WebSocket(
      `${process.env.NEXT_PUBLIC_WEBSOCKET_URL}/translate?lang=${encodeURIComponent(
        inputLang
      )}&target=${encodeURIComponent(targetLang)}`
    );

    wsRef.current.onopen = () => {
      console.log("Translate WebSocket connected");
    };

    wsRef.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.translated_text) {
        setTranslation((prev) => (prev ? prev + " " + data.translated_text : data.translated_text));
      } else if (data.error) {
        console.error("WebSocket translation error:", data.error);
      }
    };

    wsRef.current.onclose = () => {
      console.log("Translate WebSocket disconnected");
    };

    return () => {
      wsRef.current.close();
    };
  }, [inputLang, targetLang, enabled, setTranslation]);

  useEffect(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    if (!inputText) return;

    const words = inputText.split(/\s+/);
    if (words.length <= lastSentIndexRef.current) return;

    const newWords = words.slice(lastSentIndexRef.current);
    lastSentIndexRef.current = words.length;

    try {
      wsRef.current.send(new TextEncoder().encode(newWords.join(" ")));
    } catch (err) {
      console.error("Failed to send inputText to WS:", err);
    }
  }, [inputText]);
}
