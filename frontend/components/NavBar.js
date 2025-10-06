"use client";

import { useState } from "react";
import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import { useListening } from "@/contexts/ListeningContext";

import useAuthCheck from "@/hooks/useAuthCheck";
import { supabase } from '../lib/supabaseClient';
import logo from "./icons/main_icon.png";

export default function NavBar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { isLoggedIn, loading } = useAuthCheck({ redirectIfNotAuth: false, returnSession: false });
  const { listening } = useListening();

  const disabledPaths = ["/meeting/details", "/conversation"];
  const disableButtons = disabledPaths.includes(pathname) && listening;

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

      {/* Desktop links */}
      <div className="navbar-links">
        {links.map(({ href, label }) => (
          <Link
            key={href}
            // href={href}
            href={disableButtons ? "#" : href}
            className={pathname === href ? "active" : ""}
          >
            {label}
          </Link>
        ))}
      </div>

      {/* Desktop login/logout */}
      <button
        className="button navbar-button desktop-only"
        onClick={handleLoginLogout}
        aria-label={isLoggedIn ? "Logout" : "Login"}
        disabled={disableButtons}
      >
        {isLoggedIn ? "Logout" : "Login"}
      </button>


      {/* Menu button (only visible on small width screens) */}
      <button
        className="navbar-menu-button"
        onClick={() => setMenuOpen(!menuOpen)}
        aria-label={menuOpen ? "Close menu" : "Open menu"}
        title={menuOpen ? "Close navigation" : "Open navigation"}
        disabled={disableButtons}
      >
        {menuOpen ? <X size={25} /> : <Menu size={25} />}
      </button>

      {/* Drawer menu (small width only) */}
      {menuOpen && <div className="overlay" onClick={() => setMenuOpen(false)}></div>}
      <div className={`navbar-menu ${menuOpen ? "open" : ""}`}>
        <div className="navbar-menu-links">
          {links.map(({ href, label }) => (
            <Link
              key={href}
              // href={href}
              href={disableButtons ? "#" : href}
              className={pathname === href ? "active" : ""}
              onClick={() => setMenuOpen(false)}
            >
              {label}
            </Link>
          ))}
        </div>

        <div className="navbar-menu-footer">
          <button
            className="button navbar-button"
            onClick={() => {
              handleLoginLogout();
              setMenuOpen(false);
            }}
            aria-label={isLoggedIn ? "Logout" : "Login"}
            disabled={disableButtons}
          >
            {isLoggedIn ? "Logout" : "Login"}
          </button>
        </div>
      </div>
    </nav>
  );
}
