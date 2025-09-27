"use client";
import { useEffect, useState } from "react";
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
        alert("You must be logged in to view meetings.");
        return;
      }

      // 2. Fetch meetings from backend
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
        alert(data.detail || "Failed to fetch meetings.");
        return;
      }

      // 3. Filter meetings into ongoing, upcoming, and past
      const now = new Date();
      const ongoing = [];
      const upcoming = [];
      const past = [];

      for (const meeting of data) {
        const isHost = meeting.host_id === session.user.id;

        const meetingData = {
          ...meeting,
          isHost,
          hostName: meeting.host_name || "Unknown",
          formattedDate: formatDate(meeting.date),
          formattedStartTime: formatTime(meeting.start_time),
          formattedEndTime: formatTime(meeting.end_time),
        };

        meetingData.startAt = new Date(`${meeting.date}T${meeting.start_time}`);
        meetingData.endAt = new Date(`${meeting.date}T${meeting.end_time}`);

        const status = meeting.status?.toLowerCase();

        if (status === "past") {
          try {
            const res = await fetch(
              `${process.env.NEXT_PUBLIC_BACKEND_URL}/meetings/${meeting.id}/details`,
              {
                method: "GET",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${session?.access_token}`,
                },
              }
            );

            const details = await res.json();

            if (details.actual_start_time) {
              meetingData.startAt = new Date(details.actual_start_time);
              meetingData.formattedDate = formatPrettyDateFromTimestamp(details.actual_start_time);
              meetingData.formattedStartTime = formatTimeFromTimestamp(details.actual_start_time);
            }
            if (details.actual_end_time) {
              meetingData.endAt = new Date(details.actual_end_time);
              meetingData.formattedEndTime = formatTimeFromTimestamp(details.actual_end_time);
            }

          } catch (err) {
            console.error("Failed to fetch meeting details", err);
          }
          past.push(meetingData);
        }
        else if (status === "ongoing") {
          try {
            const res = await fetch(
              `${process.env.NEXT_PUBLIC_BACKEND_URL}/meetings/${meeting.id}/details`,
              {
                method: "GET",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${session?.access_token}`,
                },
              }
            );

            const details = await res.json();

            if (details.actual_start_time) {
              meetingData.startAt = new Date(details.actual_start_time);
              meetingData.formattedDate = formatPrettyDateFromTimestamp(details.actual_start_time);
              meetingData.formattedStartTime = formatTimeFromTimestamp(details.actual_start_time);
            }
            meetingData.endAt = "";
            meetingData.formattedEndTime = "";

          } catch (err) {
            console.error("Failed to fetch meeting details", err);
          }
          ongoing.push(meetingData);
        }
        else if (status === "upcoming") {
          upcoming.push(meetingData);
        }
      }

      ongoing.sort((a, b) => a.startAt - b.startAt);    // soonest start first
      upcoming.sort((a, b) => a.startAt - b.startAt);   // soonest start first
      past.sort((a, b) => b.endAt - a.endAt);           // most recent ended first


      // 4. Update state
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
        alert("You must be logged in to view meetings.");
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
                <div style={{ display: "flex", gap: "8px" }}>
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
                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    className="button view-btn meeting-button"
                    onClick={() =>
                      router.push(`/meeting/details?id=${meeting.id}`)
                    }
                  >
                    View
                  </button>
                </div>
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

