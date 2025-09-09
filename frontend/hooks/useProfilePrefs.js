// hooks/useProfilePrefs.js
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function useProfilePrefs(session, fields = []) {
  const [prefs, setPrefs] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadProfilePrefs = async (user) => {
      if (!user) return;

      const { data, error } = await supabase
        .from("profiles")
        .select(fields.length ? fields.join(", ") : "*")
        .eq("id", user.id)
        .single();

      if (!error && data) {
        setPrefs(data);
      }
      setLoading(false);
    };

    if (session?.user) {
      loadProfilePrefs(session.user);
    } else {
      setLoading(false);
    }
  }, [session, fields]);

  return { prefs, loading };
}
