import { useEffect, useRef } from "react";

export function useTranslateWebSocket(
  inputLang,
  targetLang,
  inputText,
  enabled,
  setTranslation
) {
  const wsRef = useRef(null);
  const lastSentIndexRef = useRef(0);
  const totalWordBufferRef = useRef([]); // full buffer of all sent words
  const wordsSinceRefreshRef = useRef(0);
  const RETRANSLATE_INTERVAL = 10; // retranslate every 10 words

  useEffect(() => {
    if (!enabled) return;

    const ws = new WebSocket(
      `${process.env.NEXT_PUBLIC_WEBSOCKET_URL}/translate?lang=${encodeURIComponent(
        inputLang
      )}&target=${encodeURIComponent(targetLang)}`
    );
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("Translate WebSocket connected");
      // Reset state when new connection starts
      setTranslation("");
      lastSentIndexRef.current = 0;
      totalWordBufferRef.current = [];
      wordsSinceRefreshRef.current = 0;
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.translated_text) {
        if (data.mode === "refresh") {
          // full refresh → replace translation text
          setTranslation(data.translated_text);
        } else {
          // incremental → append new word(s)
          setTranslation((prev) =>
            prev ? prev + " " + data.translated_text : data.translated_text
          );
        }
      } else if (data.error) {
        console.error("WebSocket translation error:", data.error);
      }
    };

    ws.onclose = () => {
      console.log("Translate WebSocket disconnected");
    };

    return () => {
      ws.close();
    };
  }, [inputLang, targetLang, enabled, setTranslation]);

  useEffect(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    if (!inputText) return;

    const words = inputText.trim().split(/\s+/);
    if (words.length <= lastSentIndexRef.current) return;

    const newWords = words.slice(lastSentIndexRef.current);
    lastSentIndexRef.current = words.length;

    for (const word of newWords) {
      totalWordBufferRef.current.push(word);
      wordsSinceRefreshRef.current++;

      // send incremental
      try {
        ws.send(
          JSON.stringify({
            text: word,
            mode: "incremental",
          })
        );
      } catch (err) {
        console.error("Failed to send incremental text:", err);
      }

      // periodic retranslation for accuracy
      if (wordsSinceRefreshRef.current >= RETRANSLATE_INTERVAL) {
        try {
          ws.send(
            JSON.stringify({
              text: totalWordBufferRef.current.join(" "),
              mode: "refresh",
            })
          );
          wordsSinceRefreshRef.current = 0; // reset counter
        } catch (err) {
          console.error("Failed to send refresh text:", err);
        }
      }
    }
  }, [inputText]);
}
