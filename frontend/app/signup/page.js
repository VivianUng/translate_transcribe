"use client";

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function Signup() {
  const router = useRouter();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function fetchSession() {
      const { data } = await supabase.auth.getSession();
      setIsLoggedIn(!!data.session);
    }
    fetchSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsLoggedIn(!!session);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // currently using Supabase strongpw checking 
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

    // const result = isStrongPassword(password);

    // if (!result.valid) {
    //   setErrorMsg(result.message);
    //   setLoading(false);
    //   return;
    // }

    const { data: emailExists, error: errorEmailExist } = await supabase.rpc("email_exists", {
      check_email: email,
    });

    if (errorEmailExist) {
      setErrorMsg(errorEmailExist);
      setLoading(false);
      return;
    } else if (emailExists) {
      setErrorMsg('This email is already registered. Please log in instead.');
      setLoading(false);
      return;
    } else { // continue with creation of account if no existing account
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: name } },
      });

      setLoading(false);

      if (error) {
        setErrorMsg(error.message);
        return;
      }

      // Success
      setIsLoggedIn(true);
      router.push('/login?toast=signupSuccess');
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
          onChange={(e) => setName(e.target.value)}
          required
          className="login-input"
        />

        <label className="input-label" htmlFor="email">Email address</label>
        <br />
        <input
          id="email"
          type="email"
          placeholder="Enter your email"
          value={email}
          onChange={(e) => { setEmail(e.target.value); setErrorMsg(""); }}
          required
          className="login-input"
        />

        <label className="input-label" htmlFor="password">Password</label>
        <br />
        <input
          id="password"
          type="password"
          placeholder="Enter your password"
          value={password}
          onChange={(e) => { setPassword(e.target.value); setErrorMsg(""); }}
          required
          className="login-input"
        />

        <button
          type="submit"
          disabled={loading}
          className="button signup-button"
        >
          {loading ? "Signing up..." : "Signup"}
        </button>
      </form>

      {errorMsg && (
        <div className="error-message text-red-500">
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
