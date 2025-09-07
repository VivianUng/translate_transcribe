"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from '../../lib/supabaseClient';

export default function SettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkAuth() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push("/login?toast=notAuthenticated");
      } else {
        setLoading(false);
      }
    }
    checkAuth();
  }, [router]);

  if (loading) return <p>Loading...</p>;

  return (
    <div className="container">
      <h1 className="page-title">Settings</h1>
      <p> Settings page </p>
    </div>
  );
}