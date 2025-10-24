"use client";

import { useEffect, useState, useMemo } from "react";
import Select from "react-select";
import { toast } from "react-hot-toast";
import { CalendarArrowDown, CalendarArrowUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { formatDateFromTimestamp, formatTimeFromTimestamp } from "@/utils/dateTime";
import useAuthCheck from "@/hooks/useAuthCheck";

export default function History() {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState("");

  const { isLoggedIn, load, session } = useAuthCheck({ redirectIfNotAuth: true, returnSession: true });
  const [history, setHistory] = useState({ translations: [], conversations: [], summaries: [], meetings: [] });
  const [loading, setLoading] = useState(true);
  const [selectedType, setSelectedType] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [sortOrder, setSortOrder] = useState("desc"); // "asc" or "desc"

  const sortOptions = [
    {
      value: "desc",
      label: (
        <>
          <CalendarArrowDown size={20} style={{ marginRight: "6px", verticalAlign: "middle" }} />
          Date: Newest First
        </>
      ),
    },
    {
      value: "asc",
      label: (
        <>
          <CalendarArrowUp size={20} style={{ marginRight: "6px", verticalAlign: "middle" }} />
          Date: Oldest First
        </>
      ),
    },
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


  const combinedHistory = useMemo(() => {
    const combined = [];

    const parseDateTime = (timestamp) => {
      const dateStr = formatDateFromTimestamp(timestamp); // e.g. "24/09/2025"
      const timeStr = formatTimeFromTimestamp(timestamp); // e.g. "9:45 PM"

      const [day, month, year] = dateStr.split("/").map(Number);

      const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
      let hours = parseInt(match[1], 10);
      const minutes = parseInt(match[2], 10);
      const ampm = match[3].toUpperCase();

      if (ampm === "PM" && hours !== 12) hours += 12;
      if (ampm === "AM" && hours === 12) hours = 0;

      // local time
      return new Date(year, month - 1, day, hours, minutes);
    };

    // Translations
    history.translations.forEach((item) => {
      combined.push({
        id: item.id,
        type: "Translation",
        createdAt: new Date(item.created_at),
        date: formatDateFromTimestamp(item.created_at),
        time: formatTimeFromTimestamp(item.created_at),
        dateTime: parseDateTime(item.created_at),
        input: item.input_text || "",
        output: item.output_text || "",
      });
    });

    // Conversations
    history.conversations.forEach((item) => {
      combined.push({
        id: item.id,
        type: "Conversation",
        createdAt: new Date(item.created_at),
        date: formatDateFromTimestamp(item.created_at),
        time: formatTimeFromTimestamp(item.created_at),
        dateTime: parseDateTime(item.created_at),
        input: item.input_text || "",
        output: item.output_text || "",
      });
    });

    // Summaries
    history.summaries.forEach((item) => {
      combined.push({
        id: item.id,
        type: "Summary",
        createdAt: new Date(item.created_at),
        date: formatDateFromTimestamp(item.created_at),
        time: formatTimeFromTimestamp(item.created_at),
        dateTime: parseDateTime(item.created_at),
        input: item.input_text || "",
        output: item.output_text || "",
      });
    });

    // Meetings
    history.meetings.forEach((item) => {
      combined.push({
        id: item.id,
        type: "Meeting",
        createdAt: new Date(item.created_at),
        date: formatDateFromTimestamp(item.actual_start_time),
        time: formatTimeFromTimestamp(item.actual_start_time),
        dateTime: parseDateTime(item.actual_start_time),
        input: item.meeting_name || "Untitled Meeting",
        output: item.translated_summary || item.original_summary || "",
      });
    });

    // Sort by dateTime descending
    combined.sort((a, b) => b.dateTime - a.dateTime);

    return combined;
  }, [history]);

  const filteredHistory = useMemo(() => {
    const filtered = combinedHistory.filter((item) => {
      const matchesSearch =
        item.input.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.output.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.type.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesType = selectedType === "" || item.type === selectedType;

      let matchesDate = true;
      if (startDate && !endDate) {
        const start = new Date(startDate);
        matchesDate = item.dateTime.toDateString() === start.toDateString();
      } else if (!startDate && endDate) {
        const end = new Date(endDate);
        matchesDate = item.dateTime.toDateString() === end.toDateString();
      } else if (startDate && endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999); // adjust end date to end of the day
        matchesDate = item.dateTime >= start && item.dateTime <= end;
      }

      return matchesSearch && matchesType && matchesDate;
    });

    filtered.sort((a, b) =>
      sortOrder === "asc" ? a.dateTime - b.dateTime : b.dateTime - a.dateTime
    );

    return filtered;
  }, [combinedHistory, searchTerm, selectedType, startDate, endDate, sortOrder]);


  if (loading) return <p>Loading...</p>;


  async function fetchUserHistory() {
    try {
      const token = session?.access_token;
      if (!token) {
        toast.error("You must be logged in to view history.");
        return { translations: [], conversations: [], summaries: [], meetings: [] };
      }

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/user-history`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            "ngrok-skip-browser-warning": "true",
          },
          credentials: 'include',
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
        meetings: result.meetings || [],
      };
    } catch (err) {
      console.error("Error fetching user history:", err.message || err);
      return { translations: [], conversations: [], summaries: [], meetings: [] };
    }
  }

  const viewDetails = (row) => {
    if (row.type && row.id) {
      const type = row.type.toLowerCase();
      router.push(`/records/${type}/${row.id}`);
    }
    else { toast.error("Error identifying record"); }
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
              isSearchable={false}
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
                    <p className="card-subtitle"><strong>Meeting Name:</strong></p>
                    <p className="card-preview">{row.input}</p>

                    <p className="card-subtitle"><strong>Summary:</strong></p>
                    <p className="card-preview">{row.output || "No translated summary available"}</p>
                  </>
                )}

                {row.type === "Conversation" && (
                  <>
                    <p className="card-subtitle"><strong>Transcription:</strong></p>
                    <p className="card-preview">{row.input || "No input text"}</p>

                    <p className="card-subtitle"><strong>Translation:</strong></p>
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