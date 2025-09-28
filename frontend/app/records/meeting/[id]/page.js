"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import toast from "react-hot-toast";
import Select from "react-select";
import StickyScrollBox from "@/components/StickyScrollBox";
import useAuthCheck from "@/hooks/useAuthCheck";
import { useLanguages } from "@/contexts/LanguagesContext";
import { formatDateFromTimestamp, formatTimeFromTimestamp, formatDateTimeFromTimestamp } from "@/utils/dateTime";
import { summarizeText } from "@/utils/summarization";
import { translateText } from "@/utils/translation";
import { generatePDF } from "@/utils/pdfGenerator";

export default function IndividualMeetingRecordPage() {
    const { id } = useParams();
    const router = useRouter();
    const { session } = useAuthCheck({ redirectIfNotAuth: true, returnSession: true });
    const { languages } = useLanguages();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Meeting fields
    const [meetingName, setMeetingName] = useState("");
    const [meetingHost, setMeetingHost] = useState("");
    const [date, setDate] = useState("");
    const [startTime, setStartTime] = useState("");
    const [endTime, setEndTime] = useState("");

    const [transcription, setTranscription] = useState("");
    const [translation, setTranslation] = useState("");
    const [summary, setSummary] = useState("");

    const [createdAt, setCreatedAt] = useState("");
    const [updatedAt, setUpdatedAt] = useState("");

    const [translationLang, setTranslationLang] = useState("en");

    const [recordData, setRecordData] = useState(null); // for change detection
    const [isDownloaded, setIsDownloaded] = useState(false);

    const [lastProcessedTranslation, setLastProcessedTranslation] = useState({
        input: "",    // transcription used
        lang: "",     // translationLang
        output: ""    // translation result
    });

    const [lastProcessedSummary, setLastProcessedSummary] = useState({
        input: "",    // transcription used
        lang: "",     // translationLang
        output: ""    // summary result
    });

    const matchesRecord =
        transcription === recordData?.transcription &&
        translationLang === recordData?.translationLang;

    const matchesLastTranslate =
        transcription === lastProcessedTranslation?.input &&
        translationLang === lastProcessedTranslation?.lang;

    const matchesLastSummary =
        transcription === lastProcessedSummary?.input &&
        translationLang === lastProcessedSummary?.lang;

    const [processing, setProcessing] = useState(false);

    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);

    // track changes in formData to avoid downloading same data
    useEffect(() => {
        setIsDownloaded(false);
    }, [transcription, translation, summary]);

    // Fetch individual meeting record
    useEffect(() => {
        if (!id || !session?.access_token) return;

        const fetchRecord = async () => {
            try {
                const res = await fetch(
                    `${process.env.NEXT_PUBLIC_BACKEND_URL}/records/meeting_details_individual/${id}`,
                    {
                        headers: {
                            Authorization: `Bearer ${session.access_token}`,
                        },
                    }
                );

                if (!res.ok) {
                    router.push("/history?toast=notFound");
                    return;
                }

                const data = await res.json();

                setMeetingName(data.meeting_name || "");
                setDate(formatDateFromTimestamp(data.actual_start_time) || "");
                setStartTime(formatTimeFromTimestamp(data.actual_start_time));
                setEndTime(formatTimeFromTimestamp(data.actual_end_time));

                setTranscription(data.original_transcription || "");
                setTranslation(data.translation || "");
                setSummary(data.translated_summary || data.original_summary || "");
                setTranslationLang(data.translated_lang || "en");

                setCreatedAt(formatDateTimeFromTimestamp(data.created_at));
                setUpdatedAt(formatDateTimeFromTimestamp(data.updated_at));

                // fetch host name if exists
                if (data.host_id) {
                    if (data.host_id === session.user.id) {
                        setMeetingHost("You are the host");
                    }
                    else {
                        const hostRes = await fetch(
                            `${process.env.NEXT_PUBLIC_BACKEND_URL}/hosts/names/${data.host_id}`,
                            { headers: { Authorization: `Bearer ${session.access_token}` } }
                        );
                        const hostData = await hostRes.json();
                        setMeetingHost(hostData.host.name || "");
                    }

                } else { setMeetingHost("Unavailable"); } // if meeting hosts account no longer exists

                // save original record for change detection
                setRecordData({
                    transcription: data.original_transcription || "",
                    translation: data.translation || "",
                    summary: data.translated_summary || "",
                    translationLang: data.translated_lang || "en",
                });
            } catch (err) {
                console.error("Error fetching individual meeting record:", err);
                toast.error("Failed to load record");
            } finally {
                setLoading(false);
            }
        };

        fetchRecord();
    }, [id, session, router]);

    // Check if any fields changed
    const isChanged = useMemo(() => {
        if (!recordData) return false;
        return (
            transcription !== recordData.transcription ||
            translation !== recordData.translation ||
            summary !== recordData.summary ||
            translationLang !== recordData.translationLang
        );
    }, [transcription, translation, summary, translationLang, recordData]);


    const handleRetranslate = async () => {
        if (!transcription) return;
        setProcessing(true);

        try {
            let result = "";

            if (matchesRecord) {
                result = recordData.translation;
            } else if (matchesLastTranslate) {
                result = lastProcessedTranslation.output;
            } else {
                result = await translateText(transcription, "en", translationLang); // default for now always assume input lang is english
            }

            setTranslation(result);
            setLastProcessedTranslation({
                input: transcription,
                lang: translationLang,
                output: result
            });
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
            let result = "";

            if (matchesRecord) {
                result = recordData.summary;
            } else if (matchesLastSummary) {
                result = lastProcessedSummary.output;
            } else {
                result = await summarizeText(transcription, "en", translationLang);
            }

            setSummary(result);
            setLastProcessedSummary({
                input: transcription,
                lang: translationLang,
                output: result
            });
        } catch (err) {
            console.error(err);
            toast.error("Resummarize failed.");
        } finally {
            setProcessing(false);
        }
    };

    const handleDownload = async () => {
        try {
            const data = {};

            if (transcription) data.Input = transcription;
            if (translation) data.Translation = translation;
            if (summary) data.Summary = summary;

            if (Object.keys(data).length === 0) {
                alert("Nothing to download!");
                return;
            }

            await generatePDF(data);
            setIsDownloaded(true);
        } catch (error) {
            console.error("PDF download failed:", error);
        }
    };

    // Update individual meeting record
    const handleUpdate = async () => {
        if (!isChanged) return;
        setSaving(true);

        try {
            const res = await fetch(
                `${process.env.NEXT_PUBLIC_BACKEND_URL}/update-meeting/${id}`,
                {
                    method: "PUT",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${session.access_token}`,
                    },
                    body: JSON.stringify({
                        translation,
                        translated_lang: translationLang,
                        translated_summary: summary,
                        original_transcription: transcription,
                    }),
                }
            );

            const result = await res.json();
            if (!res.ok) throw new Error(result.detail || "Failed to update record");

            toast.success("Meeting updated successfully");
            // update original recordData for future change detection
            setRecordData({
                transcription,
                translation,
                summary,
                translationLang,
            });
            setUpdatedAt(formatDateTimeFromTimestamp(result.updated_at));
        } catch (err) {
            console.error(err);
            toast.error(err.message || "Failed to update record");
        } finally {
            setSaving(false);
        }
    };

    // Delete individual meeting record
    const handleDelete = async () => {
        if (!confirm("Are you sure you want to delete this record?")) return;

        try {
            const res = await fetch(
                `${process.env.NEXT_PUBLIC_BACKEND_URL}/records/meeting_details_individual/${id}`,
                {
                    method: "DELETE",
                    headers: {
                        Authorization: `Bearer ${session.access_token}`,
                    },
                }
            );

            if (!res.ok) throw new Error("Failed to delete record");

            toast.success("Meeting deleted successfully");
            router.push("/history");
        } catch (err) {
            console.error(err);
            toast.error(err.message || "Failed to delete record");
        }
    };

    if (loading) return <p>Loading...</p>;

    return (
        <div className="page-container">
            <button className="back-button" onClick={() => router.push("/history")}>
                <ArrowLeft size={20} />
            </button>

            <h1 className="page-title">Individual Meeting Record</h1>

            <div className="record-details">
                <div className="meeting-details-row">
                    <h2 className="meeting-name">{meetingName}</h2>
                    <p className="meeting-host">Host: {meetingHost}</p>
                    <p className="meeting-date-time">
                        {date} | {startTime} - {endTime}
                    </p>
                </div>
                {/* Global Controls */}
                <div className="section global-controls">
                    <label>Translation Language:</label>
                    {mounted && (
                        <Select
                            options={languages.filter((l) => l.value !== "auto")}
                            value={languages.find((opt) => opt.value === translationLang)}
                            onChange={(opt) => setTranslationLang(opt.value)}
                            classNamePrefix="react-select"
                        />
                    )}
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
                <div className="ongoing-meeting-layout">
                    {/* Left column */}
                    <div className="ongoing-meeting-left">
                        {/* Transcription */}
                        <div className="section transcription-section">
                            <div className="section-header">
                                <span>Transcription</span>
                            </div>
                            <StickyScrollBox
                                content={transcription}
                                editable={true}
                                onChange={setTranscription}
                            />
                        </div>

                        {/* Translation */}
                        <div className="section translation-section">
                            <div className="section-header">
                                <span>Translation</span>
                            </div>
                            <StickyScrollBox
                                content={translation}
                                editable={true}
                                onChange={setTranslation}
                            />
                        </div>

                    </div>

                    {/* Right column */}
                    <div className="ongoing-meeting-right">
                        {/* Summary */}
                        <div className="section summary-section">
                            <div className="section-header">
                                <span>Summary</span>
                            </div>
                            <StickyScrollBox
                                content={summary}
                                editable={true}
                                onChange={setSummary}
                            />
                        </div>
                    </div>
                </div>

                <div className="meta-info">
                    <p><strong>Created:</strong> {createdAt}</p>
                    <p><strong>Last Updated:</strong> {updatedAt}</p>
                </div>

                <div className="button-group">
                    {/* Download PDF Button */}
                    <button
                        className="button download-pdf-button"
                        onClick={handleDownload}
                        disabled={isDownloaded}
                    >
                        Download PDF
                    </button>
                    <button
                        onClick={handleUpdate}
                        disabled={!isChanged || saving}
                        className="button save"
                    >
                        {saving ? "Updating..." : "Update Record"}
                    </button>
                    <button
                        onClick={handleDelete}
                        className="button delete"
                    >
                        Delete Record
                    </button>
                </div>
            </div>
        </div>
    );
}
