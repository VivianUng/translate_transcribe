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
    } else if (toastParam === "signupSuccess") {
      toast.success("🎉 Successfully Signed Up!");
    } else if (toastParam === "updatePwSuccess") {
      toast.success("✅ Successfully Updated Password!");
    } else if (toastParam === "notAuthenticated") {
      toast.error("🚫 Cannot Access this Page!");
    }
  }, [toastParam]);
  return (
    <Toaster
      position="top-right"
      containerClassName="toast-container"
      toastOptions={{
        className: "toast-message",
        duration: 3000,
      }}
    />
  );
}
