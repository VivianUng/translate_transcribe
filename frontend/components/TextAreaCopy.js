import { useState } from "react";
import { Copy, Check } from "lucide-react";

export default function TextAreaCopy({
  value,
  setValue,
  placeholder = "Type text...",
  onChangeExtra,
  showCopy = true,
  readOnly = false,
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="textarea-container">
      <textarea
        className={`text-area textarea-copy`}
        value={value}
        readOnly={readOnly}
         onChange={(e) => {
          if (readOnly) return;
          setValue(e.target.value);
          if (onChangeExtra) onChangeExtra(e.target.value);
        }}
        placeholder={placeholder}
      />

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
