// components/StickyScrollBox.js
"use client";

import React from "react";
import { useStickyScroll } from "@/hooks/useStickyScroll";

export default function StickyScrollBox({ content, placeholder }) {
  const { ref, isAtBottom } = useStickyScroll(content);

  function handleScrollToBottom() {
    if (ref.current) {
      ref.current.scrollTop = ref.current.scrollHeight;
    }
  }

  return (
    <div className="sticky-scroll-wrapper">
      <div className="scrollable-box" ref={ref}>
        <pre className="section-content">
          {content || placeholder}
        </pre>
      </div>

      {!isAtBottom && (
        <button
          className="scroll-button"
          onClick={handleScrollToBottom}
        >
          ↓ Scroll to bottom
        </button>
      )}
    </div>
  );
}
