"use client";

import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabaseClient";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSearchParams } from 'next/navigation';

export default function Login() {
  const router = useRouter();
  
  const searchParams = useSearchParams();
  const message = searchParams.get('message');

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function fetchSession() {
      const { data } = await supabase.auth.getSession();
      setIsLoggedIn(!!data.session);
    }
    fetchSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setIsLoggedIn(!!session);
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  async function handleLogin(e) {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (error) {
      setErrorMsg(error.message);
    } else {
      setIsLoggedIn(true);
      router.push("/");
    }
  }

  async function handleGuest() {
    router.push("/");
  }

  return (
    <div className="login-container">
      <h1 className="page-title">Log In</h1>
      {message === 'confirm' && (
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
        <div className="page-link-word forgot-password">
          <span onClick={(e) => e.preventDefault()}>forgot password</span>
        </div>
        <button
          className="button login-button"
          type="submit"
          disabled={loading}
        >
          {loading ? "Logging in..." : "Login"}
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