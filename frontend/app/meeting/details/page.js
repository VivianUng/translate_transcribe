"use client";

import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import Select from "react-select";
import { useRouter, useSearchParams } from "next/navigation";
import { useLanguages } from "@/contexts/LanguagesContext";
import useAuthCheck from "@/hooks/useAuthCheck";
import StickyScrollBox from "@/components/StickyScrollBox";

export default function MeetingDetailsPage() {
    const { isLoggedIn, loading, session } = useAuthCheck({ redirectIfNotAuth: true, returnSession: true });
    const token = session?.access_token;

    const router = useRouter();
    const searchParams = useSearchParams();
    const { languages } = useLanguages();
    const [loadingPage, setLoadingPage] = useState(true);
    // const [fetching, setFetching] = useState(true);

    const [role, setRole] = useState(null); // "host" or "participant"
    const [status, setStatus] = useState(null); // "upcoming" or "ongoing" or "past"
    const meetingId = searchParams.get("id");

    const [meetingName, setMeetingName] = useState("");
    const [meetingHost, setMeetingHost] = useState("");
    const [date, setDate] = useState("");
    const [startTime, setStartTime] = useState("");
    const [endTime, setEndTime] = useState("");

    // State for live data 
    // // change to fetching transcription and englishSummary from supabase
    const [transcription, setTranscription] = useState("");
    const [translation, setTranslation] = useState("");
    const [summary, setSummary] = useState("");

    // State for languages
    const [translationLang, setTranslationLang] = useState("en");
    const [summaryLang, setSummaryLang] = useState("en");

    // Recording indicator (host only)
    const [recording, setRecording] = useState(false);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true); // for react-select component
    },);

    useEffect(() => {
        if (!loading && session) {
            const fetchAll = async () => {
                setLoadingPage(true); // start loading
                try {
                    await Promise.all([
                        fetchRole(),
                        fetchStatus(),
                        fetchMeetingInfo()
                    ]);
                } catch (err) {
                    console.error("Error fetching meeting data:", err);
                    router.push("/meeting?toast=notFound");
                    return;
                } finally {
                    setLoadingPage(false); // done loading
                }
            };

            fetchAll();
        }
    }, [loading, session]);

    useEffect(() => {
        if (role === "host" && status === "ongoing") {
            setRecording(true);
        } else {
            setRecording(false);
        }
    }, [role, status]);

    const fetchRole = async () => {
        const token = session?.access_token;
        if (!token) throw new Error("You must be logged in to check your role.");

        const res = await fetch(
            `${process.env.NEXT_PUBLIC_BACKEND_URL}/meetings/${meetingId}/role`,
            {
                method: "GET",
                headers: { Authorization: `Bearer ${token}` },
            }
        );

        if (!res.ok) {
            router.push("/meeting?toast=notFound");
        }

        const data = await res.json();
        setRole(data.role); // "host" or "participant"
    };

    const fetchStatus = async () => {
        const token = session?.access_token;
        if (!token) throw new Error("You must be logged in to check meeting status.");

        const res = await fetch(
            `${process.env.NEXT_PUBLIC_BACKEND_URL}/meetings/${meetingId}/status`,
            {
                method: "GET",
                headers: { Authorization: `Bearer ${token}` },
            }
        );

        if (!res.ok) {
            router.push("/meeting?toast=notFound");
        }

        const data = await res.json();
        setStatus(data.status); // "ongoing", "upcoming", "past"
    };

    const fetchMeetingInfo = async () => {
        const token = session?.access_token;
        if (!token) throw new Error("You must be logged in to view meetings.");

        const res = await fetch(
            `${process.env.NEXT_PUBLIC_BACKEND_URL}/meetings/${meetingId}`,
            {
                method: "GET",
                headers: { Authorization: `Bearer ${token}` },
            }
        );

        const data = await res.json();

        const m = data.meeting;
        if (!m) {
            router.push("/meeting?toast=notFound");
            return;
        }

        const formatTime = (timeStr) => {
            if (!timeStr) return "";
            if (timeStr.includes("T")) return timeStr.split("T")[1].slice(0, 5);
            return timeStr.slice(0, 5);
        };

        setMeetingName(m.name || "");
        setMeetingHost(m.host_name || "");
        setDate(m.date || "");
        setStartTime(formatTime(m.start_time));
        setEndTime(formatTime(m.end_time));
    };


    // --- update page title ---
    const getPageTitle = () => {
        if (status === "ongoing") return "Ongoing Meeting";
        if (status === "past") return "Past Meeting";
        if (status === "upcoming") return "Upcoming Meeting";
        return "Meeting";
    };

    async function handleEndMeeting() {
        try {
            if (role === "host") {
                const token = session?.access_token;
                if (!token) {
                    alert("You must be logged in to end meetings.");
                    return;
                }

                // 2. Update meeting status → "past"
                const res = await fetch(
                    `${process.env.NEXT_PUBLIC_BACKEND_URL}/meetings/${meetingId}/status`,
                    {
                        method: "PUT",
                        headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${token}`,
                        },
                        body: JSON.stringify({ status: "past" }),
                    }
                );

                if (!res.ok) {
                    const errorData = await res.json();
                    console.error("Failed to update meeting status:", errorData.detail || errorData);
                    alert("Failed to end meeting.");
                    return;
                }

                const data = await res.json();

                // 3. Redirect and show confirmation
                router.push("/meeting?toast=meetingEnd"); // back to meetings page
            }

        } catch (err) {
            console.error("Error ending meeting:", err);
            alert("An error occurred while ending the meeting.");
        }
    }

    async function handleDeleteMeeting() {
        try {
            if (role !== "host") return;

            if (!confirm("Are you sure you want to delete this meeting?")) return;
            const token = session?.access_token;
            if (!token) {
                alert("You must be logged in to end meetings.");
                return;
            }
            const res = await fetch(
                `${process.env.NEXT_PUBLIC_BACKEND_URL}/meetings/${meetingId}`,
                {
                    method: "DELETE",
                    headers: { Authorization: `Bearer ${token}` },
                }
            );

            if (!res.ok) {
                const errData = await res.json();
                console.error("Failed to delete meeting:", errData);
                alert("Failed to delete meeting.");
                return;
            }

            router.push("/meeting?toast=deleteMeetingSuccess");
        } catch (err) {
            console.error("Error deleting meeting:", err);
            alert("An error occurred while deleting the meeting.");
        }
    }

    async function handleUpdateMeeting() {
        alert("Logic for updating meeting")
    }

    if (loadingPage) return <p>Loading...</p>;

    return (
        <div className="page-container">
            <button className="back-button" onClick={() => router.push("/meeting")}>
                <ArrowLeft size={20} />
            </button>
            <h1 className="page-title">{getPageTitle()}</h1>
            {/* Meeting Details */}
            <div className="meeting-details-row">
                <h2 className="meeting-name">{meetingName}</h2>
                <p className="meeting-host">Host: {meetingHost}</p>
                <p className="meeting-date-time">
                    {date} | {startTime} - {endTime}
                </p>
            </div>

            <div className="ongoing-meeting-layout">
                {/* Left column */}
                <div className="ongoing-meeting-left">
                    {/* Transcription */}
                    <div className="section transcription-section">
                        <div className="section-header">
                            <span>Transcription</span>
                            {role === "host" && recording && (
                                <span className="recording-indicator">🔴 Recording</span>
                            )}
                        </div>
                        <StickyScrollBox
                            content={transcription}
                            placeholder="Waiting for transcription..."
                        />
                    </div>

                    {/* Translation */}
                    <div className="section translation-section">
                        <div className="section-header">
                            <span>Translation</span>
                            {mounted && (
                                <Select
                                    options={languages.filter((l) => l.value !== "auto")}
                                    value={languages.find((opt) => opt.value === translationLang)}
                                    onChange={(opt) => setTranslationLang(opt.value)}
                                    classNamePrefix="react-select"
                                />
                            )}
                        </div>
                        <StickyScrollBox
                            content={translation}
                            placeholder="Waiting for translation..."
                        />
                    </div>
                </div>

                {/* Right column (Summary) */}
                <div className="ongoing-meeting-right">
                    <div className="section summary-section">
                        <div className="section-header">
                            <span>Summary</span>
                            {mounted && (
                                <Select
                                    options={languages.filter((l) => l.value !== "auto")}
                                    value={languages.find((opt) => opt.value === summaryLang)}
                                    onChange={(opt) => setSummaryLang(opt.value)}
                                    classNamePrefix="react-select"
                                />
                            )}
                        </div>
                        <StickyScrollBox
                            content={summary}
                            placeholder="Summary will appear here..."
                        />
                    </div>
                </div>
            </div>
            <div className="meeting-actions">
                {status === "ongoing" && role === "host" && (
                    <button className="button danger" onClick={handleEndMeeting}>
                        End Meeting
                    </button>
                )}

                {status === "past" && role === "host" && (
                    <div style={{ display: "flex", gap: "8px" }}>
                        <button
                            className="button update-btn"
                            onClick={handleUpdateMeeting}
                        >
                            Edit
                        </button>
                        <button
                            className="button danger"
                            onClick={handleDeleteMeeting}
                        >
                            Delete
                        </button>
                    </div>
                )}
                {/* any buttons for participants of ongoing / past meetings
                    Ongoing : Save meeting once it ends
                    Past : Save meeting */}
            </div>
        </div>
    );
}
