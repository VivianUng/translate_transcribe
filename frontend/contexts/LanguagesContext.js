"use client";
import { createContext, useContext, useEffect, useState } from "react";

const LanguagesContext = createContext();

export function LanguagesProvider({ children }) {
  const [languages, setLanguages] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchLanguages() {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/languages`, {
          credentials: "include",
        });

        if (!res.ok) throw new Error("Failed to load languages");
        const data = await res.json();
        setLanguages([
          { value: "auto", label: "Auto-Detect" },
          ...data.map((l) => ({ value: l.code, label: l.label })),
        ]);
      } catch (err) {
        setError("Could not load languages");
      }
    }
    fetchLanguages();
  }, []);

  return (
    <LanguagesContext.Provider value={{ languages, error }}>
      {children}
    </LanguagesContext.Provider>
  );
}

export function useLanguages() {
  return useContext(LanguagesContext);
}
