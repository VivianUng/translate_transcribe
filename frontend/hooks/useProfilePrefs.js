// hooks/useProfilePrefs.js
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

/**
 * Custom hook to fetch user profile preferences from Supabase.
 * 
 * @param {Object} session - Supabase session object containing the authenticated user
 * @param {Array} fields - Optional array of profile fields to fetch. Defaults to all fields ("*")
 * @returns {Object} { prefs, loading } - prefs: object with profile data, loading: boolean flag
 */
export default function useProfilePrefs(session, fields = []) {
  const [prefs, setPrefs] = useState({});   // Stores user profile preferences
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetches the specified fields from the 'profiles' table for the given user
    const loadProfilePrefs = async (user) => {
      if (!user) return; // Exit if no user is provided

      const { data, error } = await supabase
        .from("profiles")
        .select(fields.length ? fields.join(", ") : "*")
        .eq("id", user.id)
        .single();

      if (!error && data) {
        setPrefs(data); // Update prefs state if data is returned successfully
      }
      setLoading(false);
    };

    // If session exists, load profile preferences
    if (session?.user) {
      loadProfilePrefs(session.user);
    } else {
      setLoading(false);
    }
  }, [session, fields]);  // Re-run if session or requested fields change

  return { prefs, loading };
}
