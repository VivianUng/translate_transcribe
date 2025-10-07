"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { ArrowLeft } from "lucide-react";
import { toast } from "react-hot-toast";
import { useRouter, useSearchParams } from "next/navigation";
import useAuthCheck from "@/hooks/useAuthCheck";
import useProfilePrefs from "@/hooks/useProfilePrefs";
import { confirmDeletion, confirmExit } from "@/components/ConfirmBox"
import LanguageSelect from "@/components/LanguageSelect"
import StickyScrollCopyBox from "@/components/StickyScrollCopyBox"
import { formatTimeFromTimestamp, formatDateFromTimestamp } from "@/utils/dateTime";
import { supabase } from "@/lib/supabaseClient";
import { summarizeText } from "@/utils/summarization";
import { translateText } from "@/utils/translation";
import { generatePDF } from "@/utils/pdfGenerator";
import { useTranslateWebSocket } from "@/utils/translateWebSocket";
import { startAudioStreaming, stopAudioStreaming } from "@/utils/transcription";
import { useListening } from "@/contexts/ListeningContext";

function throttle(fn, limit) {
    let inThrottle = false;
    return (...args) => {
        if (!inThrottle) {
            fn(...args);
            inThrottle = true;
            setTimeout(() => (inThrottle = false), limit);
        }
    };
}


