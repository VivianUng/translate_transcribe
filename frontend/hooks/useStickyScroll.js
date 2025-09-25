import { useEffect, useRef, useState } from "react";

export function useStickyScroll(content, { autoScroll = true } = {}) {
  const ref = useRef(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    function handleScroll() {
      const atBottom = el.scrollHeight - el.scrollTop <= el.clientHeight + 5;
      setIsAtBottom(atBottom);
    }

    el.addEventListener("scroll", handleScroll);
    return () => el.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (autoScroll && isAtBottom) {
      el.scrollTop = el.scrollHeight;
    }
  }, [content, isAtBottom, autoScroll]);

  return { ref, isAtBottom };
}