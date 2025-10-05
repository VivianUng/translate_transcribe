// hooks/useBeforeUnload.js
import { useEffect } from "react";

export function useBeforeUnload(listening) {
  useEffect(() => {
    const handleBeforeUnload = (event) => {
      if (listening) {
        event.preventDefault();
        event.returnValue =
          "A meeting is still in progress. Are you sure you want to leave?";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () =>
      window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [listening]);
}