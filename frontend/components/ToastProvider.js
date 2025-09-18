"use client";

import { Toaster, toast } from "react-hot-toast";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function ToastProvider() {
  const searchParams = useSearchParams();
  const toastParam = searchParams.get("toast");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);

    // Query param–based toasts
    if (toastParam === "signupSuccess") {
      toast.success("🎉 Successfully Signed Up!");
    } else if (toastParam === "updatePwSuccess") {
      toast.success("Successfully Updated Password!");
    } else if (toastParam === "notAuthenticated") {
      toast.error("🚫 Cannot Access this Page!");
    } else if (toastParam === "deleteAccSuccess") {
      toast.success("Account Deleted.");
    } else if (toastParam === "createMeetingSuccess") {
      toast.success("Successfully Created New Meeting.");
    } else if (toastParam === "updateMeetingSuccess") {
      toast.success("Successfully Updated Meeting.");
    } else if (toastParam === "deleteMeetingSuccess") {
      toast.success("Successfully Deleted Meeting.");
    } else if (toastParam === "notFound") {
      toast.success("Record Not Found.");
    }
    

    // Auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event) => {
        switch (event) {
          case "SIGNED_IN":
            if (!toastParam && !localStorage.getItem("loginToastShown")) {
              toast.success("🎉 Successfully Logged In!");
              localStorage.setItem("loginToastShown", "true");
            }
            break;

          case "SIGNED_OUT":
            toast.success("👋 Successfully Logged Out!");
            localStorage.removeItem("loginToastShown");
            break;
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [toastParam]);

  return mounted ? (
    <Toaster
      position="top-right"
      containerClassName="toast-container"
      toastOptions={{
        className: "toast-message",
        duration: 3000,
      }}
    />
  ) : null;
}