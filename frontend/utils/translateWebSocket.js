import { useEffect, useRef } from "react";

export function useTranslateWebSocket(
  inputLang,
  detectedLang,
  targetLang,
  inputText,
  enabled,
  setTranslation
) {
  const wsRef = useRef(null);
  const inputLangRef = useRef(inputLang);
  const targetLangRef = useRef(targetLang);
  const detectedLangRef = useRef(detectedLang);
  const lastSentIndexRef = useRef(0);
  const totalWordBufferRef = useRef([]);
  const wordsSinceRefreshRef = useRef(0);
  const translatedWordBufferRef = useRef([]);
  const RETRANSLATE_INTERVAL = 10;

  // Keep refs up to date
  useEffect(() => {
    inputLangRef.current = inputLang;
    targetLangRef.current = targetLang;
    detectedLangRef.current = detectedLang;
  }, [inputLang, targetLang, detectedLang]);

  // Helper to get the *actual* language to use
  const getEffectiveInputLang = () => {
    if (inputLangRef.current === "auto" && detectedLangRef.current) {
      return detectedLangRef.current;
    }
    return inputLangRef.current;
  };

  // Safe send wrapper
  const safeSend = (messageObj) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.warn("Skipped send — WebSocket not open:", messageObj);
      return;
    }
    try {
      ws.send(JSON.stringify(messageObj));
    } catch (err) {
      console.error("WebSocket send failed:", err);
    }
  };

  // --- Initialize websocket ONCE ---
  useEffect(() => {
    if (!enabled || wsRef.current) return;

    const ws = new WebSocket(`${process.env.NEXT_PUBLIC_WEBSOCKET_URL}/translate`);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("Translate WebSocket connected");
      safeSend({
        type: "init",
        inputLang: getEffectiveInputLang(),
        targetLang: targetLangRef.current,
      });
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.translated_text) {
          if (data.mode === "incremental") {
            translatedWordBufferRef.current.push(data.translated_text);
          } else if (data.mode === "refresh") {
            const refreshedWords = data.translated_text.trim().split(/\s+/);
            translatedWordBufferRef.current.splice(
              -RETRANSLATE_INTERVAL,
              RETRANSLATE_INTERVAL,
              ...refreshedWords
            );
          }
          const cleanText = translatedWordBufferRef.current.join(" ").replace(/[^\p{L}\p{N}\p{P}\p{Zs}]/gu, "");
          setTranslation(cleanText);

        } else if (data.error) {
          console.error("WebSocket translation error:", data.error);
        }
      } catch (err) {
        console.warn("Malformed WebSocket message:", err);
      }
    };

    ws.onerror = (err) => {
      console.error("WebSocket error:", err);
    };

    ws.onclose = (e) => {
      console.log(`Translate WebSocket closed (code: ${e.code}, reason: ${e.reason})`);
    };

    // Graceful cleanup
    return () => {
      const current = wsRef.current;
      wsRef.current = null;
      setTimeout(() => {
        if (current && current.readyState === WebSocket.OPEN) current.close();
      }, 2000);
    };
  }, [enabled]);

  // --- Update language change ---
  useEffect(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const effectiveInputLang = getEffectiveInputLang();
    safeSend({
      type: "changeLang",
      inputLang: effectiveInputLang,
      targetLang: targetLangRef.current,
    });
    console.log(`Language updated : ${effectiveInputLang} to ${targetLangRef.current}`);
  }, [inputLang, targetLang, detectedLang]);

  // --- Incremental translation updates ---
  useEffect(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || !inputText) return;

    const words = inputText.trim().split(/\s+/);
    if (words.length <= lastSentIndexRef.current) return;

    const newWords = words.slice(lastSentIndexRef.current);
    lastSentIndexRef.current = words.length;

    for (const word of newWords) {
      totalWordBufferRef.current.push(word);
      wordsSinceRefreshRef.current++;

      safeSend({
        type: "translate",
        mode: "incremental",
        text: word,
      });

      if (wordsSinceRefreshRef.current >= RETRANSLATE_INTERVAL) {
        const lastWords = totalWordBufferRef.current.slice(-RETRANSLATE_INTERVAL);
        safeSend({
          type: "translate",
          mode: "refresh",
          text: lastWords.join(" "),
        });
        wordsSinceRefreshRef.current = 0;
      }
    }
  }, [inputText]);

  // --- Final refresh when disabling translation ---
  useEffect(() => {
    if (!enabled) {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;

      const remainingWords = wordsSinceRefreshRef.current;
      if (remainingWords > 0 && totalWordBufferRef.current.length > 0) {
        const lastWords = totalWordBufferRef.current.slice(-remainingWords);
        console.log("Final refresh before disabling:", lastWords.join(" "));
        safeSend({
          type: "translate",
          mode: "refresh",
          text: lastWords.join(" "),
        });
        setTimeout(() => {
          if (ws.readyState === WebSocket.OPEN) ws.close();
        }, 2000);
      }
    }
  }, [enabled]);
}