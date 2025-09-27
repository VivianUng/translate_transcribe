// components/StickyScrollBox.js
"use client";

import { useStickyScroll } from "@/hooks/useStickyScroll";

export default function StickyScrollBox({
  content,
  placeholder,
  editable = false,
  onChange,
}) {
  // Always track scroll, but disable auto-scroll if editable
  const { ref, isAtBottom } = useStickyScroll(content, { autoScroll: !editable });

  function handleScrollToBottom() {
    if (ref?.current) {
      ref.current.scrollTop = ref.current.scrollHeight;
    }
  }

  return (
    <div className="sticky-scroll-wrapper">
      {editable ? (
        <textarea
          ref={ref}
          className="text-area"
          value={content || ""}
          placeholder={placeholder}
          onChange={(e) => onChange?.(e.target.value)}
        />
      ) : (
        <textarea className="text-area" ref={ref}
          value={content || ""} 
          placeholder={placeholder} 
          readOnly />
      )}

      {!isAtBottom && (
        <button className="button scroll-button" onClick={handleScrollToBottom}>
          ↓ Scroll to bottom
        </button>
      )}
    </div>
  );
}