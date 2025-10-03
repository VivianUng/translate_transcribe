"use client";
import { useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { useRouter } from "next/navigation";
import useAuthCheck from "@/hooks/useAuthCheck";
import { formatDate, formatTime, formatPrettyDateFromTimestamp, formatTimeFromTimestamp } from "@/utils/dateTime";

export default function Meetings() {
  const router = useRouter();
  const { isLoggedIn, loading, session } = useAuthCheck({ redirectIfNotAuth: true, returnSession: true });
  const [meetings, setMeetings] = useState({ ongoing: [], upcoming: [], past: [] });
  const [fetching, setFetching] = useState(true);


  useEffect(() => {
    if (!loading && session) {
      fetchUserMeetings();
    }
  }, [loading, session]);


  const fetchUserMeetings = async () => {
    try {
      setFetching(true);

      const token = session?.access_token;
      if (!token) {
        toast.error("You must be logged in to view meetings.");
        return;
      }

      // Fetch all meetings (already includes actual_start_time / actual_end_time)
      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/meetings`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json();

      if (!res.ok) {
        console.error("Failed to fetch meetings:", data);
        toast.error(data.detail || "Failed to fetch meetings.");
        return;
      }

      const ongoing = [];
      const upcoming = [];
      const past = [];

      for (const meeting of data) {
        const isHost = meeting.host_id === session.user.id;

        // Prefer actual times if available
        const startTime = meeting.actual_start_time || `${meeting.date}T${meeting.start_time}`;
        const endTime = meeting.actual_end_time || (meeting.status?.toLowerCase() !== "ongoing" ? `${meeting.date}T${meeting.end_time}` : "");

        const meetingData = {
          ...meeting,
          isHost,
          hostName: meeting.host_name || "Unknown",
          formattedDate: meeting.actual_start_time
            ? formatPrettyDateFromTimestamp(meeting.actual_start_time)
            : formatDate(meeting.date),
          formattedStartTime: meeting.actual_start_time
            ? formatTimeFromTimestamp(meeting.actual_start_time)
            : formatTime(meeting.start_time),
          formattedEndTime: meeting.actual_end_time
            ? formatTimeFromTimestamp(meeting.actual_end_time)
            : formatTime(meeting.end_time),
          startAt: new Date(startTime),
          endAt: endTime ? new Date(endTime) : "",
        };

        const status = meeting.status?.toLowerCase();
        if (status === "past") past.push(meetingData);
        else if (status === "ongoing") ongoing.push(meetingData);
        else if (status === "upcoming") upcoming.push(meetingData);
      }

      // Sort meetings
      ongoing.sort((a, b) => a.startAt - b.startAt);
      upcoming.sort((a, b) => a.startAt - b.startAt);
      past.sort((a, b) => b.endAt - a.endAt);

      setMeetings({ ongoing, upcoming, past });
    } catch (err) {
      console.error("Failed to fetch meetings:", err);
    } finally {
      setFetching(false);
    }
  };

  const handleStartMeeting = async (meetingId) => {
    try {

      const token = session?.access_token;
      if (!token) {
        toast.error("You must be logged in to view meetings.");
        return;
      }
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/meetings/${meetingId}/status`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ status: "ongoing" }),
        }
      );

      if (!res.ok) {
        const errorData = await res.json();
        console.error("Failed to update meeting status:", errorData.detail || errorData);
        return;
      }

      // Redirect only after successful status update
      router.push(`/meeting/details?id=${meetingId}`);
    } catch (err) {
      console.error("Error starting meeting:", err);
    }
  };


  const MeetingSection = ({ title, meetingsList }) => {
    return (
      <section className="meetings-section">
        <div className={title === "Upcoming Meetings" ? "section-header" : ""}>
          <h3>{title}</h3>
          {title === "Upcoming Meetings" && (
            <button
              className="button create-btn"
              onClick={() => router.push("/meeting/form?mode=create")}
            >
              Create New <span aria-hidden="true">+</span>
            </button>
          )}
        </div>

        {meetingsList.length > 0 ? (
          meetingsList.map((meeting) => (
            <div key={meeting.id} className="meeting-card">
              <div className="meeting-info">
                <div className="meeting-name" title={meeting.name}>{meeting.name}</div>
                <div className="meeting-host">
                  {meeting.isHost ? "You are the host" : `Host: ${meeting.host_name || meeting.host_id}`}
                </div>
                <div className="meeting-time">
                  {meeting.formattedDate} {meeting.formattedStartTime} - {meeting.formattedEndTime}
                </div>
              </div>
              {title === "Upcoming Meetings" && meeting.isHost && (
                <div className="button-group" style={{ gap: "8px" }}>
                  <button
                    className="button update-btn meeting-button"
                    onClick={() => router.push(`/meeting/form?mode=update&id=${meeting.id}`)}
                  >
                    Update
                  </button>
                  <button
                    className="button start-btn meeting-button"
                    onClick={() => handleStartMeeting(meeting.id)}>
                    Start Meeting
                  </button>
                </div>
              )}

              {/* "Join Meeting" button only for ongoing meetings */}
              {title === "Ongoing Meetings" && (
                <button
                  className="button join-btn meeting-button"
                  onClick={() => router.push(`/meeting/details?id=${meeting.id}`)}
                >
                  Join Meeting
                </button>
              )}

              {/* === Past Meetings buttons === */}
              {title === "Past Meetings" && (
                <button
                  className="button view-btn meeting-button"
                  onClick={() =>
                    router.push(`/meeting/details?id=${meeting.id}`)
                  }
                >
                  View
                </button>
              )}

            </div>
          ))
        ) : (
          <p>No {title.toLowerCase()}.</p>
        )}
      </section>
    );
  };

  if (fetching) return <p>Loading...</p>;

  return (
    <div className="page-container">
      <h1 className="page-title">Meetings</h1>

      <MeetingSection title="Ongoing Meetings" meetingsList={meetings.ongoing} />
      <MeetingSection title="Upcoming Meetings" meetingsList={meetings.upcoming} />
      <MeetingSection title="Past Meetings" meetingsList={meetings.past} />

    </div>
  );
};

