// components/StickyScrollCopyBox.js
"use client";

import { useStickyScroll } from "@/hooks/useStickyScroll";
import { useState } from "react";
import { Copy, Check, ChevronsDown  } from "lucide-react";

export default function StickyScrollCopyBox({
  value,
  setValue,
  placeholder = "Type text...",
  readOnly = false,
  showCopy = true,
  onChangeExtra,
  autoScroll = false,
}) {
  const { ref, isAtBottom, canScroll } = useStickyScroll(value, {
    autoScroll: autoScroll,
  });

  const [copied, setCopied] = useState(false);

  function handleScrollToBottom() {
    if (ref?.current) {
      ref.current.scrollTop = ref.current.scrollHeight;
    }
  }

  async function handleCopy() {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="sticky-scroll-wrapper">
      <textarea
        ref={ref}
        className="text-area textarea-copy"
        value={value || ""}
        readOnly={readOnly}
        placeholder={placeholder}
        onChange={(e) => {
          if (readOnly) return;
          setValue(e.target.value);
          if (onChangeExtra) onChangeExtra(e.target.value);
        }}
      />

      {/* Sticky scroll button (bottom-right) */}
      {canScroll && !isAtBottom && (
        <button
          className="scroll-button"
          onClick={handleScrollToBottom}
          aria-label="Scroll to bottom"
          title="Scroll to bottom"
        >
          <ChevronsDown size={25} />
        </button>
      )}

      {/* Copy button (top-right) */}
      {showCopy && (
        <div className="copy-wrapper">
          <button
            type="button"
            onClick={handleCopy}
            className="copy-btn"
            aria-label="Copy text"
            title="Copy text"
          >
            {copied ? <Check size={25} /> : <Copy size={25} />}
          </button>
          {copied && <span className="copy-tooltip">Copied!</span>}
        </div>
      )}
    </div>
  );
}
