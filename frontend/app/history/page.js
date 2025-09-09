"use client";

import { useEffect, useState, useMemo } from "react";
import useAuthCheck from "@/hooks/useAuthCheck";

export default function History() {
  const [searchTerm, setSearchTerm] = useState("");

  const { LoggedIn, load, session } = useAuthCheck({ redirectIfNotAuth: true, returnSession: true });
  const [history, setHistory] = useState({ translations: [], conversations: [], summaries: [] });
  const [loading, setLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [selectedType, setSelectedType] = useState("");


  useEffect(() => {
    if (session?.user) {
      setIsLoggedIn(!!session);
      fetchUserHistory().then((data) => {
        setHistory(data);
        setLoading(false);
      });
    }
  }, [session]);


  // Combine all history items into a single array for display
  const combinedHistory = useMemo(() => {
    const combined = [];

    history.translations.forEach((item) => {
      combined.push({
        id: item.id,
        title: item.input_text?.substring(0, 30) || "Translation",
        type: "Translation",
        date: new Date(item.created_at).toLocaleDateString(),
        time: new Date(item.created_at).toLocaleTimeString(),
        preview: item.output_text || "",
        raw: item,
      });
    });

    history.conversations.forEach((item) => {
      combined.push({
        id: item.id,
        title: item.input_text?.substring(0, 30) || "Conversation",
        type: "Conversation",
        date: new Date(item.created_at).toLocaleDateString(),
        time: new Date(item.created_at).toLocaleTimeString(),
        preview: item.output_text || "",
        raw: item,
      });
    });

    history.summaries.forEach((item) => {
      combined.push({
        id: item.id,
        title: item.input_text?.substring(0, 30) || "Summary",
        type: "Summary",
        date: new Date(item.created_at).toLocaleDateString(),
        time: new Date(item.created_at).toLocaleTimeString(),
        preview: item.output_text || "",
        raw: item,
      });
    });

    // sort by created_at descending
    combined.sort((a, b) => new Date(b.raw.created_at) - new Date(a.raw.created_at));

    return combined;
  }, [history]);

  // Filter history based on search input and type
  const filteredHistory = useMemo(() => {
    return combinedHistory.filter((item) => {
      const matchesSearch =
        item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.type.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.preview.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesType =
        selectedType === "" || item.type === selectedType;

      return matchesSearch && matchesType;
    });
  }, [combinedHistory, searchTerm, selectedType]);

  if (loading) return <p>Loading...</p>;


  async function fetchUserHistory() {
    try {
      // get Supabase JWT token
      const token = session?.access_token;
      if (!token) {
        alert("You must be logged in to view history.");
        return { translations: [], conversations: [], summaries: [] };
      }

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/user-history`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!res.ok) {
        const errorResult = await res.json();
        throw new Error(errorResult.detail || "Failed to fetch user history");
      }

      const result = await res.json();
      return {
        translations: result.translations || [],
        conversations: result.conversations || [],
        summaries: result.summaries || [],
      };
    } catch (err) {
      console.error("Error fetching user history:", err.message || err);
      return { translations: [], conversations: [], summaries: [] };
    }
  }

  // Logic for viewing meeting details page
  const viewDetails = (row) => {
    console.log("View details for:", row);
    // Navigate to detail page or open modal
  };

  return (
    <div className="page-container">
      <h1 className="page-title">History</h1>
      {/* Search and Type Filter */}
      <div className="filter-container">
        <input
          type="text"
          placeholder="Search history..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="searchInput"
        />

        <select
          value={selectedType}
          onChange={(e) => setSelectedType(e.target.value)}
          className="typeDropdown"
        >
          <option value="">All Types</option>
          <option value="Translation">Translation</option>
          <option value="Conversation">Conversation</option>
          <option value="Summary">Summary</option>
          <option value="Meeting">Meeting</option>
        </select>
      </div>

      <div className="history-container">
        {filteredHistory.length > 0 ? (
          filteredHistory.map((row) => (
            <div
              key={`${row.type}-${row.id}`} // unique key
              className="history-card"
              onClick={() => viewDetails(row)}
            >
              <div className="card-header">
                <h3>{row.title}</h3>
                <span className="type">{row.type}</span>
              </div>
              <div className="card-meta">
                <span>{row.date}</span> | <span>{row.time}</span>
              </div>
              <p className="card-preview">{row.preview}</p>
            </div>
          ))
        ) : (
          <p>No history found.</p>
        )}
      </div>
    </div>
  );
}