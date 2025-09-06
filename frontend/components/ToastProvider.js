"use client";

import { Toaster, toast } from "react-hot-toast";
import { useSearchParams } from "next/navigation";
import { useEffect } from "react";

export default function ToastProvider() {
  const searchParams = useSearchParams();
  const toastParam = searchParams.get("toast");

  useEffect(() => {
    if (toastParam === "loginSuccess") {
      toast.success("🎉 Successfully Logged In!");
    } else if (toastParam === "logoutSuccess") {
      toast.success("👋 Successfully Logged Out!");
    }
  }, [toastParam]);
  return (
    <Toaster
      position="top-right"
      containerStyle={{
        top: "4.5rem",
        right: "1rem",
      }}
      toastOptions={{
        duration: 3000,
        style: {
          background: "#333",
          color: "#fff",
          borderRadius: "8px",
          padding: "12px",
        },
      }}
    />
  );
}
