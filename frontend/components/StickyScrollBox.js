// components/StickyScrollBox.js
"use client";

import { useStickyScroll } from "@/hooks/useStickyScroll";

export default function StickyScrollBox({
  content,
  placeholder,
  editable = false,
  onChange,
}) {
  // Only use sticky scroll if not editable
  const { ref, isAtBottom } = !editable ? useStickyScroll(content) : { ref: null, isAtBottom: true };

  function handleScrollToBottom() {
    if (ref?.current) {
      ref.current.scrollTop = ref.current.scrollHeight;
    }
  }

  return (
    <div className="sticky-scroll-wrapper">
      {editable ? (
        <textarea
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

      {!editable && !isAtBottom && (
        <button className="scroll-button" onClick={handleScrollToBottom}>
          ↓ Scroll to bottom
        </button>
      )}
    </div>
  );
}


// // components/StickyScrollBox.js
// "use client";

// import React from "react";
// import { useStickyScroll } from "@/hooks/useStickyScroll";

// export default function StickyScrollBox({ content, placeholder }) {
//   const { ref, isAtBottom } = useStickyScroll(content);

//   function handleScrollToBottom() {
//     if (ref.current) {
//       ref.current.scrollTop = ref.current.scrollHeight;
//     }
//   }

//   return (
//     <div className="sticky-scroll-wrapper">
//       <div className="scrollable-box" ref={ref}>
//         <pre className="section-content">
//           {content || placeholder}
//         </pre>
//       </div>

//       {!isAtBottom && (
//         <button
//           className="scroll-button"
//           onClick={handleScrollToBottom}
//         >
//           ↓ Scroll to bottom
//         </button>
//       )}
//     </div>
//   );
// }
