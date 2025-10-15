"use client";

import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabaseClient";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSearchParams } from 'next/navigation';
import { TooltipProvider } from "@/components/TooltipProvider";
import { Eye, EyeOff } from "lucide-react";

export default function Login() {
  const router = useRouter();

  const searchParams = useSearchParams();
  const redirectParam = searchParams.get('from');

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [message, setMessage] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [emailErrorMsg, setEmailErrorMsg] = useState("");
  const [pwErrorMsg, setPwErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  useEffect(() => {
    if (redirectParam === "signupSuccess") {
      setMessage("Please confirm your email before logging in.");
    }else {
      setMessage("");
    }
  }, [redirectParam]);
  
  function handlePasswordChange(e) {
    const value = e.target.value;
    setPassword(value);
    setPwErrorMsg("");
  }

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
        setEmailErrorMsg("Failed to verify email. Please try again.");
        setLoading(false);
        return;
      }

      if (!emailExists) {
        setEmailErrorMsg("Account does not exist. Please sign up first.");
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
        setPwErrorMsg("Wrong password. Please try again.");
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
      setEmailErrorMsg("Please enter your email to reset password.");
      return;
    }

    setResetLoading(true);
    setErrorMsg("");

    const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/update-password`
    });

    setResetLoading(false);

    if (error) {
      setEmailErrorMsg(error.message);
      return;
    }

    setMessage("📩 Password reset email sent! Check your inbox.");
    setResetSent(true); // disable after successful send

  }

  async function handleGuest() {
    router.push("/");
  }

  return (
    <div className="login-container">
      <h1 className="page-title">Log In</h1>
      {message && (
        <p style={{ color: 'green', marginBottom: '1rem', textAlign: 'center' }}>
          {message}
        </p>
      )}
      <p style={{ textAlign: "center" }}>Enter your credentials to access your account</p>
      <form onSubmit={handleLogin}>
        <label className="input-label" htmlFor="email">Email address</label>
        <br />
        <div style={{ marginTop: "0.5rem", marginBottom: "1rem" }}>
          <TooltipProvider
            message={emailErrorMsg}
            tooltipId="email-exists-tooltip"
            place="top"
            style={{ display: "inline-block", width: "100%" }}
          >
            <input
              id="email"
              type="email"
              placeholder="Enter your email"
              value={email}
              maxLength={150}
              onChange={(e) => { setEmail(e.target.value); setErrorMsg(""); setEmailErrorMsg(""); }}
              required
              className="input-field email-field"
              style={{ margin: 0 }}   // cancel margin so tooltip hugs input
            />
          </TooltipProvider>
        </div>

        <div className="password-container" style={{ position: "relative" }}>
          <label className="input-label" htmlFor="password">Password</label>
          <br />
          <div style={{ marginTop: "0.5rem", marginBottom: "1rem" }}>
            <TooltipProvider
              message={pwErrorMsg}
              tooltipId="password-requirements-tooltip"
              place="top"
              style={{ display: "inline-block", width: "100%" }}
            >
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                value={password}
                maxLength={100}
                onChange={handlePasswordChange}
                required
                className="input-field password-field"
                style={{ margin: 0 }}   // cancel margin so tooltip hugs input
              />
            </TooltipProvider>

            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="toggle-visibility"
              style={{ transform: "none" }}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>
        {/* Forgot password link */}
        <span
          className={`page-link-word forgot-password ${resetSent || resetLoading ? "disabled" : ""}`}
          onClick={resetSent ? undefined : handleForgotPw}
        >
          {resetLoading
            ? "Sending reset email..."
            : resetSent
              ? "Reset Email Sent"
              : "Forgot password"}
        </span>

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
        {"Don't have an account? "}
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