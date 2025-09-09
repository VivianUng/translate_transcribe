"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import useAuthCheck from "@/hooks/useAuthCheck";

export default function History() {
  const router = useRouter();
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
        type: "Translation",
        date: new Date(item.created_at).toLocaleDateString(),
        time: new Date(item.created_at).toLocaleTimeString(),
        input: item.input_text || "",
        output: item.output_text || "",
      });
    });

    history.conversations.forEach((item) => {
      combined.push({
        id: item.id,
        type: "Conversation",
        date: new Date(item.created_at).toLocaleDateString(),
        time: new Date(item.created_at).toLocaleTimeString(),
        input: item.input_text || "",
        output: item.output_text || "",
      });
    });

    history.summaries.forEach((item) => {
      combined.push({
        id: item.id,
        type: "Summary",
        date: new Date(item.created_at).toLocaleDateString(),
        time: new Date(item.created_at).toLocaleTimeString(),
        input: item.input_text || "",
        output: item.output_text || "",
      });
    });

    // sort by created_at descending
    combined.sort((a, b) => new Date(b.date + " " + b.time) - new Date(a.date + " " + a.time));

    return combined;
  }, [history]);

  // Filter history based on search input and type
  const filteredHistory = useMemo(() => {
    return combinedHistory.filter((item) => {
      const matchesSearch =
        item.input.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.output.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.type.toLowerCase().includes(searchTerm.toLowerCase());

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

  const viewDetails = (row) => {
    switch (row.type) {
      case "Meeting":
        router.push(`/meeting/details?id=${row.id}`);
        break;
      case "Conversation":
        router.push(`/conversation/details?id=${row.id}`);
        break;
      case "Translation":
        router.push(`/translation/details?id=${row.id}`);
        break;
      case "Summary":
        router.push(`/summary/details?id=${row.id}`);
        break;
      default:
        console.warn("Unknown type:", row.type);
    }
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
              key={`${row.type}-${row.id}`}
              className="history-card"
              onClick={() => viewDetails(row)}
            >
              {/* Header: type + timestamp */}
              <div className="card-header">
                <span className="type">{row.type}</span>
                <div className="card-meta">
                  <span>{row.date}</span> | <span>{row.time}</span>
                </div>
              </div>

              {/* Body: compact preview */}
              <div className="card-body">
                {row.type === "Meeting" && (
                  <>
                    <p className="card-subtitle"><strong>Agenda:</strong></p>
                    <p className="card-preview">{row.input || "No agenda available"}</p>

                    <p className="card-subtitle"><strong>Summary:</strong></p>
                    <p className="card-preview">{row.output || "No summary available"}</p>
                  </>
                )}

                {row.type === "Conversation" && (
                  <>
                    <p className="card-subtitle"><strong>Input:</strong></p>
                    <p className="card-preview">{row.input || "No input text"}</p>

                    <p className="card-subtitle"><strong>Response:</strong></p>
                    <p className="card-preview">{row.output || "No response text"}</p>
                  </>
                )}

                {row.type === "Translation" && (
                  <>
                    <p className="card-subtitle"><strong>Original:</strong></p>
                    <p className="card-preview">{row.input || "No original text"}</p>

                    <p className="card-subtitle"><strong>Translated:</strong></p>
                    <p className="card-preview">{row.output || "No translation"}</p>
                  </>
                )}

                {row.type === "Summary" && (
                  <>
                    <p className="card-subtitle"><strong>Source:</strong></p>
                    <p className="card-preview">{row.input || "No source text"}</p>

                    <p className="card-subtitle"><strong>Summary:</strong></p>
                    <p className="card-preview">{row.output || "No summary"}</p>
                  </>
                )}
              </div>
            </div>
          ))
        ) : (
          <p>No history found.</p>
        )}
      </div>
    </div>
  );
}