"use client";

import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabaseClient";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSearchParams } from 'next/navigation';
import { Eye, EyeOff } from "lucide-react";

export default function Login() {
  const router = useRouter();

  const searchParams = useSearchParams();
  const toastParam = searchParams.get('from');

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [errorMsg, setErrorMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  async function handleLogin(e) {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");

    try {
      // Check if email exists
      const { data: emailExists, error: errorEmailExist } = await supabase.rpc("email_exists", {
        check_email: email,
      });

      if (errorEmailExist) {
        setErrorMsg("Failed to verify email. Please try again.");
        setLoading(false);
        return;
      }

      if (!emailExists) {
        setErrorMsg("Account does not exist. Please sign up first.");
        setLoading(false);
        return;
      }

      // Attempt login
      const { error: loginError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      setLoading(false);

      if (loginError) {
        setErrorMsg("Wrong password. Please try again.");
      } else {
        router.push("/");
      }
    } catch (err) {
      setErrorMsg("An unexpected error occurred. Please try again.");
      setLoading(false);
      console.error(err);
    }
  }


  async function handleForgotPw() {
    if (!email) {
      setErrorMsg("Please enter your email to reset password.");
      return;
    }

    setResetLoading(true);
    setErrorMsg("");

    const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/update-password`
    });

    setResetLoading(false);

    if (error) {
      setErrorMsg(error.message);
      return;
    }

    setErrorMsg("📩 Password reset email sent! Check your inbox.");
    setResetSent(true); // disable after successful send

  }

  async function handleGuest() {
    router.push("/");
  }

  return (
    <div className="login-container">
      <h1 className="page-title">Log In</h1>
      {toastParam === 'signupSuccess' && (
        <p style={{ color: 'green', marginBottom: '1rem' }}>
          Please confirm your email before logging in.
        </p>
      )}
      <p>Enter your credentials to access your account</p>
      <form onSubmit={handleLogin}>
        <label className="input-label" htmlFor="email">Email address</label>
        <br />
        <input
          id="email"
          type="email"
          placeholder="Enter your email"
          value={email}
          onChange={(e) => (setEmail(e.target.value), setErrorMsg(""))}
          required
          className="input-field input-field"
        />

        <div className="password-container" style={{ position: "relative" }}>
          <label className="input-label" htmlFor="password">Password</label>
          <br />
          <input
            id="password"
            type={showPassword ? "text" : "password"}
            placeholder="Enter your password"
            value={password}
            onChange={(e) => (setPassword(e.target.value), setErrorMsg(""))}
            required
            className="input-field input-field"
          />

          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="toggle-visibility"
          >
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
        {/* Forgot password link */}
        <div className="page-link-word forgot-password">
          <span
            onClick={resetSent ? undefined : handleForgotPw}
            style={{ opacity: resetSent ? 0.6 : 1, pointerEvents: resetSent ? "none" : "auto" }}
          >
            {resetLoading
              ? "Sending reset email..."
              : resetSent
                ? "Reset Email Sent"
                : "Forgot password"}
          </span>
        </div>
        <button
          className="button login-button"
          type="submit"
          disabled={loading || resetLoading}
        >
          {loading
            ? "Logging in..."
            : resetLoading
              ? "Sending reset email..."
              : "Login"}
        </button>
      </form>
      {errorMsg && <p className="error-message">{errorMsg}</p>}
      <p className="signup-text">
        Don't have an account?{" "}
        <Link href="/signup" className="page-link-word signup-link">
          Signup
        </Link>
      </p>
      <p style={{ textAlign: "center" }}>OR</p>
      <div className="page-link-word continue-guest">
        <span onClick={handleGuest}>Continue as Guest</span>
      </div>

    </div>
  );

}