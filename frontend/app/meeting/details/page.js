"use client";

import { useEffect, useState, useRef } from "react";
import { ArrowLeft } from "lucide-react";
import { toast } from "react-hot-toast";
import Select from "react-select";
import { useRouter, useSearchParams } from "next/navigation";
import { useLanguages } from "@/contexts/LanguagesContext";
import useAuthCheck from "@/hooks/useAuthCheck";
import useProfilePrefs from "@/hooks/useProfilePrefs";
import StickyScrollBox from "@/components/StickyScrollBox";
import { formatDate, formatTime, formatTimeFromTimestamp, formatDateFromTimestamp } from "@/utils/dateTime";
import { supabase } from "@/lib/supabaseClient";

export default function MeetingDetailsPage() {
    const { isLoggedIn, loading, session } = useAuthCheck({ redirectIfNotAuth: true, returnSession: true });
    const { prefs, loading: prefsLoading } = useProfilePrefs(session, ["default_language", "auto_save_meetings",]);

    const searchParams = useSearchParams();
    const meetingId = searchParams.get("id");

    const router = useRouter();
    const { languages } = useLanguages();
    const [loadingPage, setLoadingPage] = useState(true);

    const [role, setRole] = useState(null); // "host" or "participant"
    const [status, setStatus] = useState(null); // "ongoing" or "past"

    const roleRef = useRef(role);
    useEffect(() => {
        roleRef.current = role;
    }, [role]);

    const statusRef = useRef(status);
    useEffect(() => {
        statusRef.current = status;
    }, [status])

    const [saving, setSaving] = useState(false);
    const [ending, setEnding] = useState(false);
    const [isSaved, setIsSaved] = useState(false); // track if meeting is saved
    const [isUpdated, setIsUpdated] = useState(false); // track changes from meeting_details record (modify to use some other way) - currently only allows updates once per page load
    const [autoSave, setAutoSave] = useState(false);

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

    // test data
    useEffect(() => {
        if (status !== "ongoing" || role !== "host") return; // only run for ongoing meetings host only

        let counter = 1;

        const timer = setInterval(() => {
            const line = `test line${counter}`;

            setTranscription((prev) => (prev ? prev + "\n" : "") + line);
            setTranslation((prev) => (prev ? prev + "\n" : "") + line);
            setSummary((prev) => (prev ? prev + "\n" : "") + line);

            counter++;
        }, 2000); // every 2 seconds

        return () => clearInterval(timer); // cleanup
    }, [status, role]); // rerun if status changes


    useEffect(() => {
        setMounted(true); // for react-select component
    }, []);

    const prefsAppliedRef = useRef(false);
    useEffect(() => {
        if (!prefsLoading && session?.user && !prefsAppliedRef.current && prefs.default_language) {
            if (prefs.default_language) {
                setTranslationLang(prefs.default_language);
                setSummaryLang(prefs.default_language);
            }
            if (prefs.auto_save_meetings) {
                setAutoSave(true);
            }
            prefsAppliedRef.current = true;
        }
    }, [prefsLoading, session, prefs]);

    useEffect(() => {
        if (!loading && session) {
            const fetchAll = async () => {
                setLoadingPage(true);
                try {
                    if (meetingId) {
                        // from meeting_details
                        await fetchMeetingInfo(meetingId);
                        await fetchMeetingDetails(meetingId);
                        await fetchRole(meetingId);
                    } else {
                        // Safety net: no valid params
                        throw new Error("No meetingId provided");
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
    }, [loading, session]);

    // set indicator of recording for if user is host and meeting is ongoing
    useEffect(() => {
        if (!loading && session) {
            if (role === 'host' && status === 'ongoing') {
                setRecording(true);
            }
        }
    }, [role]);

    // Host updates meeting_details in real-time
    useEffect(() => {
        if (!meetingId || role !== "host" || status !== "ongoing") return;

        const updateRealtime = async () => {
            // Only update if content exists
            if (!transcription && !summary && !translation) return;

            const { error } = await supabase
                .from("meeting_details")
                .update({
                    transcription,
                    en_summary: summary,
                    translated_summary: translation, // modify accordingly
                    transcription_lang: translationLang,
                })
                .eq("meeting_id", meetingId);

            if (error) console.error("Host update error:", error);
        };

        // Debounce updates to prevent spamming database
        const timeout = setTimeout(updateRealtime, 1000); // update every 1 sec
        return () => clearTimeout(timeout);
    }, [transcription, summary, translation, translationLang, meetingId, role]);

    // Participant get real-time data 
    // (this way causes every load of this page to subscribe & fetch current Details, which can trigger errors)
    useEffect(() => {
        if (!meetingId) return;

        const channel = supabase
            .channel(`meeting-${meetingId}`)
            .on("postgres_changes", {
                event: "UPDATE",
                schema: "public",
                table: "meeting_details",
                filter: `meeting_id=eq.${meetingId}`,
            }, (payload) => {
                console.log("Realtime payload:", payload);
                // Only update if this user is a participant and meeting is ongoing
                if (roleRef.current === "participant" && statusRef.current === "ongoing") {
                    const data = payload.new;
                    setTranscription(data.transcription || "");
                    setSummary(data.en_summary || "");

                    if (data.status === "past") {
                        toast('This meeting has ended');
                        setStatus("past"); // update local state
                        if (autoSave) { handleSaveMeeting(); }
                    }
                }
            })
            .subscribe((subStatus) => {
                console.log("Subscription status:", subStatus);
                if (subStatus === "SUBSCRIBED") {
                    fetchCurrentDetails();
                }
            });

        return () => {
            supabase.removeChannel(channel);
        };
    }, [meetingId, session]);




    // fetch from meeting_details table
    const fetchCurrentDetails = async () => {
        try {
            const token = session?.access_token;
            const res = await fetch(
                `${process.env.NEXT_PUBLIC_BACKEND_URL}/meetings/${meetingId}/details`,
                {
                    method: "GET",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                }
            );

            if (!res.ok) {
                const errData = await res.json();
                console.error("Failed to fetch meeting details:", errData.detail);
                return;
            }

            const data = await res.json();

            setTranscription(data.transcription || "");
            setSummary(data.en_summary || "");
            setTranslation(data.translated_summary || "");
        } catch (err) {
            console.error("Error fetching meeting details:", err);
        }
    };


    // -----------------------
    // Fetch functions accept meetingId as argument
    // -----------------------
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
        setStatus(m.status); // 'ongoing' or 'past'
    };

    const fetchMeetingDetails = async (meetingId) => {
        if (!meetingId) return;

        try {
            const token = session?.access_token;
            if (!token) throw new Error("You must be logged in");

            const res = await fetch(
                `${process.env.NEXT_PUBLIC_BACKEND_URL}/meetings/${meetingId}/details`,
                {
                    method: "GET",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                }
            );

            if (!res.ok) {
                const errData = await res.json();
                console.error("Failed to fetch meeting details:", errData.detail);
                return;
            }

            const data = await res.json();

            // Update frontend state 
            setStartTime(formatTimeFromTimestamp(data.actual_start_time));
            setEndTime(formatTimeFromTimestamp(data.actual_end_time));
            setDate(formatDateFromTimestamp(data.actual_start_time) || "");
            // (modify accordingly)
            setTranscription(data.transcription || "");
            setSummary(data.en_summary || "");

        } catch (err) {
            console.error("Error fetching meeting details:", err);
        }
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
            setEnding(true);
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

                // if host has auto-save on : trigger saveMeeting
                if (autoSave) {
                    handleSaveMeeting();
                }

                // 3. Redirect and show confirmation
                router.push("/meeting?toast=meetingEnd"); // back to meetings page
            }

        } catch (err) {
            console.error("Error ending meeting:", err);
            alert("An error occurred while ending the meeting.");
        } finally {
            setEnding(false); // re-enable
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

    // host only : update meeting_details table (for past meeting)
    async function handleUpdateMeeting() {
        if (!isLoggedIn) {
            alert("You must be logged in as host to update the meeting.");
            return;
        }

        const token = session?.access_token;
        if (!token) {
            alert("Missing authentication token.");
            return;
        }

        try {
            if (role !== "host") return;
            const res = await fetch(
                `${process.env.NEXT_PUBLIC_BACKEND_URL}/update-meeting-details/${meetingId}`,
                {
                    method: "PUT",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                        transcription,
                        transcription_lang: translationLang, // modify this to store the actual language of transcription (can be more than one)
                        en_summary: summary, // to be modified to actually store the english summary 
                        translated_summary: summary, // to be modified to actually store the translated summary (same lang as translationLang)
                    }),
                }
            );

            const result = await res.json();
            if (!res.ok) throw new Error(result.detail || "Failed to update meeting");
            else setIsUpdated(true);

            toast.success("Meeting details updated successfully!");
        } catch (err) {
            toast.error(err.message || "Failed to update meeting.");
        }
    }



    // from past / ongoing meeting : save to individual records
    async function handleSaveMeeting() {

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
                onClick={() => router.push("/meeting")}>
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
                            editable={(role === "host" && status === "past")}
                            onChange={setTranscription}
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
                            editable={(role === "host" && status === "past")}
                            onChange={setTranslation}
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
                            editable={(role === "host" && status === "past")}
                            onChange={setSummary}
                        />
                    </div>
                </div>
            </div>

            <div className="meeting-actions">
                {/* Shared checkbox for host & participant when meeting is ongoing */}
                {(role === "host" || role === "participant") && status === "ongoing" && (
                    <div className="checkbox-group">
                        <input
                            type="checkbox"
                            checked={autoSave}
                            onChange={(e) => setAutoSave(e.target.checked)}
                        />
                        <label>Save automatically when meeting ends</label>
                    </div>
                )}

                {/* Host actions */}
                {role === "host" && (
                    <>
                        {status === "ongoing" && (
                            <div>
                                <button
                                    className="button delete"
                                    onClick={handleEndMeeting}
                                    disabled={ending}
                                >
                                    {ending ? "Ending..." : "End Meeting"}
                                </button>
                            </div>
                        )}

                        {status === "past" && (
                            <div className="button-group">
                                <button
                                    className="button save-btn"
                                    onClick={handleSaveMeeting}
                                    disabled={saving || isSaved}
                                >
                                    {saving ? "Saving..." : isSaved ? "Saved" : "Save Meeting"}
                                </button>
                                <button className="button update-btn"
                                    onClick={handleUpdateMeeting}
                                    disabled={isUpdated}>
                                    {saving ? "Saving..." : isUpdated ? "Updated" : "Update Meeting"}
                                </button>
                                <button className="button delete" onClick={handleDeleteMeeting}>
                                    Delete
                                </button>
                            </div>
                        )}
                    </>
                )}

                {/* Participant actions */}
                {role === "participant" && status === "past" && (
                    <button
                        className="button save-btn"
                        onClick={handleSaveMeeting}
                        disabled={saving || isSaved}
                    >
                        {saving ? "Saving..." : isSaved ? "Saved" : "Save Meeting"}
                    </button>
                )}
            </div>
        </div>
    );
}
