"use client";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import useAuthCheck from "@/hooks/useAuthCheck";
import { supabase } from "@/lib/supabaseClient";

export default function CreateMeetingPage() {
    const router = useRouter();
    const { loading, session } = useAuthCheck({
        redirectIfNotAuth: true,
        returnSession: true,
    });

    const [meetingName, setMeetingName] = useState("");
    const [date, setDate] = useState("");
    const [startTime, setStartTime] = useState("");
    const [endTime, setEndTime] = useState("");
    const [participants, setParticipants] = useState([]);
    const [emailInput, setEmailInput] = useState("");

    const [formErrors, setFormErrors] = useState({});
    const [isSubmitting, setIsSubmitting] = useState(false);

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const isValidEmail = emailRegex.test(emailInput);

    const handleStartChange = (e) => {
        const value = e.target.value;
        setFormErrors((prev) => ({ ...prev, start: "" }));
        setStartTime(value);
        if (endTime && value >= endTime) {
            setEndTime("");
        }
    };

    const handleEndChange = (e) => {
        const value = e.target.value;
        setFormErrors((prev) => ({ ...prev, end: "" }));
        if (!startTime || value > startTime) {
            setEndTime(value);
        }
    };

    const addParticipant = async () => {
        const errors = {};
        if (!emailInput.trim()) {
            errors.participants = "Please enter an email address.";
        } else if (!emailRegex.test(emailInput)) {
            errors.participants = "Please enter a valid email address.";
        } else if (participants.includes(emailInput)) {
            errors.participants = "This participant has already been added.";
        }

        if (Object.keys(errors).length > 0) {
            setFormErrors((prev) => ({ ...prev, ...errors }));
            return;
        }

        const { data, error } = await supabase.rpc("email_exists", {
            check_email: emailInput,
        });

        if (error) {
            console.error(error);
            setFormErrors((prev) => ({
                ...prev,
                participants: "Error checking email. Please try again.",
            }));
            return;
        }

        if (data) {
            setParticipants([...participants, emailInput]);
            setEmailInput("");
            setFormErrors((prev) => ({ ...prev, participants: "" }));
        } else {
            setFormErrors((prev) => ({
                ...prev,
                participants: "This email is not registered.",
            }));
        }
    };

    const removeParticipant = (email) => {
        setParticipants(participants.filter((p) => p !== email));
    };

    const handleCreateMeeting = async () => {
        const errors = {};

        if (!meetingName.trim()) errors.name = "Meeting name is required.";
        if (!date) errors.date = "Date is required.";
        if (!startTime) errors.start = "Start time is required.";
        if (!endTime) errors.end = "End time is required.";
        if (participants.length === 0)
            errors.participants = "At least one participant is required.";

        setFormErrors(errors);

        if (Object.keys(errors).length > 0) return;

        try {
            setIsSubmitting(true);

            const token = session?.access_token;
            if (!token) {
                alert("You must be logged in to create a meeting.");
                return;
            }

            const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/create-meeting`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`,
                },
                body: JSON.stringify({
                    meeting_name: meetingName,
                    date,
                    start_time: startTime,
                    end_time: endTime,
                    participants, // array of emails
                })
            });

            const result = await res.json();
            if (!res.ok) throw new Error(result.meeting || "Failed to create meeting.");

            console.log("Created meeting:", result.meeting);


            router.push("/meeting?toast=createMeetingSuccess");
        } catch (err) {
            console.error(err);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (loading) return <p>Loading...</p>;

    return (
        <div className="page-container">
            {/* Back Button */}
            <button className="back-button" onClick={() => router.push("/meeting")}>
                <ArrowLeft size={20} />
            </button>
            <h1 className="page-title">Create a New Meeting</h1>

            <div className="section">
                {/* Meeting Details */}
                <h3 className="input-label">Meeting Name</h3>
                <input
                    className={`input-field ${formErrors.name ? "input-error" : ""}`}
                    type="text"
                    value={meetingName}
                    onChange={(e) => {
                        setMeetingName(e.target.value);
                        setFormErrors((prev) => ({ ...prev, name: "" }));
                    }}
                    placeholder="Enter meeting name"
                />
                {formErrors.name && <p className="error-message">{formErrors.name}</p>}
                <hr className="divider" />

                {/* Date & Time */}
                <div className="date-time-grid">
                    <div>
                        <h3 className="input-label">Date</h3>
                        <input
                            className={`input-field ${formErrors.date ? "input-error" : ""}`}
                            type="date"
                            min={new Date().toISOString().split("T")[0]}
                            value={date}
                            onChange={(e) => {
                                setDate(e.target.value);
                                setFormErrors((prev) => ({ ...prev, date: "" }));
                            }}
                        />
                        {formErrors.date && (
                            <p className="error-message">{formErrors.date}</p>
                        )}
                    </div>

                    <div>
                        <h3 className="input-label">Start Time</h3>
                        <input
                            className={`input-field ${formErrors.start ? "input-error" : ""}`}
                            type="time"
                            value={startTime}
                            onChange={handleStartChange}
                        />
                        {formErrors.start && (
                            <p className="error-message">{formErrors.start}</p>
                        )}
                    </div>

                    <div>
                        <h3 className="input-label">End Time</h3>
                        <input
                            className={`input-field ${formErrors.end ? "input-error" : ""}`}
                            type="time"
                            value={endTime}
                            min={startTime || undefined}
                            onChange={handleEndChange}
                        />
                        {formErrors.end && <p className="error-message">{formErrors.end}</p>}
                    </div>
                </div>
                <hr className="divider" />

                {/* Participants */}
                <h3 className="input-label">Participants</h3>
                <div className="participant-input">
                    <input
                        className={`input-field ${formErrors.participants ? "input-error" : ""}`}
                        type="text"
                        value={emailInput}
                        onChange={(e) => {
                            setEmailInput(e.target.value);
                            setFormErrors((prev) => ({ ...prev, participants: "" }));
                        }}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                e.preventDefault();
                                addParticipant();
                            }
                        }}
                        placeholder="Add participant email"
                    />
                    <button
                        type="button"
                        className="add-button"
                        onClick={addParticipant}
                        disabled={!emailInput || !isValidEmail}
                    >
                        Add
                    </button>
                </div>
                {formErrors.participants && (
                    <p className="error-message">{formErrors.participants}</p>
                )}

                {participants.length > 0 && (
                    <div className="participants-list">
                        {participants.map((p) => (
                            <span key={p} className="participant-tag">
                                {p}
                                <button
                                    type="button"
                                    className="remove-participant"
                                    onClick={() => removeParticipant(p)}
                                >
                                    ×
                                </button>
                            </span>
                        ))}
                    </div>
                )}
                <hr className="divider" />

                {/* Submit */}
                <button
                    type="button"
                    className="button"
                    onClick={handleCreateMeeting}
                    disabled={isSubmitting}
                >
                    {isSubmitting ? "Creating..." : "Create Meeting"}
                </button>
            </div>
        </div>
    );
}