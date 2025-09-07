"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

/**
 * Hook to check Supabase authentication status.
 * @param {Object} options
 * @param {boolean} options.redirectIfNotAuth - Whether to redirect to login if not authenticated
 * @param {boolean} options.returnSession - Whether to return the session object
 */
function useAuthCheck({ redirectIfNotAuth = true, returnSession = false } = {}) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    let mounted = true;

    const initAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!mounted) return;

      setSession(session);
      setIsLoggedIn(!!session);
      setLoading(false);

      if (redirectIfNotAuth && !session) {
        router.push("/login?toast=notAuthenticated");
      }
    };

    initAuth();

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setSession(session);
      setIsLoggedIn(!!session);
    });

    return () => {
      mounted = false;
      subscription?.subscription?.unsubscribe?.();
    };
  }, [router, redirectIfNotAuth]);

  return returnSession
    ? { isLoggedIn, loading, session }
    : { isLoggedIn, loading };
}

export default useAuthCheck;
