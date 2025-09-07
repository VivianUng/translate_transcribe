"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import useAuthCheck from "@/hooks/useAuthCheck";
import { supabase } from '../../lib/supabaseClient';

export default function SettingsPage() {
  const router = useRouter();
  const { isLoggedIn, loading, session } = useAuthCheck({ redirectIfNotAuth: true, returnSession: true });

  if (loading) return <p>Loading...</p>;

  return (
    <div className="container">
      <h1 className="page-title">Settings</h1>
      <p> Settings page </p>
    </div>
  );
}