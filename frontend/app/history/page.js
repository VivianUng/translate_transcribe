"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from '../../lib/supabaseClient';

export default function History() {
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
      <h1 className="page-title">History</h1>
      <p> History page </p>
    </div>

  );
}