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

  function isStrongPassword(password) {
    const minLength = 8;
    const hasUpper = /[A-Z]/.test(password);
    const hasLower = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecial = /[^A-Za-z0-9]/.test(password);

    return (
      password.length >= minLength &&
      hasUpper &&
      hasLower &&
      hasNumber &&
      hasSpecial
    );
  }

  async function handleSignup(e) {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');

    if (!isStrongPassword(password)) {
      setErrorMsg("Password must be at least 8 chars and include upper, lower, number, and symbol.");
      setLoading(false);
      return;
    }

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

    // Supabase "duplicate email" case: no error, but user is null
    if (!data.user) {
      setErrorMsg('This email is already registered. Please log in instead.');
      return;
    }

    // Success
    setIsLoggedIn(true);
    router.push('/login?message=confirm');
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
          onChange={(e) => setEmail(e.target.value)}
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
          onChange={(e) => setPassword(e.target.value)}
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

      {errorMsg && <p className="error-message">{errorMsg}</p>}

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
