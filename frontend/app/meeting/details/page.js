"use client";

import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { toast } from "react-hot-toast";
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

    const [role, setRole] = useState(null); // "host" or "participant"
    const [status, setStatus] = useState(null); // "upcoming" or "ongoing" or "past"

    const [meetingId, setMeetingId] = useState(searchParams.get("id"));
    const recordId = searchParams.get("recordId");

    const [saving, setSaving] = useState(false);
    const [isSaved, setIsSaved] = useState(false); // track if translation is saved

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

    const formatTime = (timeStr) => {
        if (!timeStr) return "";
        return timeStr.includes("T") ? timeStr.split("T")[1].slice(0, 5) : timeStr.slice(0, 5);
    };

    useEffect(() => {
        setMounted(true); // for react-select component
    },);

    useEffect(() => {
        if (!loading && session) {
            const fetchAll = async () => {
                setLoadingPage(true);
                try {
                    let idToUse = meetingId;

                    if (recordId) {
                        idToUse = await fetchIndivMeeting();
                    } else {
                        await fetchMeetingInfo(meetingId);
                    }

                    if (!idToUse) throw new Error("Meeting ID not ready");

                    await fetchMeetingDependentData(idToUse); // use the updated id

                } catch (err) {
                    console.error("Error fetching meeting data:", err);
                    router.push("/meeting?toast=notFound");
                } finally {
                    setLoadingPage(false);
                }
            };

            fetchAll();
        }
    }, [loading, session, recordId]);


    // -----------------------
    // Fetch functions accept meetingId as argument
    // -----------------------
    const fetchMeetingDependentData = async (meetingId) => {
        await fetchRole(meetingId);
        await fetchStatus(meetingId);
    };

    const fetchRole = async (meetingId) => {
        const token = session?.access_token;
        if (!token) throw new Error("You must be logged in to check your role.");

        const res = await fetch(
            `${process.env.NEXT_PUBLIC_BACKEND_URL}/meetings/${meetingId}/role`,
            { method: "GET", headers: { Authorization: `Bearer ${token}` } }
        );

        if (!res.ok) throw new Error("Failed to fetch role");

        const data = await res.json();
        setRole(data.role);
    };

    const fetchStatus = async (meetingId) => {
        const token = session?.access_token;
        if (!token) throw new Error("You must be logged in to check meeting status.");

        const res = await fetch(
            `${process.env.NEXT_PUBLIC_BACKEND_URL}/meetings/${meetingId}/status`,
            { method: "GET", headers: { Authorization: `Bearer ${token}` } }
        );

        if (!res.ok) throw new Error("Failed to fetch status");

        const data = await res.json();
        setStatus(data.status);
    };

    const fetchMeetingInfo = async (meetingId) => {
        const token = session?.access_token;
        if (!token) throw new Error("You must be logged in to view meetings.");

        const res = await fetch(
            `${process.env.NEXT_PUBLIC_BACKEND_URL}/meetings/${meetingId}`,
            { method: "GET", headers: { Authorization: `Bearer ${token}` } }
        );

        const data = await res.json();
        const m = data.meeting;
        if (!m) throw new Error("Meeting not found");

        setMeetingName(m.name || "");
        setMeetingHost(m.host_name || "");
        setDate(m.date || "");
        setStartTime(formatTime(m.start_time));
        setEndTime(formatTime(m.end_time));
    };

    const fetchIndivMeeting = async () => {
        const token = session?.access_token;
        if (!token) throw new Error("You must be logged in to view meetings.");

        // returns entire content of row in meeting_details_individual
        const res = await fetch(
            `${process.env.NEXT_PUBLIC_BACKEND_URL}/records/meeting_details_individual/${recordId}`,
            { method: "GET", headers: { Authorization: `Bearer ${token}` } }
        );

        const data = await res.json();
        if (!data) {
            router.push("/meeting?toast=notFound");
            return null;
        }

        setMeetingId(data.meeting_id); // for UI state
        setMeetingName(data.meeting_name || "");
        // data.host_id (get the host name from this)
        setStartTime(formatTime(data.actual_start_time));
        setEndTime(formatTime(data.actual_end_time));
        setTranscription(data.original_transcription);
        setSummary(data.original_summary);

        return data.meeting_id;
    };

    // --- update page title ---
    const getPageTitle = () => {
        if (status === "ongoing") return "Ongoing Meeting";
        if (status === "past") return "Past Meeting";
        if (status === "upcoming") return "Upcoming Meeting";
        return "Meeting";
    };

    async function handleEndMeeting() { // add setting the actual_end_time
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
        alert("Logic for updating meeting");
    }

    async function handleUpdateIndiv() {
        // update individual record (use same as records file)
    }

    async function handleDeleteIndiv() {
        // delete individual record
    }

    async function handleSaveMeeting() {
        // test data: // first click : set test data, second click : save
        setTranscription("Test Transcription");
        setSummary("Test Summary");

        if (!isLoggedIn || !transcription) return;

        setSaving(true);

        try {
            const token = session?.access_token;
            if (!token) {
                alert("You must be logged in to save meetings.");
                return;
            }

            const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/save-meeting`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`,
                },
                body: JSON.stringify({
                    meeting_id: meetingId,
                    translation,
                    translated_lang: translationLang,
                    translated_summary: summary,
                }),
            });

            const result = await res.json();
            if (!res.ok) throw new Error(result.detail || "Failed to save meeting");

            toast.success("Meeting saved successfully");
            setIsSaved(true); // disable button after successful save
        } catch (err) {
            toast.error(err.message || "Failed to save meeting.");
        } finally {
            setSaving(false);
        }
    }

    if (loadingPage) return <p>Loading...</p>;

    return (
        <div className="page-container">
            <button className="back-button"
                onClick={() => {
                    if (recordId) {
                        router.push("/history");
                    } else {
                        router.push("/meeting");
                    }
                }}>
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
                            className="button save-btn"
                            onClick={handleSaveMeeting}
                            disabled={saving || isSaved}
                        >
                            {saving ? "Saving..." : isSaved ? "Saved" : "Save Meeting"}
                        </button>
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
                {status === "past" && role === "participant" && (
                    <div style={{ display: "flex", gap: "8px" }}>
                        <button
                            className="button save-btn"
                            onClick={handleSaveMeeting}
                            disabled={saving || isSaved}
                        >
                            {saving ? "Saving..." : isSaved ? "Saved" : "Save Meeting"}
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
