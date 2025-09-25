"use client";

import { Toaster, toast } from "react-hot-toast";
import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function ToastProvider() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const toastParam = searchParams.get("toast");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);

    if (toastParam) {
      try {
        switch (toastParam) {
          case "signupSuccess":
            toast.success("🎉 Successfully Signed Up!");
            break;
          case "updatePwSuccess":
            toast.success("Successfully Updated Password!");
            break;
          case "notAuthenticated":
            toast.error("🚫 Cannot Access this Page!");
            break;
          case "deleteAccSuccess":
            toast.success("Account Deleted.");
            break;
          case "createMeetingSuccess":
            toast.success("Successfully Created New Meeting.");
            break;
          case "updateMeetingSuccess":
            toast.success("Successfully Updated Meeting.");
            break;
          case "deleteMeetingSuccess":
            toast.success("Successfully Deleted Meeting.");
            break;
          case "meetingEnd":
            toast.success("Meeting Ended.");
            break;
          case "notFound":
            toast.error("Record Not Found.");
            break;
          case "pageNotFound":
            toast.error("Page Not Found")
            break;
        }
      } catch (err) {
        console.error("Error showing toast:", err);
      } finally {
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.delete("toast");
        router.replace(newUrl.toString());
      }
    }

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
  }, [toastParam, router]);


  return mounted ? (
    <Toaster
      position="top-center"
      containerClassName="toast-container"
      toastOptions={{
        className: "toast-message",
        duration: 3000,
        success: {
          className: "toast-message toast-success",
        },
        error: {
          className: "toast-message toast-error",
        },
      }}
    />
  ) : null;
}