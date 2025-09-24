"use client";

import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { toast } from "react-hot-toast";
import Select from "react-select";
import { useRouter, useSearchParams } from "next/navigation";
import { useLanguages } from "@/contexts/LanguagesContext";
import useAuthCheck from "@/hooks/useAuthCheck";
import StickyScrollBox from "@/components/StickyScrollBox";
import { formatDate, formatTime, formatTimeFromTimestamp, formatDateFromTimestamp } from "@/utils/dateTime";

export default function MeetingDetailsPage() {
    const { isLoggedIn, loading, session } = useAuthCheck({ redirectIfNotAuth: true, returnSession: true });
    const token = session?.access_token;

    const router = useRouter();
    const searchParams = useSearchParams();
    const { languages } = useLanguages();
    const [loadingPage, setLoadingPage] = useState(true);

    const [role, setRole] = useState(null); // "host" or "participant"
    const [status, setStatus] = useState(null); // "upcoming" or "ongoing" or "past"

    const [recordMeetingId, setRecordMeetingId] = useState(null); // if source is from records
    const meetingId = searchParams.get("id");
    const recordId = searchParams.get("recordId");

    const [saving, setSaving] = useState(false);
    const [isSaved, setIsSaved] = useState(false); // track if meeting is saved
    const [isUpdated, setIsUpdated] = useState(false); // track changes from saved record

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
                setLoadingPage(true);
                try {
                    if (recordId) {
                        // Individual record flow
                        await fetchIndivMeeting(recordId);
                        setRole("participant");
                        setStatus("past");
                    } else if (meetingId) {
                        // Normal meeting flow
                        await fetchMeetingInfo(meetingId);
                        await fetchMeetingDependentData(meetingId);
                    } else {
                        // Safety net: no valid params
                        throw new Error("No meetingId or recordId provided");
                    }
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
        setDate(formatDate(m.date) || "");
        setStartTime(formatTime(m.start_time));
        setEndTime(formatTime(m.end_time));
    };

    const fetchIndivMeeting = async (recordId) => {
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

        setRecordMeetingId(data.meeting_id); // possibly null (if meeting was deleted by host)
        setMeetingName(data.meeting_name || "");
        // data.host_id (get the host name from this)
        setDate(formatDateFromTimestamp(data.actual_start_time) || "");
        setStartTime(formatTimeFromTimestamp(data.actual_start_time));
        setEndTime(formatTimeFromTimestamp(data.actual_end_time));
        setTranscription(data.original_transcription);
        setSummary(data.original_summary);
        setTranslation(data.translation);
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

    // host only : delete from meetings table (on delete cascade meeting_participants, meeting_details)
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

    // host only : update meeting_details table
    async function handleUpdateMeeting() {
        alert("Logic for updating meeting");
    }

    // from saved individual record, update the record
    async function handleUpdateIndiv() {
        // update individual record (use same as records file)
    }

    // from saved individual record, delete the record
    async function handleDeleteIndiv() {
        // delete individual record (use same as records file)
    }

    // from past / ongoing meeting : save to individual records
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
                {meetingId && status === "past" && role === "participant" && (
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
                {recordId && (
                    <div style={{ display: "flex", gap: "8px" }}>
                        <button
                            className="button update-btn"
                            onClick={handleUpdateIndiv}
                            disabled={saving || isUpdated}
                        >
                            {saving ? "Saving..." : isUpdated ? "Updated" : "Update Record"}
                        </button>
                        <button
                            className="button delete-btn"
                            onClick={handleDeleteIndiv}
                        >
                            {"Delete Record"}
                        </button>
                    </div>
                )}
                {/* any buttons for participants of ongoing / past meetings
                    Ongoing : Save meeting once it ends (checkbox)
                    Past : Save meeting */}
            </div>
        </div>
    );
}
