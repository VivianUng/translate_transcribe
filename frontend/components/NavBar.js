"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import { useState, useEffect } from "react";
import { supabase } from '../lib/supabaseClient';
import logo from "./icons/main_icon.png";

export default function NavBar() {
  const pathname = usePathname();
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    // Check current session
    const session = supabase.auth.getSession();
    session.then(({ data }) => {
      setIsLoggedIn(!!data.session);
    });

    // Subscribe to auth changes
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsLoggedIn(!!session);
    });

    return () => {
      listener.subscription?.unsubscribe();
    };
  }, []);
  
  const loggedInLinks = [
    { href: "/conversation", label: "Conversation" },
    { href: "/translator", label: "Translator" },
    { href: "/summarizer", label: "Summarizer" },
    { href: "/meeting", label: "Meeting" },
    { href: "/history", label: "History" },
    { href: "/settingsPage", label: "Settings" },
  ];

  const guestLinks = [
    { href: "/conversation", label: "Conversation" },
    { href: "/translator", label: "Translator" },
    { href: "/summarizer", label: "Summarizer" },
  ];

  const links = isLoggedIn ? loggedInLinks : guestLinks;

  const handleLoginLogout = async () => {
    if (isLoggedIn) {
      await supabase.auth.signOut();
      setIsLoggedIn(false);
      router.push("/?toast=logoutSuccess");
    } else {
      // Redirect to login page
      router.push("/login");
    }
  };

  return (
    <nav className="navbar">
      {/* Logo */}
      <div className="navbar-logo">
        <Image src={logo} alt="App Logo" width={48} height={48} />
      </div>

      {/* Links */}
      <div className="navbar-links">
        {links.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className={pathname === href ? "active" : ""}
          >
            {label}
          </Link>
        ))}
      </div>

      {/* Login/Logout button */}
      <button
        className="button navbar-button"
        onClick={handleLoginLogout}
        aria-label={isLoggedIn ? "Logout" : "Login"}
      >
        {isLoggedIn ? "Logout" : "Login"}
      </button>
    </nav>
  );
}
