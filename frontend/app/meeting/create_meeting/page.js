"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import useAuthCheck from "@/hooks/useAuthCheck";

export default function CreateMeetingPage() {
    const router = useRouter();
    const { isLoggedIn, loading, session } = useAuthCheck({ redirectIfNotAuth: true, returnSession: true });
    const [mounted, setMounted] = useState(false);

    const [participants, setParticipants] = useState([]);
    const [emailInput, setEmailInput] = useState("");

    const addParticipant = () => {
        if (emailInput && !participants.includes(emailInput)) {
            setParticipants([...participants, emailInput]);
            setEmailInput("");
        }
    };

    const removeParticipant = (email) => {
        setParticipants(participants.filter((p) => p !== email));
    };

    useEffect(() => {
        setMounted(true); // for react-select component
    },);

    if (loading) return <p>Loading...</p>;

    return (
        <div className="page-container">
            <h1 className="page-title">Meetings</h1>

            <form className="create-meeting-form">
                {/* Meeting Name */}
                <div className="create-meeting-form-group">
                    <label className="input-label">Meeting Name</label>
                    <input className="input-field" type="text" placeholder="Enter meeting name" />
                </div>

                {/* Date & Time */}
                <div className="date-time-grid">
                    <div className="create-meeting-form-group">
                        <label className="input-label">Date</label>
                        <input className="input-field" type="date" />
                    </div>
                    <div className="create-meeting-form-group">
                        <label className="input-label">Start Time</label>
                        <input className="input-field" type="time" />
                    </div>
                    <div className="create-meeting-form-group">
                        <label className="input-label">End Time</label>
                        <input className="input-field" type="time" />
                    </div>
                </div>

                {/* Participants */}
                <div className="create-meeting-form-group">
                    <label className="input-label">Participants (Emails)</label>
                    <div className="participant-input">
                        <input
                            className="input-field"
                            type="email"
                            value={emailInput}
                            onChange={(e) => setEmailInput(e.target.value)}
                            placeholder="Add participant email"
                        />
                        <button type="button" className="add-button" onClick={addParticipant}>
                            Add
                        </button>
                    </div>
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
                </div>

                {/* Submit */}
                <div className="create-meeting-form-actions">
                    <button type="submit" className="button">
                        Create Meeting
                    </button>
                </div>
            </form>
        </div>
    );
};