export default function MeetingDetailsPage() {
    const { isLoggedIn, loading, session } = useAuthCheck({ redirectIfNotAuth: true, returnSession: true });
    const { prefs, loading: prefsLoading } = useProfilePrefs(session, ["default_language", "auto_save_meetings",]);

    const searchParams = useSearchParams();
    const meetingId = searchParams.get("id");

    const router = useRouter();
    const [loadingPage, setLoadingPage] = useState(true);

    const [role, setRole] = useState("participant"); // "host" or "participant"
    const [status, setStatus] = useState(null); // "ongoing" or "past"

    const roleRef = useRef(role);
    useEffect(() => {
        roleRef.current = role;
    }, [role]);

    const statusRef = useRef(status);
    useEffect(() => {
        statusRef.current = status;
    }, [status])

    // const [listening, setListening] = useState(false);
    const { listening, setListening } = useListening();
    const [recordingType, setRecordingType] = useState(null); // "mic" or "screen" or "both"
    const [audioSession, setAudioSession] = useState(null);

    const [saving, setSaving] = useState(false);
    const [ending, setEnding] = useState(false);
    const [record, setRecord] = useState(null);
    const [isSaved, setIsSaved] = useState(false); // track if meeting is saved (modify to actually track if it exists in meeting_details_individual)
    const [autoSave, setAutoSave] = useState(false);

    const autoSaveRef = useRef(autoSave);
    useEffect(() => {
        autoSaveRef.current = autoSave;
    }, [autoSave])

    const [meetingName, setMeetingName] = useState("");
    const [meetingHost, setMeetingHost] = useState("");
    const [date, setDate] = useState("");
    const [startTime, setStartTime] = useState("");
    const [endTime, setEndTime] = useState("");

    // State for live data / past data
    const [transcriptionLang, setTranscriptionLang] = useState("en");
    const [translationLang, setTranslationLang] = useState("en");
    const [transcription, setTranscription] = useState("");
    const [translation, setTranslation] = useState("");
    const [enSummary, setEnSummary] = useState("");
    const [summary, setSummary] = useState("");

    const [detectedLang, setDetectedLang] = useState("en");

    const transcriptionLangRef = useRef(transcriptionLang);
    const translationLangRef = useRef(translationLang);
    const transcriptionRef = useRef(transcription);
    const translationRef = useRef(translation);
    const summaryRef = useRef(summary);

    useEffect(() => {
        transcriptionLangRef.current = transcriptionLang;
    }, [transcriptionLang]);

    useEffect(() => {
        translationLangRef.current = translationLang;
    }, [translationLang]);

    useEffect(() => {
        transcriptionRef.current = transcription;
    }, [transcription]);

    useEffect(() => {
        translationRef.current = translation;
    }, [translation]);

    useEffect(() => {
        summaryRef.current = summary;
    }, [summary]);

    const [doTranslation, setDoTranslation] = useState(false);
    const [doSummarization, setDoSummarization] = useState(false);
    const [processing, setProcessing] = useState(false);

    useTranslateWebSocket(transcriptionLang, detectedLang, translationLang, transcription, doTranslation, setTranslation);
    useTranslateWebSocket(
        "en", // always English source for host summary
        "en",
        translationLang,
        enSummary,
        doSummarization && role === "participant",
        setSummary
    );

    const lastSummarizedIndex = useRef(0);
    const THROTTLE_MS = 1000;

    const [mounted, setMounted] = useState(false);

    const toastShownRef = useRef(false);

    const isTextChanged = useMemo(() => {
        if (!record || !transcription) return false;
        return (
            transcription !== (record.transcription || "") ||
            enSummary !== (record.en_summary || "") ||
            summary !== (record.translated_summary || "")
        );
    }, [record, transcription, enSummary, summary]);



    useEffect(() => {
        setMounted(true); // for react-select component
    }, []);

    const prefsAppliedRef = useRef(false);
    useEffect(() => {
        if (!prefsLoading && session?.user && !prefsAppliedRef.current && prefs.default_language) {
            if (prefs.default_language) {
                setTranslationLang(prefs.default_language);
            }
            if (prefs.auto_save_meetings) {
                setAutoSave(true);
            }
            prefsAppliedRef.current = true;
        }
    }, [prefsLoading, session, prefs]);

    useEffect(() => {
        if (!loading && session) {
            (async () => {
                setLoadingPage(true);
                try {
                    if (!meetingId) throw new Error("No meetingId provided");
                    await fetchMeetingDetails(meetingId);
                } catch (err) {
                    console.error("Error fetching meeting data:", err);
                    router.push("/meeting?toast=notFound");
                } finally {
                    setLoadingPage(false);
                }
            })();
        }
    }, [loading, session]);


    // Host updates meeting_details in real-time
    useEffect(() => {
        if (!meetingId || role !== "host" || status !== "ongoing") return;

        const updateRealtime = async () => {
            // Only update if content exists
            if (!transcription) return;

            const updateData = {};
            if (transcription) updateData.transcription = transcription;
            if (enSummary) updateData.en_summary = enSummary;
            if (summary) updateData.translated_summary = summary;
            if (transcriptionLang) updateData.transcription_lang = transcriptionLang;

            // Perform the update only with the fields present
            const { error } = await supabase
                .from("meeting_details")
                .update(updateData)
                .eq("meeting_id", meetingId);

            if (error) console.error("Host update error:", error);
        };

        // Debounce updates to prevent spamming database
        const timeout = setTimeout(updateRealtime, 200); // update every 200ms (update according to speed of transcription - should be slightly lower than speed of transcription)
        return () => clearTimeout(timeout);
    }, [transcription, enSummary, summary, transcriptionLang, meetingId, role]);

    // Participant get real-time data 
    useEffect(() => {
        if (!meetingId) return;

        const channel = supabase
            .channel(`meeting-${meetingId}`)
            .on("postgres_changes", {
                event: "UPDATE",
                schema: "public",
                table: "meeting_details",
                filter: `meeting_id=eq.${meetingId}`,
            }, async (payload) => {
                // Only update if this user is a participant and meeting is ongoing
                if (roleRef.current === "participant" && statusRef.current === "ongoing") {
                    const data = payload.new;
                    setTranscription(data.transcription || "");
                    setTranscriptionLang(data.transcription_lang || "en");
                    setEnSummary(data.en_summary || "");

                    if (data.status === "past" && !toastShownRef.current) {
                        toast('This meeting has ended');
                        toastShownRef.current = true;
                        await fetchMeetingDetails(meetingId); // final fetch after meeting ends

                        if (autoSaveRef.current) {
                            await handleSaveMeeting();
                        }
                        setStatus("past"); // update local state   
                        supabase.removeChannel(channel);
                    }
                }
            }).subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [meetingId, session]);


    // real-time summaries (host, and participant if host doesn't enabme summarization) : 
    const throttledSummarize = useMemo(
        () =>
            throttle(async (words) => {
                try {
                    // Summarize the entire transcription in English
                    const enResult = await summarizeText(
                        words.join(" "),
                        transcriptionLangRef.current,
                        "en"
                    );

                    setEnSummary(enResult); // keep internal English summary

                    let translatedResult = enResult;
                    if (translationLangRef.current !== "en") {
                        // Translate the English summary to target language
                        translatedResult = await translateText(
                            enResult,
                            "en",
                            translationLangRef.current
                        );
                    }

                    // Replace the rolling summary instead of appending
                    setSummary(translatedResult);

                    lastSummarizedIndex.current = words.length;
                } catch (err) {
                    console.error(err);
                    toast.error("Rolling summarization failed.");
                }
            }, THROTTLE_MS * 5), // slower throttle for summaries
        []
    );

    useEffect(() => {
        // only host does summarizations, stores enSummary & translated summary to let participant fetch
        if (!doSummarization || !transcription || role !== "host") return;

        const words = transcription.split(/\s+/);

        // Only trigger if enough new words since last summary
        if (words.length - lastSummarizedIndex.current < 50) return;
        // adjust threshold for how often to resummarize

        throttledSummarize(words);
    }, [transcription, doSummarization, throttledSummarize]);



    useEffect(() => {
        if (!doSummarization || role !== "participant") return;

        if (!enSummary && transcription) {
            // No host summary → fall back to own summarization
            const words = transcription.split(/\s+/);
            if (words.length - lastSummarizedIndex.current < 50) return;

            throttledSummarize(words);
        }
    }, [enSummary, transcription, doSummarization, role, throttledSummarize]);

    // -----------------------
    // Recording functions (host only)
    // -----------------------
    const handleStart = async (sourceType) => {
        const session = await startAudioStreaming({
            sourceType,
            setTranscription,
            setListening,
            setRecordingType,
            inputLang: transcriptionLang,
            setDetectedLang,
        });
        setAudioSession(session);
    };

    const handleStop = () => {
        if (!audioSession) return;

        stopAudioStreaming({
            ...audioSession,
            setListening,
            setRecordingType,
        });

        setAudioSession(null);
        setDoTranslation(false);
    };



    // -----------------------
    // Fetch functions
    // -----------------------
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
                    credentials: 'include',
                }
            );

            if (!res.ok) {
                const errData = await res.json();
                console.error("Failed to fetch meeting details:", errData.detail);
                router.push("/meeting?toast=notFound");
                return;
            }

            const data = await res.json();

            setMeetingName(data.name || "");
            setMeetingHost(data.host_name || "");
            setStatus(data.status); // 'ongoing' or 'past'

            if (data.host_id === session.user.id) {
                setMeetingHost("You are the host");
                setRole("host");
            } else { setRole("participant"); }

            const normalized = {
                transcription: data.transcription,
                en_summary: data.en_summary,
                translated_summary: data.translated_summary,
            };
            setRecord(normalized);

            // Update frontend state 
            setStartTime(formatTimeFromTimestamp(data.actual_start_time) || "");
            setEndTime(formatTimeFromTimestamp(data.actual_end_time) || "");
            setDate(formatDateFromTimestamp(data.actual_start_time) || "");
            // (modify accordingly)
            setTranscription(data.transcription || "");
            setTranscriptionLang(data.transcription_lang || "en");
            setEnSummary(data.en_summary || "");

            setSummary((prev) => {
                if (prev && prev !== "") {
                    return prev; // keep existing summary
                }
                return data.translated_summary || "";
            });

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
                    toast.error("You must be logged in to end meetings.");
                    return;
                }

                // 1. stop audio stream if still active
                if (audioSession) {
                    stopAudioStreaming({
                        ...audioSession,
                        setListening,
                        setRecordingType,
                    });
                    setAudioSession(null);
                }

                // 2. stop translation and summarization
                setDoTranslation(false);
                setDoSummarization(false);


                // 2. Update meeting status → "past"
                const res = await fetch(
                    `${process.env.NEXT_PUBLIC_BACKEND_URL}/meetings/${meetingId}/status`,
                    {
                        method: "PUT",
                        headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${token}`,
                        },
                        credentials: 'include',
                        body: JSON.stringify({ status: "past" }),
                    }
                );

                if (!res.ok) {
                    const errorData = await res.json();
                    console.error("Failed to update meeting status:", errorData.detail || errorData);
                    toast.error("Failed to end meeting.");
                    return;
                }

                const data = await res.json();

                // if host has auto-save on : trigger saveMeeting
                if (autoSaveRef.current) {
                    handleSaveMeeting();
                }

                toast.success("Meeting Ended");
                setEndTime(formatTimeFromTimestamp(new Date().toISOString()));
                setStatus("past");
            }

        } catch (err) {
            console.error("Error ending meeting:", err);
            toast.error("An error occurred while ending the meeting.");
        } finally {
            setEnding(false); // re-enable
        }
    }

    const handleDownload = async () => {
        try {
            const data = {};

            if (transcription) data.Input = transcription;
            if (translation) data.Translation = translation;
            if (summary) data.Summary = summary;

            if (Object.keys(data).length === 0) {
                toast.error("Nothing to download!");
                return;
            }

            await generatePDF(data);
        } catch (error) {
            console.error("PDF download failed:", error);
        }
    };

    // host only : delete from meetings table (on delete cascade meeting_participants, meeting_details)
    async function handleDeleteMeeting() {
        try {
            if (role !== "host") return;

            const confirmed = await confirmDeletion(`Are you sure you want to delete this meeting?`);
            if (!confirmed) return;
            const token = session?.access_token;
            if (!token) {
                toast.error("You must be logged in to end meetings.");
                return;
            }
            const res = await fetch(
                `${process.env.NEXT_PUBLIC_BACKEND_URL}/meetings/${meetingId}`,
                {
                    method: "DELETE",
                    headers: { Authorization: `Bearer ${token}` },
                    credentials: 'include',
                }
            );

            if (!res.ok) {
                const errData = await res.json();
                console.error("Failed to delete meeting:", errData);
                toast.error("Failed to delete meeting.");
                return;
            }

            router.push("/meeting?toast=deleteMeetingSuccess");
        } catch (err) {
            console.error("Error deleting meeting:", err);
            toast.error("An error occurred while deleting the meeting.");
        }
    }

    // host only : update meeting_details table (for past meeting) (only if transcription was updated)
    async function handleUpdateMeeting() {
        if (!isLoggedIn) {
            toast.error("You must be logged in as host to update the meeting.");
            return;
        }

        const token = session?.access_token;
        if (!token) {
            toast.error("Missing authentication token.");
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
                    credentials: 'include',
                    body: JSON.stringify({
                        transcription,
                        transcription_lang: transcriptionLang, // modify this to store the actual language of transcription (can be more than one)
                        en_summary: summary, // to be modified to actually store the english summary 
                        translated_summary: summary, // to be modified to actually store the translated summary (same lang as translationLang)
                    }),
                }
            );

            const result = await res.json();
            if (!res.ok) throw new Error(result.detail || "Failed to update meeting");
            else { // update local record value
                const normalized = {
                    transcription: transcription,
                    en_summary: enSummary,
                    translated_summary: summary,
                };
                setRecord(normalized);
            }

            toast.success("Meeting details updated successfully!");
        } catch (err) {
            toast.error(err.message || "Failed to update meeting.");
        }
    }



    // from past / ongoing meeting : save to individual records
    async function handleSaveMeeting() {

        setSaving(true);

        try {
            const token = session?.access_token;
            if (!token) {
                toast.error("You must be logged in to save meetings.");
                return;
            }

            const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/save-meeting`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`,
                },
                credentials: 'include',
                body: JSON.stringify({
                    meeting_id: meetingId,
                    translation: translationRef.current,
                    translated_lang: translationLangRef.current,
                    translated_summary: summaryRef.current,
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

    const handleRetranslate = async () => {
        if (!transcription) return;
        setProcessing(true);

        try {
            const result = await translateText(transcription, transcriptionLang, translationLang);
            setTranslation(result);

        } catch (err) {
            console.error(err);
            toast.error("Retranslate failed.");
        } finally {
            setProcessing(false);
        }
    };

    const handleResummarize = async () => {
        if (!transcription) return;
        setProcessing(true);

        try {
            const result = await summarizeText(transcription, transcriptionLang, translationLang);
            setSummary(result);
        } catch (err) {
            console.error(err);
            toast.error("Resummarize failed.");
        } finally {
            setProcessing(false);
        }
    };

    const handleBackClick = async () => {
        if (listening) {
            const confirmed = await confirmExit(
                "You are currently in a meeting. Are you sure you want to leave? This end the meeting."
            );
            if (!confirmed) return; // Stop if user cancels

            await handleEndMeeting();
        }

        // --- Navigate after cleanup ---
        router.push("/meeting");
    };

    if (loadingPage) return <p>Loading...</p>;

    return (
        <div className="page-container">
            <button className="back-button"
                onClick={handleBackClick}>
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

            {status == "ongoing" && role == "host" && (
                <div className="button-group" style={{ marginTop: "-20px", marginBottom: "-20px" }}>
                    {/* Microphone only */}
                    <button
                        onClick={recordingType === "mic" && listening ? handleStop : () => handleStart("mic")}
                        className="button audio-stream-button"
                        title="Capture your microphone audio only"
                        disabled={
                            (recordingType === "screen" && listening) ||
                            (recordingType === "both" && listening)
                        }
                    >
                        {recordingType === "mic" && listening ? "Stop ⏹️" : "Mic 🎙️"}
                    </button>

                    {/* System (screen) audio only */}
                    <button
                        onClick={recordingType === "screen" && listening ? handleStop : () => handleStart("screen")}
                        className="button audio-stream-button"
                        title="Capture system or tab audio only"
                        disabled={
                            (recordingType === "mic" && listening) ||
                            (recordingType === "both" && listening)
                        }
                    >
                        {recordingType === "screen" && listening ? "Stop ⏹️" : "System 🔊"}
                    </button>
                    {/* Mic + System (both) */}
                    <button
                        onClick={recordingType === "both" && listening ? handleStop : () => handleStart("both")}
                        className="button audio-stream-button"
                        title="Capture both microphone and system sound"
                        disabled={
                            (recordingType === "mic" && listening) ||
                            (recordingType === "screen" && listening)
                        }
                    >
                        {recordingType === "both" && listening ? "Stop ⏹️" : "Both 🎧"}
                    </button>
                </div>
            )}


            <div className="section global-controls">
                <label>Translation Language:</label>
                {mounted && (
                    <LanguageSelect
                        mounted={mounted}
                        value={translationLang}
                        setValue={setTranslationLang}
                        excludeAuto={true}
                    />
                )}

                {status === "ongoing" && (
                    <div className="meeting-checkbox-group">
                        <label>
                            <input
                                type="checkbox"
                                checked={doTranslation}
                                onChange={(e) => setDoTranslation(e.target.checked)}
                            />
                            Translate
                        </label>

                        <label>
                            <input
                                type="checkbox"
                                checked={doSummarization}
                                onChange={(e) => setDoSummarization(e.target.checked)}
                            />
                            Summarize
                        </label>
                    </div>
                )}
                {status === "past" && (
                    <>
                        <div className="button-group" style={{ flex: 1, gap: 8, flexWrap: "nowrap" }}>
                            <button
                                className="button extra-action"
                                disabled={processing}
                                onClick={handleRetranslate}
                            >
                                {processing ? "Processing..." : "Retranslate"}
                            </button>
                            <button
                                className="button extra-action"
                                disabled={processing}
                                onClick={handleResummarize}
                            >
                                {processing ? "Processing..." : "Resummarize"}
                            </button>
                        </div>
                    </>
                )}
            </div>

            <div className="meeting-layout">
                {/* Left column */}
                <div className="meeting-layout-left">
                    {/* Transcription */}
                    <div className="section transcription-section">
                        <div className="section-header">
                            <span>Transcription</span>
                            {role === "host" && status === "ongoing" && (
                                <>
                                    {mounted && (
                                        <LanguageSelect
                                            mounted={mounted}
                                            value={transcriptionLang}
                                            setValue={setTranscriptionLang}
                                            isDisabled={listening}
                                        />
                                    )}
                                </>
                            )}
                            {role === "host" && listening && (
                                <span className="recording-indicator">
                                    🔴{" "}
                                    {recordingType === "mic"
                                        ? "Recording microphone"
                                        : recordingType === "screen"
                                            ? "Recording system audio"
                                            : recordingType === "both"
                                                ? "Recording mic and system audio"
                                                : "Recording"}
                                </span>
                            )}
                        </div>
                        <StickyScrollCopyBox
                            value={transcription}
                            setValue={setTranscription}
                            placeholder="Waiting for transcription..."
                            readOnly={!(role === "host" && status === "past")}
                            autoScroll={!(role === "host" && status === "past")}
                        />
                    </div>

                    {/* Translation */}
                    <div className="section translation-section">
                        <div className="section-header">
                            <span>Translation</span>
                            {status === "ongoing" && (
                                <input className="checkbox-input"
                                    type="checkbox"
                                    checked={doTranslation}
                                    onChange={(e) => setDoTranslation(e.target.checked)}
                                />)}

                        </div>
                        <StickyScrollCopyBox
                            value={translation}
                            setValue={setTranslation}
                            placeholder="Translation will appear here..."
                            readOnly={!(role === "host" && status === "past")}
                            autoScroll={!(role === "host" && status === "past")}
                        />
                    </div>
                </div>

                {/* Right column (Summary) */}
                <div className="meeting-layout-right">
                    <div className="section summary-section">
                        <div className="section-header">
                            <span>Summary</span>
                            {status === "ongoing" && (
                                <input className="checkbox-input"
                                    type="checkbox"
                                    checked={doSummarization}
                                    onChange={(e) => setDoSummarization(e.target.checked)}
                                />)}
                        </div>
                        <StickyScrollCopyBox
                            value={summary}
                            setValue={setSummary}
                            placeholder="Summary will appear here..."
                            readOnly={!(role === "host" && status === "past")}
                            autoScroll={!(role === "host" && status === "past")}
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
                <div className="button-group">

                    {/* Host actions during meeting */}
                    {role === "host" && status === "ongoing" && (
                        <button
                            className="button delete"
                            onClick={handleEndMeeting}
                            disabled={ending}
                        >
                            {ending ? "Ending..." : "End Meeting"}
                        </button>
                    )}

                    {/* Common actions after meeting ends */}
                    {status === "past" && (
                        <>
                            {/* Download PDF Button */}
                            <button
                                className="button download-pdf-button"
                                onClick={handleDownload}
                                disabled={!transcription}
                            >
                                Download PDF
                            </button>

                            {/* Save Meeting button */}
                            <button
                                className="button save-btn"
                                onClick={handleSaveMeeting}
                                disabled={saving || isSaved || !transcription}
                            >
                                {saving ? "Saving..." : isSaved ? "Saved" : "Save Meeting"}
                            </button>

                            {/* Host-only extra actions */}
                            {role === "host" && (
                                <>
                                    <button
                                        className="button update-btn"
                                        onClick={handleUpdateMeeting}
                                        disabled={!isTextChanged}
                                    >
                                        {saving ? "Saving..." : "Update Meeting"}
                                    </button>
                                    <button
                                        className="button delete"
                                        onClick={handleDeleteMeeting}
                                    >
                                        Delete
                                    </button>
                                </>
                            )}
                        </>
                    )}

                </div>
            </div>
        </div>
    );
}
