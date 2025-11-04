"use client";
import { createContext, useContext, useEffect, useState } from "react";


// Context: LanguagesContext
// This context provides a list of supported languages fetched from the backend.
// It allows any component wrapped in LanguagesProvider to access languages and
// any error occurred while fetching them.
const LanguagesContext = createContext();

// Provider Component: LanguagesProvider
// Fetches the list of languages from the backend API and provides it via context.
// It also adds an "Auto-Detect" option for automatic language detection.
export function LanguagesProvider({ children }) {
  const [languages, setLanguages] = useState([]); // Stores list of languages
  const [error, setError] = useState(null);       // Stores error message if fetch fails

  // Fetch languages from backend when component mounts
  useEffect(() => {
    async function fetchLanguages() {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/languages`, {
          credentials: "include",
          headers: {
            "ngrok-skip-browser-warning": "true",
          },
        });

        if (!res.ok) throw new Error("Failed to load languages");
        const data = await res.json();
        // Map backend language objects to { value, label } format for selects
        setLanguages([
          { value: "auto", label: "Auto-Detect" },
          ...data.map((l) => ({ value: l.code, label: l.label })),
        ]);
      } catch (err) {
        setError("Could not load languages");
      }
    }
    fetchLanguages(); // Invoke fetch on mount
  }, []); // Empty dependency array ensures this runs only once

  return (
    <LanguagesContext.Provider value={{ languages, error }}>
      {children}
    </LanguagesContext.Provider>
  );
}

export function useLanguages() {
  return useContext(LanguagesContext);
}
