"use client";
import Select from "react-select";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import useAuthCheck from "@/hooks/useAuthCheck";
import { supabase } from '../../lib/supabaseClient';
import { useLanguages } from "@/contexts/LanguagesContext";
import toast from 'react-hot-toast';

export default function SettingsPage() {
  const router = useRouter();
  const { isLoggedIn, load, session } = useAuthCheck({ redirectIfNotAuth: true, returnSession: true });
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingSendEmail, setLoadingSendEmail] = useState(false);
  const [pwRequested, setPwRequested] = useState(false);
  const { languages, error } = useLanguages();
  const [mounted, setMounted] = useState(false);

  const [formData, setFormData] = useState({
    id: '',
    name: '',
    email: '',
    auto_save_translations: false,
    auto_save_summaries: false,
    auto_save_conversations: false,
    auto_save_meetings: false,
    default_language: 'en',
  });

  const [profile, setProfile] = useState({
    id: '',
    name: '',
    email: '',
    auto_save_translations: false,
    auto_save_summaries: false,
    auto_save_conversations: false,
    auto_save_meetings: false,
    default_language: 'en',
  });

  const isChanged = JSON.stringify(formData) !== JSON.stringify(profile);



  useEffect(() => {
    setMounted(true);
    if (session) {
      fetchProfile();
    }
  }, [session]);


  const fetchProfile = async () => {
    if (!session?.user) {
      console.error("No session or user found");
      return;
    }

    setLoading(true);

    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", session.user.id)
      .single();

    if (error) {
      console.error(error);
    } else {
      const normalized = {
        id: data?.id ?? session.user.id,
        name: data?.name ?? "",
        email: session.user.email ?? "",
        auto_save_translations: data?.auto_save_translations ?? false,
        auto_save_summaries: data?.auto_save_summaries ?? false,
        auto_save_conversations: data?.auto_save_conversations ?? false,
        auto_save_meetings: data?.auto_save_meetings ?? false,
        default_language: data?.default_language ?? "en",
      };

      // set both to the same normalized object
      setProfile(normalized);
      setFormData(normalized);
    }

    setLoading(false);
  };



  const updateProfile = async () => {
    setLoading(true);
    if (!formData.name) {
      setLoading(false);
      return toast.error("Name cannot be empty.")
    }

    try {
      const { error: profileError } = await supabase
        .from("profiles")
        .upsert({
          id: formData.id,
          name: formData.name,
          email: formData.email,
          auto_save_translations: formData.auto_save_translations,
          auto_save_summaries: formData.auto_save_summaries,
          auto_save_conversations: formData.auto_save_conversations,
          auto_save_meetings: formData.auto_save_meetings,
          default_language: formData.default_language,
          updated_at: new Date().toISOString(),
        });

      if (profileError) throw profileError;

      const { error: authError } = await supabase.auth.updateUser({
        data: { full_name: formData.name },
      });

      if (authError) throw authError;

      setProfile(formData);

      toast.success("Profile updated successfully");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };



  const changePassword = async () => {
    setLoadingSendEmail(true);
    setMessage("");
    if (pwRequested) return; // prevent double click
    setPwRequested(true);

    const { data, error } = await supabase.auth.resetPasswordForEmail(profile.email, {
      redirectTo: `${window.location.origin}/update-password`
    });

    setLoadingSendEmail(false);

    if (error) {
      setMessage(error.message);
      setPwRequested(false); // allow retry if error
      return;
    }

    setMessage("✅ Password reset email sent! Check your inbox.");
  };

  const deleteAccount = async () => {
    if (!confirm("Are you sure you want to delete your account? This is irreversible!")) return;

    try {
      // 1. Get Supabase JWT token
      const token = session?.access_token;

      if (!token) {
        toast.error("You must be logged in to delete your account.");
        return;
      }

      // 2. Call backend route
      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/delete-account`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        throw new Error(dataRes?.detail || "Failed to delete account");
      }

      // 4. Clear local session + redirect
      await supabase.auth.signOut();
      router.push("/?toast=deleteAccSuccess");

    } catch (err) {
      console.error("Delete account error:", err);
      toast.error(err.message || "Something went wrong, please try again");
    }
  };

  return (
    <div className="page-container">
      <h1 className="page-title">Settings</h1>

      <section className="section">
        <h2 className="section-header">Profile & Preferences</h2>

        {/* Profile */}
        <div className="input-group">
          <label>Name</label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="input-field"
          />
        </div>
        <div className="input-group">
          <label>Email (fixed)</label>
          <input
            type="email"
            value={profile.email}
            disabled
            className="input-field input-disabled"
          />
        </div>

        <hr className="divider" />

        {/* Preferences */}
        {[
          { key: 'auto_save_conversations', label: 'Auto-save Conversations' },
          { key: 'auto_save_translations', label: 'Auto-save Translations' },
          { key: 'auto_save_summaries', label: 'Auto-save Summaries' },
          { key: 'auto_save_meetings', label: 'Auto-save Meetings' },
        ].map(({ key, label }) => (
          <div key={key} className="checkbox-group">
            <input
              type="checkbox"
              checked={formData[key]}
              onChange={(e) => setFormData({ ...formData, [key]: e.target.checked })}
            />
            <label>{label}</label>
          </div>
        ))}

        <hr className="divider" />

        {/* Language */}
        <div className="input-group">
          <label>Default Language</label>
          {mounted && (
            <Select
              options={languages}
              value={languages.find((opt) => opt.value === formData.default_language)}
              onChange={(opt) => setFormData({ ...formData, default_language: opt.value })}
            />
          )}
        </div>

        {/* Update Profile Button */}
        <div className="action-container">
          <button
            className="button updateProfile-button"
            onClick={updateProfile}
            disabled={loading || !isChanged}
          >
            {loading ? 'Updating...' : 'Update Profile'}
          </button>
        </div>
      </section>

      {/* Account Actions */}
      <div className="account-actions">
        <button className="button changePw-button" onClick={changePassword} 
        disabled={loading || loadingSendEmail || pwRequested}>
          {loadingSendEmail ? "Sending Email..." : pwRequested ? "Email Sent" : "Change Password"}
        </button>
        <button className="button danger-button" onClick={deleteAccount}>
          Delete Account
        </button>
      </div>
      {message && <p className="message">{message}</p>}
    </div>

  );
}