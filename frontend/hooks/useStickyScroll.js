import { useEffect, useRef, useState } from "react";

/**
 * Custom hook to manage sticky scrolling behavior for a scrollable container.
 * Automatically keeps the container scrolled to the bottom if desired, but
 * respects user scrolling when they scroll up.
 * 
 * @param {any} content - The dynamic content inside the scrollable container
 * @param {Object} options
 * @param {boolean} options.autoScroll - Whether to auto-scroll to bottom when content changes (default: true)
 * @returns {Object} { ref, isAtBottom, canScroll }
 *  - ref: React ref to attach to the scrollable container
 *  - isAtBottom: boolean indicating if the scroll is currently at the bottom
 *  - canScroll: boolean indicating if content overflows and scrolling is possible
 */
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

    el.addEventListener("scroll", handleScroll);  // Listen for user scroll
    return () => el.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setCanScroll(el.scrollHeight > el.clientHeight); // True if content overflows
  }, [content]);


  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Only auto-scroll if autoScroll is enabled and user is at bottom
    if (autoScroll && isAtBottom) {
      el.scrollTop = el.scrollHeight;
    }
  }, [content, isAtBottom, autoScroll]);

  return { ref, isAtBottom, canScroll };
}