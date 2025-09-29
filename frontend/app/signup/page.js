"use client";

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff } from "lucide-react";

export default function Signup() {
  const router = useRouter();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);

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
      message: errors.length === 0
        ? "✅ Strong password!"
        : errors.join("\n")
    };
  }

  async function handleSignup(e) {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');

    const result = isStrongPassword(password);

    if (!result.valid) {
      setErrorMsg(result.message);
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
          className="input-field"
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
          className="input-field"
        />

        <div className="password-container" style={{ position: "relative" }}>
          <label className="input-label" htmlFor="password">Password</label>
          <br />
          <input
            id="password"
            type={showPassword ? "text" : "password"}
            placeholder="Enter your password"
            value={password}
            maxLength={100}
            onChange={(e) => setPassword(e.target.value)}
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
          {errorMsg.split("\n").map((line, idx) => (
            <div key={idx}>{line}</div>
          ))}
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
