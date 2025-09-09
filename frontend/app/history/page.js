"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import useAuthCheck from "@/hooks/useAuthCheck";
import { supabase } from '../../lib/supabaseClient';

// dummy data
const historyData = [
  {
    title: "Text1",
    type: "Conversation",
    date: "2023/09/17",
    time: "12.00PM - 1.00PM",
    preview:
      "Lorem ipsum dolor sit amet, consectetur adipiscing elit ...............",
  },
  {
    title: "Text2",
    type: "Meeting",
    date: "2023/09/17",
    time: "2.00PM - 2.30PM",
    preview:
      "Lorem ipsum dolor sit amet, consectetur adipiscing elit ...............",
  },
  {
    title: "Text3",
    type: "Translation",
    date: "2023/09/17",
    time: "2.00PM - 2.30PM",
    preview:
      "Lorem ipsum dolor sit amet, consectetur adipiscing elit ...............",
  },
  {
    title: "Text4",
    type: "Summary",
    date: "2023/09/17",
    time: "2.00PM - 2.30PM",
    preview:
      "Lorem ipsum dolor sit amet, consectetur adipiscing elit ...............",
  },
  {
    title: "Text5",
    type: "Conversation",
    date: "2023/09/17",
    time: "2.00PM - 2.30PM",
    preview:
      "Lorem ipsum dolor sit amet, consectetur adipiscing elit ...............",
  },
  {
    title: "Meeting with Supervisor",
    type: "Translation",
    date: "2023/09/17",
    time: "2.00PM - 2.30PM",
    preview:
      "Lorem ipsum dolor sit amet, consectetur adipiscing elit ...............",
  },
  {
    title: "Meeting for Presentation",
    type: "Translation",
    date: "2023/09/17",
    time: "2.00PM - 2.30PM",
    preview:
      "Lorem ipsum dolor sit amet, consectetur adipiscing elit ...............",
  },
  {
    title: "Class 2",
    type: "Translation",
    date: "2023/09/17",
    time: "2.00PM - 2.30PM",
    preview:
      "Lorem ipsum dolor sit amet, consectetur adipiscing elit ...............",
  },
];

export default function History() {
  const [searchTerm, setSearchTerm] = useState("");

  const { LoggedIn, loading, session } = useAuthCheck({ redirectIfNotAuth: true, returnSession: true });
  const [mounted, setMounted] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    setMounted(true); // for react-select component

    if (session?.user) {
      setIsLoggedIn(!!session);
    }
  }, [session]);

  if (loading) return <p>Loading...</p>;


  // Filter history based on search input
  const filteredHistory = historyData.filter(
    (item) =>
      item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.type.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.preview.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const viewDetails = (row) => {
    console.log("View details for:", row);
    // Navigate to detail page or open modal
  };

  return (
    <div className="page-container">
      <h1 className="page-title">History</h1>
      <input
        type="text"
        placeholder="Search history..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="searchInput"
      />

      <div className="history-container">
        {filteredHistory.length > 0 ? (
          filteredHistory.map((row, idx) => (
            <div
              key={idx}
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