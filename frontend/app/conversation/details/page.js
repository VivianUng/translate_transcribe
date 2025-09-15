"use client";
import Select from "react-select";
import { useState, useEffect, useMemo } from "react";
import toast from 'react-hot-toast';
import { useSearchParams, useRouter } from "next/navigation";
import useAuthCheck from "@/hooks/useAuthCheck";
import { useLanguages } from "@/contexts/LanguagesContext";

export default function ConversationDetails() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const id = searchParams.get("id");
    const { session } = useAuthCheck({ redirectIfNotAuth: true, returnSession: true });
    const [mounted, setMounted] = useState(false);
    const [conversation, setConversation] = useState(null); // snapshot (last saved)
    const [formData, setFormData] = useState(null);        // editable copy
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [translating, setTranslating] = useState(false);
    const { languages } = useLanguages();
    const [error, setError] = useState(null);

    //  detect changes
    const isChanged = useMemo(() => {
        if (!conversation || !formData) return false;
        return JSON.stringify(formData) !== JSON.stringify(conversation);
    }, [conversation, formData]);

    // Fetch conversation by ID
    useEffect(() => {
        setMounted(true);
        if (!id) return;

        async function fetchConversation() {
            try {
                const token = session?.access_token;
                if (!token) return;

                const res = await fetch(
                    `${process.env.NEXT_PUBLIC_BACKEND_URL}/conversations/${id}`,
                    {
                        method: "GET",
                        headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${token}`,
                        },
                    }
                );

                if (res.status === 400) {
                    throw new Error("Invalid request. Please check the conversation ID.");
                }
                if (res.status === 401) {
                    throw new Error("Unauthorized. Please log in again.");
                }
                if (res.status === 403) {
                    throw new Error("You do not have permission to access this conversation.");
                }
                if (res.status === 404) {
                    throw new Error("Conversation not found.");
                }
                if (!res.ok) {
                    throw new Error("Failed to fetch conversation.");
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

                setConversation(normalized); // snapshot
                setFormData(normalized);     // editable copy
            } catch (err) {
                setError(err.message || "Error fetching conversation");
            } finally {
                setLoading(false);
            }
        }

        if (id && session) fetchConversation();
    }, [id, session]);

    // Update record
    const handleUpdate = async () => {
        if (!id || !formData) return;
        if (!formData.input_text) return toast.error("Input field cannot be empty.")
        setSaving(true);
        try {
            const res = await fetch(
                `${process.env.NEXT_PUBLIC_BACKEND_URL}/conversations/${id}`,
                {
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
                }
            );

            if (!res.ok) throw new Error("Failed to update conversation");

            const updated = await res.json();
            setConversation(updated); // reset snapshot
            setFormData(updated);     // sync editable
            toast.success("Conversation updated successfully!");
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
        if (!confirm("Are you sure you want to delete this conversation?")) return;

        try {
            const res = await fetch(
                `${process.env.NEXT_PUBLIC_BACKEND_URL}/conversations/${id}`,
                {
                    method: "DELETE",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${session?.access_token}`,
                    },
                }
            );

            if (!res.ok) throw new Error("Failed to delete conversation");

            toast.success("Conversation deleted.");
            router.push("/history");
        } catch (err) {
            console.error("Error deleting:", err);
            toast.error("Delete failed.");
        }
    };

    // Retranslate with selected target language
    const handleRetranslate = async () => {
        if (!formData?.input_text) return toast.error("No text to translate");
        setTranslating(true);
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/translate`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${session?.access_token}`,
                },
                body: JSON.stringify({
                    text: formData.input_text,
                    source_lang: formData.input_lang,
                    target_lang: formData.output_lang,
                }),
            });

            if (!res.ok) throw new Error("Translation failed");

            const result = await res.json();
            setFormData((prev) => ({
                ...prev,
                output_text: result.translated_text || "",
            }));
        } catch (err) {
            console.error("Error retranslating:", err);
            toast.error("Retranslation failed.");
        } finally {
            setTranslating(false);
        }
    };

    if (!id) return <p>Invalid conversation link.</p>;
    if (loading) return <p>Loading...</p>;
    if (error) return <p style={{ color: "red" }}>{error}</p>;
    if (!conversation) return <p>Conversation not found.</p>;

    return (
        <div className="page-container">
            <h1 className="page-title">Conversation Details</h1>

            <div className="conversation-details">
                {/* Original input text */}
                <section className="section">
                    <div className="section-header">
                        <span>Transcription</span>
                    </div>
                    <textarea
                        className="input-text-area"
                        value={formData.input_text}
                        onChange={(e) =>
                            setFormData({ ...formData, input_text: e.target.value })
                        }
                        rows={8}
                        placeholder="Edit transcription here..."
                    />
                </section>

                {/* Output / translation editable */}
                <section className="section">
                    <div className="section-header">
                        <span>Translation</span>
                        {mounted && (
                            <Select
                                options={languages.filter((opt) => opt.value !== "auto")}
                                value={languages.find(
                                    (opt) => opt.value === formData.output_lang
                                )}
                                onChange={(opt) =>
                                    setFormData({ ...formData, output_lang: opt.value })
                                }
                                className="flex-1"
                            />
                        )}
                        <button
                            onClick={handleRetranslate}
                            disabled={translating}
                            className="button secondary"
                        >
                            {translating ? "Translating..." : "Retranslate"}
                        </button>
                    </div>

                    <textarea
                        className="input-text-area"
                        value={formData.output_text}
                        onChange={(e) =>
                            setFormData({ ...formData, output_text: e.target.value })
                        }
                        rows={8}
                        placeholder="Edit translation here..."
                    />
                </section>

                {/* Meta details */}
                <div className="meta-info">
                    <p>
                        <strong>Created:</strong>{" "}
                        {new Date(conversation.created_at).toLocaleString("en-GB", {
                            dateStyle: "short",
                            timeStyle: "medium",
                        })}
                    </p>
                    <p>
                        <strong>Last Updated:</strong>{" "}
                        {new Date(conversation.updated_at).toLocaleString("en-GB", {
                            dateStyle: "short",
                            timeStyle: "medium",
                        })}
                    </p>
                </div>


                {/* Actions */}
                <div className="button-group">
                    <button
                        onClick={handleUpdate}
                        disabled={saving || !isChanged}
                        className="button save"
                    >
                        {saving ? "Saving..." : "Save Changes"}
                    </button>
                    <button onClick={handleDelete} className="button delete">
                        Delete Conversation
                    </button>
                </div>
            </div>
        </div>
    );
}