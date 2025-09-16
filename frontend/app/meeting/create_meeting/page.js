"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import useAuthCheck from "@/hooks/useAuthCheck";

export default function CreateMeetingPage() {
    const router = useRouter();
    const { isLoggedIn, loading, session } = useAuthCheck({ redirectIfNotAuth: true, returnSession: true });

    const [startTime, setStartTime] = useState("");
    const [endTime, setEndTime] = useState("");

    const [participants, setParticipants] = useState([]);
    const [emailInput, setEmailInput] = useState("");

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/; // email check
    const isValidEmail = emailRegex.test(emailInput);

    const handleStartChange = (e) => {
        const value = e.target.value;
        setStartTime(value);

        // If new start is after current end → reset end
        if (endTime && value >= endTime) {
            setEndTime("");
        }
    };

    const handleEndChange = (e) => {
        const value = e.target.value;
        // Only allow if end > start
        if (!startTime || value > startTime) {
            setEndTime(value);
        }
    };

    const addParticipant = () => {
        if (emailInput && !participants.includes(emailInput)) {
            setParticipants([...participants, emailInput]);
            setEmailInput("");
        }
    };

    const removeParticipant = (email) => {
        setParticipants(participants.filter((p) => p !== email));
    };


    if (loading) return <p>Loading...</p>;

    return (
        <div className="page-container">
            {/* Back Button */}
            <button className="back-button" onClick={() => router.push("/meeting")}>
                ← Back to Meetings
            </button>
            <h1 className="page-title">Create a New Meeting</h1>

            <form className="section">
                {/* Meeting Details */}
                <h3 className="input-label">Meeting Name</h3>
                <input
                    className="input-field"
                    type="text"
                    placeholder="Enter meeting name"
                />
                <hr className="divider" />

                {/* Date & Time */}
                <div className="date-time-grid">
                    <div >
                        <h3 className="input-label">Date</h3>
                        <input
                            className="input-field"
                            type="date"
                            min={new Date().toISOString().split("T")[0]} // today or later
                        />
                    </div>

                    <div>
                        <h3 className="input-label">Start Time</h3>
                        <input
                            className="input-field"
                            type="time"
                            value={startTime}
                            onChange={handleStartChange}
                        />
                    </div>

                    <div >
                        <h3 className="input-label">End Time</h3>
                        <input
                            className="input-field"
                            type="time"
                            value={endTime}
                            min={startTime || undefined}
                            onChange={handleEndChange}
                        />
                    </div>
                </div>
                <hr className="divider" />

                {/* Participants */}
                <h3 className="input-label">Participants</h3>
                <div className="participant-input">
                    <input
                        className="input-field"
                        type="email"
                        value={emailInput}
                        onChange={(e) => setEmailInput(e.target.value)}
                        placeholder="Add participant email"
                    />
                    <button
                        type="button"
                        className="add-button"
                        onClick={addParticipant}
                        disabled={!isValidEmail}
                    >
                        Add
                    </button>
                </div>

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
                <button type="submit" className="button primary">
                    Create Meeting
                </button>
            </form>
        </div>

    );
};

