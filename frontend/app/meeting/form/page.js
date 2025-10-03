"use client";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { toast } from "react-hot-toast";
import { useRouter, useSearchParams } from "next/navigation";
import useAuthCheck from "@/hooks/useAuthCheck";

export default function MeetingFormPage() {
    const router = useRouter();
    const searchParams = useSearchParams();

    const mode = searchParams.get("mode"); // "create" or "update"
    const meetingId = searchParams.get("id"); // undefined if creating

    const { loading, session } = useAuthCheck({ redirectIfNotAuth: true, returnSession: true });

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

    // Store initial meeting state to detect changes
    const [initialMeeting, setInitialMeeting] = useState(null);

    // Fetch existing meeting data if in update mode
    useEffect(() => {

        if (!mode || (mode !== "create" && mode !== "update") || (mode === "update" && !meetingId)) {
            // meetingId missing → redirect immediately
            router.push("/meeting?toast=pageNotFound");
            return;
        }

        if (mode === "update" && meetingId && session) {
            const fetchMeeting = async () => {
                try {
                    const token = session.access_token;
                    const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/meetings/${meetingId}`, {
                        headers: { Authorization: `Bearer ${token}` },
                    });

                    if (!res) {
                        throw new Error("Failed to fetch meeting.");
                    }

                    const result = await res.json();

                    const m = result.meeting;

                    if (!m) {
                        router.push("/meeting?toast=notFound");
                        return;
                    }

                    // Check if logged-in user is the host
                    if (m.host_id !== session.user.id) {
                        router.push("/meeting?toast=notAuthenticated");
                        return;
                    }

                    const formatTime = (timeStr) => {
                        if (!timeStr) return "";
                        if (timeStr.includes("T")) return timeStr.split("T")[1].slice(0, 5);
                        return timeStr.slice(0, 5);
                    };

                    setMeetingName(m.name || "");
                    setDate(m.date || "");
                    setStartTime(formatTime(m.start_time));
                    setEndTime(formatTime(m.end_time));
                    setParticipants(result.participants || []);
                    setInitialMeeting({
                        name: m.name || "",
                        date: m.date || "",
                        startTime: formatTime(m.start_time),
                        endTime: formatTime(m.end_time),
                        participants: result.participants || [],
                    });
                    setFormErrors({});
                } catch (err) {
                    console.error(err);
                    router.push("/meeting?toast=notFound");
                    return;
                }
            };

            fetchMeeting();
        }
    }, [mode, meetingId, session]);

    // Determine if form has changes
    const isChanged =
        mode === "create"
            ? true
            : !initialMeeting ||
            meetingName !== initialMeeting.name ||
            date !== initialMeeting.date ||
            startTime !== initialMeeting.startTime ||
            endTime !== initialMeeting.endTime ||
            participants.join(",") !== initialMeeting.participants.join(",");

    // Delete handler
    const handleDelete = async () => {
        if (!confirm("Are you sure you want to delete this meeting? This cannot be undone.")) return;

        try {
            const token = session.access_token;
            const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/meetings/${meetingId}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` },
            });

            const result = await res.json();
            if (!res.ok) throw new Error(result.detail || "Failed to delete meeting.");

            router.push("/meeting?toast=deleteMeetingSuccess");
        } catch (err) {
            console.error(err);
            toast.error(err.message || "Failed to delete meeting.");
        }
    };


    // Time input handlers
    const handleStartChange = (e) => {
        const value = e.target.value;
        setFormErrors((prev) => ({ ...prev, start: "" }));
        setStartTime(value);
        if (endTime && value >= endTime) setEndTime("");
    };

    const handleEndChange = (e) => {
        const value = e.target.value;
        setFormErrors((prev) => ({ ...prev, end: "" }));
        if (!startTime || value > startTime) setEndTime(value);
    };



    // Participant handlers
    const addParticipant = async () => {
        const errors = {};
        if (!emailInput.trim()) errors.participants = "Please enter an email address.";
        else if (!emailRegex.test(emailInput)) errors.participants = "Please enter a valid email address.";
        else if (participants.includes(emailInput)) errors.participants = "This participant has already been added.";

        if (Object.keys(errors).length > 0) {
            setFormErrors((prev) => ({ ...prev, ...errors }));
            return;
        }

        try {
            const token = session.access_token;
            const res = await fetch(
                `${process.env.NEXT_PUBLIC_BACKEND_URL}/email_exists/?email=${encodeURIComponent(emailInput)}`,
                {
                    method: "GET",
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                }
            );

            if (!res.ok) {
                throw new Error("Failed to check email");
            }

            const data = await res.json();

            if (data.exists) {
                setParticipants([...participants, emailInput]);
                setEmailInput("");
                setFormErrors((prev) => ({ ...prev, participants: "" }));
            } else {
                setFormErrors((prev) => ({ ...prev, participants: "This email is not registered." }));
            }
        } catch (error) {
            console.error(error);
            setFormErrors((prev) => ({ ...prev, participants: "Error checking email. Please try again." }));
        }

    };

    const removeParticipant = (email) => {
        setParticipants(participants.filter((p) => p !== email));
    };

    // Submit handler (create or update)
    const handleSubmit = async () => {
        const errors = {};
        if (!meetingName.trim()) errors.name = "Meeting name is required.";
        if (!date) {
            errors.date = "Date is required.";
        } else {
            // Validate date is not in the past
            const today = new Date();
            today.setHours(0, 0, 0, 0); // normalize to midnight
            const selected = new Date(date);
            selected.setHours(0, 0, 0, 0);

            if (selected < today) {
                errors.date = "Date cannot be earlier than today.";
            }
        }
        if (!startTime) errors.start = "Start time is required.";
        if (!endTime) errors.end = "End time is required.";
        if (startTime && endTime && startTime >= endTime) {
            errors.end = "End time must be later than start time.";
        }
        setFormErrors(errors);
        if (Object.keys(errors).length > 0) return;

        try {
            setIsSubmitting(true);
            const token = session?.access_token;
            if (!token) {
                toast.error("You must be logged in.");
                return;
            }

            const hostEmail = session?.user?.email;
            const finalParticipants = participants.includes(hostEmail) ? participants : [...participants, hostEmail];

            const url =
                mode === "create"
                    ? `${process.env.NEXT_PUBLIC_BACKEND_URL}/create-meeting`
                    : `${process.env.NEXT_PUBLIC_BACKEND_URL}/meetings/${meetingId}`;
            const method = mode === "create" ? "POST" : "PUT";

            const res = await fetch(url, {
                method,
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    meeting_name: meetingName,
                    date,
                    start_time: startTime,
                    end_time: endTime,
                    participants: finalParticipants,
                }),
            });

            const result = await res.json();
            if (!res.ok) throw new Error(result.detail || `Failed to ${mode} meeting.`);

            if (mode === "create") {
                router.push(`/meeting?toast=createMeetingSuccess`);
            } else if (mode === "update") {
                toast.success("Meeting updated successfully!");
                // Reset initialMeeting to the updated values
                setInitialMeeting({
                    name: meetingName || "",
                    date: date || "",
                    startTime: startTime || "",
                    endTime: endTime || "",
                    participants: finalParticipants || [],
                });
            }
        } catch (err) {
            console.error(err);
            toast.error(err.message || "Something went wrong.");
        } finally {
            setIsSubmitting(false);
        }
    };

    if (loading) return <p>Loading...</p>;

    return (
        <div className="page-container">
            <button className="back-button" onClick={() => router.push("/meeting")}>
                <ArrowLeft size={20} />
            </button>
            <h1 className="page-title">{mode === "create" ? "Create Meeting" : "Update Meeting"}</h1>

            <div className="section">
                {/* Meeting Name */}
                <label className="input-label">Meeting Name</label>
                <input
                    className={`input-field ${formErrors.name ? "input-error" : ""}`}
                    type="text"
                    value={meetingName}
                    maxLength={100}
                    onChange={(e) => {
                        setMeetingName(e.target.value);
                        setFormErrors((prev) => ({ ...prev, name: "" }));
                    }}
                />
                {formErrors.name && <p className="error-message">{formErrors.name}</p>}
                <hr className="divider" />

                {/* Date & Time */}
                <div className="date-time-grid">
                    <div>
                        <label className="input-label">Date</label>
                        <input
                            className={`input-field ${formErrors.date ? "input-error" : ""}`}
                            type="date"
                            min={new Date().toLocaleDateString("en-CA")}
                            value={date}
                            onChange={(e) => {
                                setDate(e.target.value);
                                setFormErrors((prev) => ({ ...prev, date: "" }));
                            }}
                        />
                        {formErrors.date && <p className="error-message">{formErrors.date}</p>}
                    </div>

                    <div>
                        <label className="input-label">Start Time</label>
                        <input
                            className={`input-field ${formErrors.start ? "input-error" : ""}`}
                            type="time"
                            value={startTime}
                            onChange={handleStartChange}
                        />
                        {formErrors.start && <p className="error-message">{formErrors.start}</p>}
                    </div>

                    <div>
                        <label className="input-label">End Time</label>
                        <input
                            className={`input-field ${formErrors.end ? "input-error" : ""}`}
                            type="time"
                            min={startTime || undefined}
                            value={endTime}
                            onChange={handleEndChange}
                        />
                        {formErrors.end && <p className="error-message">{formErrors.end}</p>}
                    </div>
                </div>
                <hr className="divider" />

                {/* Participants */}
                <label className="input-label">Participants</label>
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
                    <button type="button" className="button add-button" onClick={addParticipant} disabled={!emailInput || !isValidEmail}>
                        Add
                    </button>
                </div>
                {formErrors.participants && <p className="error-message">{formErrors.participants}</p>}

                {participants.length > 0 && (
                    <div className="participants-list">
                        {participants.map((p) => (
                            <span key={p} className="participant-tag">
                                {p}
                                <button type="button" className="remove-participant" onClick={() => removeParticipant(p)}>
                                    ×
                                </button>
                            </span>
                        ))}
                    </div>
                )}
                <hr className="divider" />
                <div className="button-group">
                    {/* Submit Button */}
                    <button
                        type="button"
                        className="button"
                        onClick={handleSubmit}
                        disabled={isSubmitting || !isChanged}
                    >
                        {isSubmitting ? (mode === "create" ? "Creating..." : "Updating...") : mode === "create" ? "Create Meeting" : "Update Meeting"}
                    </button>

                    {/* Delete Button - only in update mode */}
                    {mode === "update" && (
                        <button
                            type="button"
                            className="button delete"
                            onClick={handleDelete}
                            disabled={isSubmitting}
                        >
                            Delete Meeting
                        </button>
                    )}
                </div>

            </div>
        </div>
    );
}
