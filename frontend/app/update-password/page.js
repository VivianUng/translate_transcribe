"use client";

import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useRouter, useSearchParams, redirect } from "next/navigation";

export default function UpdatePassword() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const access_token = searchParams.get("access_token");
  const type = searchParams.get("type");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [loading, setLoading] = useState(false);

  // Password strength validation function
  function isStrongPassword(password) {
    const minLength = 8;
    const errors = [];

    if (password.length < minLength) {
      errors.push(`Password must be at least ${minLength} characters long.`);
    }
    if (!/[A-Z]/.test(password)) {
      errors.push("Password must contain at least one uppercase letter (A–Z).");
    }
    if (!/[a-z]/.test(password)) {
      errors.push("Password must contain at least one lowercase letter (a–z).");
    }
    if (!/[0-9]/.test(password)) {
      errors.push("Password must contain at least one number (0–9).");
    }
    if (!/[^A-Za-z0-9]/.test(password)) {
      errors.push("Password must contain at least one special character (!@#$%^&* etc.).");
    }

    return {
      valid: errors.length === 0,
      messages: errors.length === 0 ? ["✅ Strong password!"] : errors,
    };
  }

  async function handleUpdatePassword(e) {
    e.preventDefault();
    setErrorMsg("");
    setLoading(true);

    // Validate password strength
    const result = isStrongPassword(password);
    if (!result.valid) {
      setErrorMsg(result.messages.join("\n"));
      setLoading(false);
      return;
    }

    // Confirm passwords match
    if (password !== confirmPassword) {
      setErrorMsg("❌ Password and confirm password do not match.");
      setLoading(false);
      return;
    }

    try {
      // Update password via Supabase
      const { error } = await supabase.auth.updateUser({ password });

      setLoading(false);

      if (error) {
        setErrorMsg(error.message);
        return;
      }

      // Success — redirect to main page (signed in)
      router.push("/?toast=updatePwSuccess");
    } catch (err) {
      setLoading(false);
      setErrorMsg("An unexpected error occurred. Please try again.");
      console.error(err);
    }
  }

  return (
    <div className="updatePw-container">
      <h1 className="page-title">Update Password</h1>

      <form onSubmit={handleUpdatePassword}>
        <label className="input-label" htmlFor="password">New Password</label>
        <br />
        <input
          id="password"
          type="password"
          placeholder="Enter new password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="input-field"
        />

        <label className="input-label" htmlFor="confirmPassword">Confirm Password</label>
        <br />
        <input
          id="confirmPassword"
          type="password"
          placeholder="Confirm new password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          className="input-field"
        />

        <button
          type="submit"
          disabled={loading}
          className="button updatePw-button"
        >
          {loading ? "Updating..." : "Update Password"}
        </button>
      </form>

      {errorMsg && (
        <div className="error-message text-red-500 whitespace-pre-line mt-2">
          {errorMsg}
        </div>
      )}
    </div>
  );
}
