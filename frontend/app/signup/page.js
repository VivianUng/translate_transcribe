"use client";

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { TooltipProvider } from "@/components/TooltipProvider";
import { Eye, EyeOff } from "lucide-react";

export default function Signup() {
  const router = useRouter();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rules, setRules] = useState(isStrongPassword(''));
  const [pwRequirementError, setPwRequirementError] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [confirmPwMismatch, setConfirmPwMismatch] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  function handlePasswordChange(e) {
    const value = e.target.value;
    setPassword(value);
    setPwRequirementError("");
    setRules(isStrongPassword(value));
  }

  function isStrongPassword(password) {
    const minLength = 8;

    const result = {
      length: password.length >= minLength,
      uppercase: /[A-Z]/.test(password),
      lowercase: /[a-z]/.test(password),
      number: /[0-9]/.test(password),
      special: /[^A-Za-z0-9]/.test(password),
    };

    return {
      ...result,
      valid: Object.values(result).every(Boolean)
    };
  }

  async function handleSignup(e) {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');

    const rulesCheck = isStrongPassword(password);
    let errorMessage = "";

    if (!rulesCheck.valid) {
      errorMessage += "Password does not meet all requirements. ";
    }

    if (password !== confirmPassword) {
      errorMessage += "Passwords do not match.";
    }

    if (errorMessage) {
      setPwRequirementError(
        !rulesCheck.valid ? "Password does not meet all requirements." : ""
      );
      setConfirmPwMismatch(
        password !== confirmPassword ? "Passwords do not match." : ""
      );

      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/signup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
          full_name: name,
          origin: window.location.origin
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.detail || "Something went wrong. Please try again.");
        setLoading(false);
        return;
      }

      if (data.status === "exists") {
        setErrorMsg(data.message);
        setLoading(false);
        return;
      }

      if (data.status === "success") {
        router.push("/login?from=signupSuccess&toast=signupSuccess");
        return;
      }

      // Fallback for unexpected cases
      setErrorMsg("Unexpected response from server.");
    } catch (err) {
      setErrorMsg(err.message || "An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  }


  async function handleGuest() {
    router.push("/");
  }


  return (
    <div className="signup-container">
      <h1 className="page-title">Create Account</h1>
      <form onSubmit={handleSignup}>
        <label className="input-label" htmlFor="name">Name</label>
        <br />
        <input
          id="name"
          type="text"
          placeholder="Enter your name"
          value={name}
          maxLength={100}
          onChange={(e) => setName(e.target.value)}
          required
          className="input-field name-field"
        />

        <label className="input-label" htmlFor="email">Email address</label>
        <br />
        <input
          id="email"
          type="email"
          placeholder="Enter your email"
          value={email}
          maxLength={150}
          onChange={(e) => { setEmail(e.target.value); setErrorMsg(""); }}
          required
          className="input-field email-field"
        />

        <div className="password-container" style={{ position: "relative" }}>
          <label className="input-label" htmlFor="password">Password</label>
          <br />

          <div style={{ marginTop: "0.5rem", marginBottom: "1rem" }}>
            <TooltipProvider
              message={pwRequirementError}
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

        <div className="password-checklist">
          <div className={rules.length ? "valid" : "invalid"}>
            {rules.length ? "✅" : "❌"} At least 8 characters
          </div>
          <div className={rules.uppercase ? "valid" : "invalid"}>
            {rules.uppercase ? "✅" : "❌"} At least one uppercase letter (A–Z)
          </div>
          <div className={rules.lowercase ? "valid" : "invalid"}>
            {rules.lowercase ? "✅" : "❌"} At least one lowercase letter (a–z)
          </div>
          <div className={rules.number ? "valid" : "invalid"}>
            {rules.number ? "✅" : "❌"} At least one number (0–9)
          </div>
          <div className={rules.special ? "valid" : "invalid"}>
            {rules.special ? "✅" : "❌"} At least one special character (!@#%&* etc.)
          </div>
        </div>

        <div className="password-container" style={{ position: "relative" }}>
          <label className="input-label" htmlFor="password">Confirm Password</label>
          <br />

          {/* wrapper that cancels input margin */}
          <div style={{ marginTop: "0.5rem", marginBottom: "2rem" }}>
            <TooltipProvider
              message={confirmPwMismatch}
              tooltipId="password-tooltip"
              place="top"
              style={{ display: "inline-block", width: "100%" }}
            >
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="Confirm your password"
                value={confirmPassword}
                maxLength={100}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  setConfirmPwMismatch("");
                }}
                required
                className="input-field password-field"
                style={{ margin: 0 }}
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

        <button
          type="submit"
          disabled={loading}
          className="button signup-button"
        >
          {loading ? "Signing up..." : "Signup"}
        </button>
      </form>

      {errorMsg && (
        <div className="error-message">
          {errorMsg}
        </div>
      )}

      <p className="signup-text">
        Already have an account?{" "}
        <Link href="/login" className="page-link-word login-link">
          Login
        </Link>
      </p>

      <p style={{ textAlign: "center" }}>
        OR
      </p>

      <div className="page-link-word continue-guest">
        <span onClick={handleGuest}>Continue as Guest</span>
      </div>
    </div>
  );
}
