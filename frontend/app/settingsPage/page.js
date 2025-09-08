"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import useAuthCheck from "@/hooks/useAuthCheck";
import { supabase } from '../../lib/supabaseClient';
import toast from 'react-hot-toast';

export default function SettingsPage() {
  const router = useRouter();
  const { isLoggedIn, load, session } = useAuthCheck({ redirectIfNotAuth: true, returnSession: true });

  const [profile, setProfile] = useState({
    name: '',
    email: '',
    auto_save_translations: false,
    auto_save_transcriptions: false,
    auto_save_conversations: false,
    auto_save_meetings: false,
    default_language: 'en',
  });

  const [loading, setLoading] = useState(false);

  const languageOptions = [
    { value: 'en', label: 'English' },
    { value: 'ms', label: 'Malay' },
    { value: 'zh', label: 'Chinese' },
    { value: 'es', label: 'Spanish' },
    // change to use language component
  ];

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();
    if (error) console.error(error);
    else setProfile({ ...profile, ...data, email: user.email, id: user.id });
    setLoading(false);
  };

  const updateProfile = async () => {
    setLoading(true);

    const { error } = await supabase
      .from('profiles')
      .upsert({
        id: profile.id,
        name: profile.name,
        auto_save_translations: profile.auto_save_translations,
        auto_save_transcriptions: profile.auto_save_transcriptions,
        auto_save_conversations: profile.auto_save_conversations,
        auto_save_meetings: profile.auto_save_meetings,
        default_language: profile.default_language,
      });

    if (error) toast.error(error.message);
    else toast.success('Profile updated successfully');

    setLoading(false);
  };

  const changePassword = async () => {
    const { error } = await supabase.auth.resetPasswordForEmail(profile.email);
    if (error) toast.error(error.message);
    else toast.success('Password reset email sent');
  };

  const deleteAccount = async () => {
    if (!confirm('Are you sure you want to delete your account? This is irreversible!')) return;

    const { data: { user } } = await supabase.auth.getUser();
    const { error: deleteProfileError } = await supabase
      .from('profiles')
      .delete()
      .eq('id', user.id);
    if (deleteProfileError) return toast.error(deleteProfileError.message);

    const { error: deleteUserError } = await supabase.auth.deleteUser(user.id);
    if (deleteUserError) return toast.error(deleteUserError.message);

    toast.success('Account deleted successfully');
    setIsLoggedIn(false);
    router.push("/?toast=deleteAccSuccess");
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
            value={profile.name}
            onChange={(e) => setProfile({ ...profile, name: e.target.value })}
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
          { key: 'auto_save_transcriptions', label: 'Auto-save Transcriptions' },
          { key: 'auto_save_meetings', label: 'Auto-save Meetings' },
        ].map(({ key, label }) => (
          <div key={key} className="checkbox-group">
            <input
              type="checkbox"
              checked={profile[key]}
              onChange={(e) => setProfile({ ...profile, [key]: e.target.checked })}
            />
            <label>{label}</label>
          </div>
        ))}

        <hr className="divider" />

        {/* Language */}
        <div className="input-group">
          <label>Default Language</label>
          <select
            value={profile.default_language}
            onChange={(e) => setProfile({ ...profile, default_language: e.target.value })}
            className="input-field"
          >
            {languageOptions.map(lang => (
              <option key={lang.value} value={lang.value}>{lang.label}</option>
            ))}
          </select>
        </div>

        {/* Update Profile Button */}
        <div className="action-container">
          <button
            className="button updateProfile-button"
            onClick={updateProfile}
            disabled={loading}
          >
            {loading ? 'Updating...' : 'Update Profile'}
          </button>
        </div>
      </section>

      {/* Account Actions */}
      <div className="account-actions">
        <button className="button changePw-button" onClick={changePassword}>
          Change Password
        </button>
        <button className="button danger-button" onClick={deleteAccount}>
          Delete Account
        </button>
      </div>
    </div>

  );
}