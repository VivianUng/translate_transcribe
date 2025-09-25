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
          className="scrollable-box editable-box"
          value={content || ""}
          placeholder={placeholder}
          onChange={(e) => onChange?.(e.target.value)}
        />
      ) : (
        <div className="scrollable-box" ref={ref}>
          <pre className="section-content">
            {content || placeholder}
          </pre>
        </div>
      )}

      {!isAtBottom && (
        <button className="scroll-button" onClick={handleScrollToBottom}>
          ↓ Scroll to bottom
        </button>
      )}
    </div>
  );
}