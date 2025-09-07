"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import useAuthCheck from "@/hooks/useAuthCheck";
import { supabase } from '../../lib/supabaseClient';

export default function History() {
  const { isLoggedIn, loading, session } = useAuthCheck({ redirectIfNotAuth: true, returnSession: true });
  if (loading) return <div>Loading...</div>;

  return (

    <div className="container">
      <h1 className="page-title">History</h1>
      <p> History page </p>
      <div>
        Welcome, {session.user.email}!
      </div>
    </div>

  );
}