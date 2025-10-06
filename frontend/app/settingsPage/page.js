"use client";
import LanguageSelect from "@/components/LanguageSelect"
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import useAuthCheck from "@/hooks/useAuthCheck";
import { supabase } from '../../lib/supabaseClient';
import toast from 'react-hot-toast';
import {confirmDeletion} from "@/components/ConfirmBox"

export default function SettingsPage() {
  const router = useRouter();
  const { isLoggedIn, load, session } = useAuthCheck({ redirectIfNotAuth: true, returnSession: true });
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [loadingSendEmail, setLoadingSendEmail] = useState(false);
  const [pwRequested, setPwRequested] = useState(false);
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

    try {
      const token = session?.access_token;
      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/profile`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        credentials: 'include',
      });

      if (!res.ok) {
        throw new Error("Failed to fetch profile");
      }

      const data = await res.json();

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
    } catch (error) {
      console.error("Error fetching profile:", error);
    } finally {
      setLoading(false);
    }
  };



  const updateProfile = async () => {
    setUpdating(true);
    if (!formData.name) {
      setUpdating(false);
      return toast.error("Name cannot be empty.")
    }

    try {
      const token = session?.access_token;
      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/profile`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        credentials: 'include',
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.detail || "Failed to update profile");
      }

      const data = await res.json();

      setProfile(formData);
      setFormData(formData);

      toast.success(data.message || "Profile updated successfully");
    } catch (err) {
      toast.error(err.message || "Error updating profile");
    } finally {
      setUpdating(false);
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

    toast("📩 Password reset email sent! Check your inbox.");
    setMessage("📩 Password reset email sent! Check your inbox.");
  };

  const deleteAccount = async () => {
    const confirmed = await confirmDeletion(`Are you sure you want to delete your account? \nThis is irreversible!`);
    if (!confirmed) return;

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
        credentials: 'include',
      });

      if (!res.ok) {
        throw new Error(res?.detail || "Failed to delete account");
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
          <label className="input-label">Name</label>
          <input
            type="text"
            value={formData.name}
            maxLength={100}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="input-field"
          />
        </div>
        <div className="input-group">
          <label className="input-label">Email</label>
          <input
            type="email"
            value={profile.email}
            disabled
            className="input-field input-disabled"
            title="Email cannot be changed"
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
          <label className="input-label">Default Language</label>
          {mounted && (
            <LanguageSelect
              mounted={mounted}
              value={formData.default_language}
              setValue={(val) => setFormData({ ...formData, default_language: val })}
              excludeAuto={true}
              className="react-select"
            />
          )}
        </div>

        {/* Update Profile Button */}
        <div className="action-container">
          <button
            className="button updateProfile-button"
            onClick={updateProfile}
            disabled={loading || updating || !isChanged}
          >
            {loading ? 'Loading...' : (updating ? 'Updating...' : 'Update Profile')}
          </button>
        </div>
      </section>

      {/* Account Actions */}
      <div className="button-group">
        <button className="button changePw-button" onClick={changePassword}
          disabled={loading || loadingSendEmail || pwRequested}>
          {loadingSendEmail ? "Sending Email..." : pwRequested ? "Email Sent" : "Change Password"}
        </button>
        <button className="button delete" onClick={deleteAccount}>
          Delete Account
        </button>
      </div>
      {message && <p className="message">{message}</p>}
    </div>

  );
}