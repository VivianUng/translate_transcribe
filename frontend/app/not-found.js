"use client";

import Link from "next/link";

export default function NotFound() {
  return (
    <main className="notfound-container">
      <div className="notfound-card">
        <h1 className="notfound-code">404</h1>
        <h2 className="notfound-title">Page Not Found</h2>
        <p className="notfound-text">
            {"Oops! The page you're looking for doesn't exist."}
        </p>

        <Link href="/" className="button notfound-button">
          ← Back to Home
        </Link>
      </div>

      <p className="notfound-footer">
        AI-Enhanced Live Transcription & Translation System
      </p>
    </main>
  );
}