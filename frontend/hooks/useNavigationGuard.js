// hooks/useNavigationGuard.js
"use client";
import { useEffect, useRef  } from "react";
import { useRouter, usePathname } from "next/navigation";
import { confirmExit } from "@/components/ConfirmBox";

export function useNavigationGuard(listening, handleEndMeeting) {
  const router = useRouter();
  const pathname = usePathname();
  const prevPath = useRef(pathname);

  useEffect(() => {
    // update previous path when not listening (normal navigation)
    if (!listening) {
      prevPath.current = pathname;
      return;
    }

    // user navigated to a new route while listening
    if (pathname !== prevPath.current) {
      const handleConfirm = async () => {
        const confirmed = await confirmExit(
          "You are currently in a meeting. Are you sure you want to leave? This will end the meeting."
        );

        if (confirmed) {
          await handleEndMeeting();
          prevPath.current = pathname; // allow staying on new page
        } else {
          // revert back immediately
          router.push(prevPath.current);
        }
      };

      handleConfirm();
    }
  }, [pathname, listening, handleEndMeeting, router]);
}
