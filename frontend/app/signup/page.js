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

  async function handleSignup(e) {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name } },
    });

    setLoading(false);

    if (error) {
      setErrorMsg(error.message);
    } else {
      setIsLoggedIn(true);
      router.push('/'); // Redirect after signup
    }
  }

  async function handleGuest() {
    alert('Guest login is not implemented. Please signup or login.');
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    setIsLoggedIn(false);
  }

  return (
    <div style={{ maxWidth: '400px', margin: 'auto', padding: '2rem' }}>
      {!isLoggedIn ? (
        <>
          <h1>Create Account</h1>
          <form onSubmit={handleSignup}>
            <label htmlFor="name">Name</label><br />
            <input
              id="name"
              type="text"
              placeholder="Enter your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              style={{ width: '100%', padding: '0.5rem', margin: '0.5rem 0' }}
            />
            <label htmlFor="email">Email address</label><br />
            <input
              id="email"
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{ width: '100%', padding: '0.5rem', margin: '0.5rem 0' }}
            />
            <label htmlFor="password">Password</label><br />
            <input
              id="password"
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{ width: '100%', padding: '0.5rem', margin: '0.5rem 0' }}
            />
            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                backgroundColor: '#6B63FF',
                color: 'white',
                padding: '0.75rem',
                border: 'none',
                borderRadius: '4px',
                fontSize: '1rem',
                cursor: 'pointer',
              }}
            >
              {loading ? 'Signing up...' : 'Signup'}
            </button>
          </form>
          {errorMsg && <p style={{ color: 'red' }}>{errorMsg}</p>}
          <p style={{ marginTop: '1rem' }}>
            Already have an account?{' '}
            <Link href="/login" style={{ color: '#6B63FF', textDecoration: 'underline' }}>
              Login
            </Link>
          </p>
          <p>
            OR{' '}
            <button
              onClick={handleGuest}
              style={{ color: '#6B63FF', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              Continue as guest
            </button>
          </p>
        </>
      ) : (
        <>
          <h2>You are logged in</h2>
          <button
            onClick={handleLogout}
            style={{
              backgroundColor: '#6B63FF',
              color: 'white',
              padding: '0.75rem',
              border: 'none',
              borderRadius: '4px',
              fontSize: '1rem',
              cursor: 'pointer',
              marginBottom: '1rem',
            }}
          >
            Logout
          </button>
        </>
      )}
    </div>
  );
}
