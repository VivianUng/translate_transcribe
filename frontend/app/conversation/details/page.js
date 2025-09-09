"use client";
import Select from "react-select";
import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import useAuthCheck from "@/hooks/useAuthCheck";
import { useLanguages } from "@/contexts/LanguagesContext";

export default function ConversationDetails() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const id = searchParams.get("id");
    const { session } = useAuthCheck({ redirectIfNotAuth: true, returnSession: true });
    const [mounted, setMounted] = useState(false);
    const [conversation, setConversation] = useState(null);
    const [loading, setLoading] = useState(true);
    const [editInputText, setEditInputText] = useState("");
    const [editOutputText, setEditOutputText] = useState("");
    const [inputLang, setInputLang] = useState("en");
    const [targetLang, setTargetLang] = useState("en"); // default English
    const [saving, setSaving] = useState(false);
    const [translating, setTranslating] = useState(false);
    const { languages, err } = useLanguages();
    const [error, setError] = useState(null);

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

                if (!res.ok) throw new Error("Failed to fetch conversation");

                const data = await res.json();
                setConversation(data);
                setEditInputText(data.input_text || "");
                setInputLang(data.input_lang || "en");
                setEditOutputText(data.output_text || "");
                setTargetLang(data.output_lang || "en");
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
        if (!id) return;
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
                        input_text: editInputText,
                        output_text: editOutputText,
                        output_lang: targetLang,
                    }),
                }
            );

            if (!res.ok) throw new Error("Failed to update conversation");

            const updated = await res.json();
            setConversation(updated);
            alert("Conversation updated successfully!");
        } catch (err) {
            console.error("Error updating:", err);
            alert("Update failed.");
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

            alert("Conversation deleted.");
            router.push("/conversation"); // back to conversation list
        } catch (err) {
            console.error("Error deleting:", err);
            alert("Delete failed.");
        }
    };

    // Retranslate with selected target language
    const handleRetranslate = async () => {
        if (!editInputText) return alert("No text to translate");
        setTranslating(true);
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/translate`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${session?.access_token}`,
                },
                body: JSON.stringify({
                    text: editInputText,
                    source_lang: inputLang,
                    target_lang: targetLang,
                }),
            });

            if (!res.ok) throw new Error("Translation failed");

            const result = await res.json();
            setEditOutputText(result.translated_text || "");
        } catch (err) {
            console.error("Error retranslating:", err);
            alert("Retranslation failed.");
        } finally {
            setTranslating(false);
        }
    };

    if (loading) return <p>Loading...</p>;
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
                        value={editInputText}
                        onChange={(e) => setEditInputText(e.target.value)}
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
                                value={languages.find((opt) => opt.value === targetLang)}
                                onChange={(opt) => setTargetLang(opt.value)}
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
                        value={editOutputText}
                        onChange={(e) => setEditOutputText(e.target.value)}
                        rows={8}
                        placeholder="Edit translation here..."
                    />
                </section>

                {/* Meta details */}
                <div className="meta-info">
                    <p>
                        <strong>Date:</strong>{" "}
                        {new Date(conversation.created_at).toLocaleDateString()}
                    </p>
                    <p>
                        <strong>Time:</strong>{" "}
                        {new Date(conversation.created_at).toLocaleTimeString()}
                    </p>
                </div>

                {/* Actions */}
                <div className="button-group">
                    <button
                        onClick={handleUpdate}
                        disabled={saving}
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