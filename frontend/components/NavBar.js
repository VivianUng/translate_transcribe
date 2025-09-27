"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";

import useAuthCheck from "@/hooks/useAuthCheck";
import { supabase } from '../lib/supabaseClient';
import logo from "./icons/main_icon.png";

export default function NavBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { isLoggedIn, loading } = useAuthCheck({ redirectIfNotAuth: false, returnSession: false });
  
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
      router.push("/");
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
