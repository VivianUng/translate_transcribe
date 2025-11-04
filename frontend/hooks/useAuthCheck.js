"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

/**
 * Hook to check Supabase authentication status.
 * It can optionally redirect unauthenticated users to login and/or return the session object.
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
    let mounted = true; // to prevent state updates on unmounted component

    const initAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession(); // fetch current session
      if (!mounted) return;

      setSession(session);
      setIsLoggedIn(!!session);
      setLoading(false);

      // Redirect to login if not authenticated and option enabled
      if (redirectIfNotAuth && !session) {
        router.push("/login?toast=notAuthenticated");
      }
    };

    initAuth();

    // Listen for auth state changes (login / logout)
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setSession(session);
      setIsLoggedIn(!!session);
    });

    // Cleanup subscription on unmount
    return () => {
      mounted = false;
      subscription?.subscription?.unsubscribe?.();
    };
  }, [router, redirectIfNotAuth]);

  // Return session object only if requested
  return returnSession
    ? { isLoggedIn, loading, session }
    : { isLoggedIn, loading };
}

export default useAuthCheck;
