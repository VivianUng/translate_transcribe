import { useEffect, useRef, useState } from "react";

export function useStickyScroll(content, { autoScroll = true } = {}) {
  const ref = useRef(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [canScroll, setCanScroll] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    function handleScroll() {
      const threshold = 7; // pixels from bottom to consider "at bottom"
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
      setIsAtBottom(atBottom);
    }

    el.addEventListener("scroll", handleScroll);
    return () => el.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setCanScroll(el.scrollHeight > el.clientHeight);
  }, [content]);


  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (autoScroll && isAtBottom) {
      el.scrollTop = el.scrollHeight;
    }
  }, [content, isAtBottom, autoScroll]);

  return { ref, isAtBottom, canScroll };
}