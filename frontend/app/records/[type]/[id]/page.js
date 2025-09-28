"use client";
import { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Select from "react-select";
import toast from "react-hot-toast";
import { ArrowLeft } from "lucide-react";
import { formatDateTimeFromTimestamp } from "@/utils/dateTime";
import useAuthCheck from "@/hooks/useAuthCheck";
import { useLanguages } from "@/contexts/LanguagesContext";
import { detectAndValidateLanguage } from "@/utils/languageDetection";
import { summarizeText } from "@/utils/summarization";
import { translateText } from "@/utils/translation";
import { generatePDF } from "@/utils/pdfGenerator";

export default function RecordDetailsPage() {
    const { type, id } = useParams(); // dynamic route parameters
    const router = useRouter();
    const { session } = useAuthCheck({ redirectIfNotAuth: true, returnSession: true });
    const { languages } = useLanguages();

    const [mounted, setMounted] = useState(false);

    const [record, setRecord] = useState(null);
    const [formData, setFormData] = useState(null);
    const [lastProcessed, setLastProcessed] = useState(null);
    const [isDownloaded, setIsDownloaded] = useState(false);
    
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [error, setError] = useState(null);

    // Map frontend type → backend endpoint
    const endpointMap = {
        conversation: "conversations",
        translation: "translations",
        summary: "summaries",
    };

    // Safe lookup
    const getEndpoint = (type) => endpointMap[type] || `${type}s`;


    // For checking to prevent runnning resummarize / retranslate on same inputs
    const differsFromLastProcessed =
        !!formData && !!lastProcessed &&
        (formData.input_text !== lastProcessed.input_text ||
            formData.output_lang !== lastProcessed.output_lang);

    // Disabled reason
    const actionDisabledReason = (() => {
        if (processing) return "Processing...";
        if (!differsFromLastProcessed) {
            return "No changes compared to last processed state";
        }
        if (type === "translation" && formData.input_lang === formData.output_lang) {
            return "Input language is the same as output language";
        }
        return "";
    })();

    const actionDisabled = Boolean(actionDisabledReason);

    // only save update if the input / output changed. Not if only the language changed
    const isTextChanged = useMemo(() => {
        if (!record || !formData) return false;
        return (
            formData.input_text !== record.input_text ||
            formData.output_text !== record.output_text
        );
    }, [record, formData]);

    // track changes in formData to avoid downloading same data
    useEffect(() => {
        setIsDownloaded(false);
    }, [formData]);

    // Fetch record by ID
    useEffect(() => {
        setMounted(true);
        if (!id || !session?.access_token) return;

        async function fetchRecord() {
            try {
                const res = await fetch(
                    `${process.env.NEXT_PUBLIC_BACKEND_URL}/records/${getEndpoint(type)}/${id}`,
                    {
                        headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${session.access_token}`,
                        },
                    }
                );

                if (!res.ok) {
                    router.push('/history?toast=notFound');
                }

                const data = await res.json();
                const normalized = {
                    id: data.id,
                    input_text: data.input_text || "",
                    input_lang: data.input_lang || "en",
                    output_text: data.output_text || "",
                    output_lang: data.output_lang || "en",
                    created_at: data.created_at,
                    updated_at: data.updated_at,
                };
                setRecord(normalized);
                setFormData(normalized);

                setLastProcessed({
                    input_text: normalized.input_text,
                    output_lang: normalized.output_lang,
                    output_text: normalized.output_text,
                });

            } catch (err) {
                // final fallback user-friendly message
                let msg = err.message || "Error fetching record";
                if (
                    msg.includes("Cannot coerce") ||
                    msg.includes("PGRST") ||
                    msg.includes("rows")
                ) {
                    msg = "Record not found.";
                }
                setError(msg);
            } finally {
                setLoading(false);
            }
        }

        fetchRecord();
    }, [id, session, type]);

    const handleDownload = async () => {
        try {
            const keyName = type === "summary" ? "Summary" : "Translation";
            const data = {
                Input: formData.input_text,
                [keyName]: formData.output_text,
            };

            await generatePDF(data);
            setIsDownloaded(true);
        } catch (error) {
            console.error("PDF download failed:", error);
        }
    };

    // Update record
    const handleUpdate = async () => {
        if (!id || !formData) return;
        if (!formData.input_text) return toast.error("Input field cannot be empty.");
        setSaving(true);
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/records/${getEndpoint(type)}/${id}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${session?.access_token}`,
                },
                body: JSON.stringify({
                    input_text: formData.input_text,
                    output_text: formData.output_text,
                    output_lang: formData.output_lang,
                    updated_at: new Date().toISOString(),
                }),
            });
            if (!res.ok) throw new Error("Failed to update record");

            const updated = await res.json();
            setRecord(updated);
            setFormData(updated);
            toast.success(`${type.charAt(0).toUpperCase() + type.slice(1)} updated successfully!`);
        } catch (err) {
            console.error("Error updating:", err);
            toast.error("Update failed.");
        } finally {
            setSaving(false);
        }
    };

    // Delete record
    const handleDelete = async () => {
        if (!id) return;
        if (!confirm(`Are you sure you want to delete this ${type}?`)) return;

        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/records/${getEndpoint(type)}/${id}`, {
                method: "DELETE",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${session?.access_token}`,
                },
            });
            if (!res.ok) throw new Error("Failed to delete record");
            toast.success(`${type.charAt(0).toUpperCase() + type.slice(1)} deleted.`);
            router.push("/history");
        } catch (err) {
            console.error("Error deleting:", err);
            toast.error("Delete failed.");
        }
    };

    // Extra action: retranslate or resummarize
    const handleExtraAction = async () => {
        if (!formData) return;
        setProcessing(true);

        try {
            let result = "";
            let filteredText = formData.input_text;

            // --- Cache checks ---
            const matchesRecord =
                formData.input_text === record.input_text &&
                formData.output_lang === record.output_lang;

            const matchesLast =
                formData.input_text === lastProcessed.input_text &&
                formData.output_lang === lastProcessed.output_lang;

            // --- Case 1: Exact match with cache → reuse directly ---
            if (matchesRecord) {
                result = record.output_text;
            }
            else if (matchesLast) {
                result = lastProcessed.output_text;
            }
            else {
                // --- Validation if input_text changed from both caches ---
                const inputChanged =
                    formData.input_text !== record.input_text &&
                    formData.input_text !== lastProcessed.input_text;

                if (inputChanged) {
                    const validatorType = type === "summary" ? "summarizer" : "translator";
                    const { valid, filteredText: validatedText, message } =
                        await detectAndValidateLanguage(
                            validatorType,
                            formData.input_lang,
                            formData.input_text
                        );

                    if (!valid) {
                        toast.error(message || "Invalid input text for processing.");
                        setProcessing(false);
                        return;
                    }

                    filteredText = validatedText;
                    setFormData((prev) => ({ ...prev, input_text: validatedText }));
                }

                // --- Case 2: Processing based on type ---
                if (type === "summary") {
                    const inputMatchesRecord = formData.input_text === record.input_text;
                    const inputMatchesLast = formData.input_text === lastProcessed.input_text;

                    if (inputMatchesRecord) {
                        // Same input, new output lang → translate record’s summary
                        result = await translateText(
                            record.output_text,
                            record.output_lang,
                            formData.output_lang
                        );
                    } else if (inputMatchesLast) {
                        // Same input, new output lang → translate lastProcessed summary
                        result = await translateText(
                            lastProcessed.output_text,
                            lastProcessed.output_lang,
                            formData.output_lang
                        );
                    } else {
                        // New input text → must re-summarize
                        result = await summarizeText(
                            filteredText,
                            formData.input_lang,
                            formData.output_lang
                        );
                    }
                } else if (type === "translation" || type === "conversation") {
                    result = await translateText(
                        filteredText,
                        formData.input_lang,
                        formData.output_lang
                    );
                }
            }

            // --- Save result ---
            setFormData((prev) => ({ ...prev, output_text: result }));
            setLastProcessed({
                input_text: formData.input_text,
                output_lang: formData.output_lang,
                output_text: result,
            });
        } catch (err) {
            console.error("Error processing action:", err);
            toast.error("Action failed.");
        } finally {
            setProcessing(false);
        }
    };

    if (!id || !type) return <p>Invalid link</p>;
    if (loading) return <p>Loading...</p>;
    if (error) return <p style={{ color: "red" }}>{error}</p>;
    if (!record) return <p>Record not found</p>;

    return (
        <div className="page-container">
            <button className="back-button" onClick={() => router.push("/history")}>
                <ArrowLeft size={20} />
            </button>
            <h1 className="page-title">
                {type.charAt(0).toUpperCase() + type.slice(1)} Details
            </h1>

            <div className="record-details">
                {/* Input */}
                <section className="section">
                    <div className="section-header">
                        <span>Input</span>

                        {/* Display input language (readonly dropdown style) */}
                        {mounted && (
                            <Select
                                options={languages.filter((opt) => opt.value !== "auto")}
                                value={languages.find((opt) => opt.value === formData.input_lang)}
                                isDisabled={true} // readonly
                                classNamePrefix="react-select"
                                className="flex-1"
                            />
                        )}
                    </div>
                    <textarea
                        className="text-area"
                        value={formData.input_text}
                        onChange={(e) =>
                            setFormData({ ...formData, input_text: e.target.value })
                        }
                    />
                </section>

                {/* Output */}
                <section className="section">
                    <div className="section-header">
                        <span>{type === "summary" ? "Summary" : "Translation"}</span>

                        {mounted &&
                            (type === "conversation" ||
                                type === "translation" ||
                                type === "summary") && (
                                <Select
                                    options={languages.filter((opt) => opt.value !== "auto")}
                                    value={languages.find(
                                        (opt) => opt.value === formData.output_lang
                                    )}
                                    onChange={(opt) =>
                                        setFormData({ ...formData, output_lang: opt.value })
                                    }
                                    classNamePrefix="react-select"
                                    className="flex-1"
                                />
                            )}

                        {/* Extra action button */}
                        {(type === "summary" || type === "conversation" || type === "translation") && (
                            <button
                                onClick={handleExtraAction}
                                disabled={actionDisabled}
                                title={actionDisabledReason}
                                className="button sectionhead"
                            >
                                {processing
                                    ? "Processing..."
                                    : type === "summary"
                                        ? "Resummarize"
                                        : "Retranslate"}
                            </button>
                        )}
                    </div>

                    <textarea
                        className="text-area"
                        value={formData.output_text}
                        onChange={(e) =>
                            setFormData({ ...formData, output_text: e.target.value })
                        }
                    />
                </section>

                {/* Meta info */}
                <div className="meta-info">
                    <p>
                        <strong>Created:</strong>{" "}
                        {formatDateTimeFromTimestamp(record.created_at)}
                    </p>
                    <p>
                        <strong>Last Updated:</strong>{" "}
                        {formatDateTimeFromTimestamp(record.updated_at)}
                    </p>
                </div>

                {/* Actions */}
                <div className="button-group">
                    {/* Download PDF Button */}
                    <button
                        className="button download-pdf-button"
                        onClick={handleDownload}
                        disabled={!formData.input_text || !formData.output_text || isDownloaded}
                    >
                        Download PDF
                    </button>
                    <button
                        onClick={handleUpdate}
                        disabled={saving || !isTextChanged || processing}
                        className="button save"
                    >
                        {saving ? "Saving..." : "Save Changes"}
                    </button>
                    <button onClick={handleDelete} className="button delete">
                        Delete {type}
                    </button>
                </div>
            </div>
        </div>
    );

}
