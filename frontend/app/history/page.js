"use client";

import { useEffect, useState, useMemo } from "react";
import Select from "react-select";
import { useRouter } from "next/navigation";
import useAuthCheck from "@/hooks/useAuthCheck";

export default function History() {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState("");

  const { isLoggedIn, load, session } = useAuthCheck({ redirectIfNotAuth: true, returnSession: true });
  const [history, setHistory] = useState({ translations: [], conversations: [], summaries: [] });
  const [loading, setLoading] = useState(true);
  const [selectedType, setSelectedType] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [sortOrder, setSortOrder] = useState("desc"); // "asc" or "desc"

  const sortOptions = [
    { value: "desc", label: "📅 Date: Newest First" },
    { value: "asc", label: "📅 Date: Oldest First" },
  ];

  const typeOptions = [
    { value: "", label: "All Types" },
    { value: "Translation", label: "Translation" },
    { value: "Conversation", label: "Conversation" },
    { value: "Summary", label: "Summary" },
    { value: "Meeting", label: "Meeting" },
  ];


  useEffect(() => {
    if (session?.user) {
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
        createdAt: new Date(item.created_at),
        date: new Date(item.created_at).toLocaleDateString("en-GB"),
        time: new Date(item.created_at).toLocaleTimeString(),
        input: item.input_text || "",
        output: item.output_text || "",
      });
    });

    history.conversations.forEach((item) => {
      combined.push({
        id: item.id,
        type: "Conversation",
        createdAt: new Date(item.created_at),
        date: new Date(item.created_at).toLocaleDateString("en-GB"),
        time: new Date(item.created_at).toLocaleTimeString(),
        input: item.input_text || "",
        output: item.output_text || "",
      });
    });

    history.summaries.forEach((item) => {
      combined.push({
        id: item.id,
        type: "Summary",
        createdAt: new Date(item.created_at),
        date: new Date(item.created_at).toLocaleDateString("en-GB"),
        time: new Date(item.created_at).toLocaleTimeString(),
        input: item.input_text || "",
        output: item.output_text || "",
      });
    });

    // sort by created_at descending
    combined.sort((a, b) => b.createdAt - a.createdAt);


    return combined;
  }, [history]);


  const filteredHistory = useMemo(() => {
    const filtered = combinedHistory.filter((item) => {
      const matchesSearch =
        item.input.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.output.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.type.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesType = selectedType === "" || item.type === selectedType;

      const itemDateStr = item.createdAt.toISOString().split("T")[0]; // "yyyy-mm-dd"

      let matchesDate = true;
      if (startDate && !endDate) {
        // Only start date → match that exact date
        matchesDate = itemDateStr === startDate;
      } else if (!startDate && endDate) {
        // Only end date → match that exact date
        matchesDate = itemDateStr === endDate;
      } else if (startDate && endDate) {
        // Both → match range
        matchesDate = itemDateStr >= startDate && itemDateStr <= endDate;
      }

      return matchesSearch && matchesType && matchesDate;
    });

    // Sort by date based on sortOrder
    filtered.sort((a, b) =>
      sortOrder === "asc" ? a.createdAt - b.createdAt : b.createdAt - a.createdAt
    );

    return filtered;
  }, [combinedHistory, searchTerm, selectedType, startDate, endDate, sortOrder]);


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

  const handleStartDateChange = (e) => {
    const value = e.target.value; // YYYY-MM-DD
    setStartDate(value);

    // If endDate exists and is before new startDate, clear endDate
    if (endDate && new Date(endDate) < new Date(value)) {
      setEndDate("");
    }
  };

  const handleEndDateChange = (e) => {
    const value = e.target.value;

    // Only allow if startDate exists and endDate is >= startDate
    if (!startDate || new Date(value) >= new Date(startDate)) {
      setEndDate(value);
    }
  };

  return (
    <div className="page-container">
      <h1 className="page-title">History</h1>
      {/* Search, Sort, Type and Date Filter */}
      <div className="filter-container">
        {/* Left section */}
        <div className="filter-left">
          <input
            type="text"
            placeholder="Search history..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="searchInput"
          />

          <div className="dropdown-group">
            <Select
              options={sortOptions}
              value={sortOptions.find((opt) => opt.value === sortOrder)}
              onChange={(selected) => setSortOrder(selected.value)}
              classNamePrefix="react-select"
              className="sortDropdown"
            />

            <Select
              options={typeOptions}
              value={typeOptions.find((opt) => opt.value === selectedType)}
              onChange={(selected) => setSelectedType(selected.value)}
              classNamePrefix="react-select"
              className="typeDropdown"
            />
          </div>
        </div>

        {/* Right section (Date filters) */}
        <div className="date-filters">
          <div className="date-field">
            <label>Start Date</label>
            <input
              type="date"
              value={startDate}
              max={new Date().toISOString().split("T")[0]}  // today's date
              onChange={handleStartDateChange}
            />
          </div>

          <div className="date-separator">to</div>

          <div className="date-field">
            <label>End Date</label>
            <input
              type="date"
              value={endDate}
              max={new Date().toISOString().split("T")[0]}  // today's date
              onChange={handleEndDateChange}
            />
          </div>
        </div>
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