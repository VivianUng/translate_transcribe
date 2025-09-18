"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import useAuthCheck from "@/hooks/useAuthCheck";

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

      // 1. Get Supabase JWT token
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

      data.forEach((meeting) => {
        // Split date
        const [year, month, day] = meeting.date.split("-").map(Number);

        // Split start and end time (ignore timezone offset for local display)
        const [startHour, startMinute, startSecond] = meeting.start_time.split(":").map(Number);
        const [endHour, endMinute, endSecond] = meeting.end_time.split(":").map(Number);

        // Construct Date objects (month is 0-indexed)
        const meetingStart = new Date(year, month - 1, day, startHour, startMinute, startSecond || 0);
        const meetingEnd = new Date(year, month - 1, day, endHour, endMinute, endSecond || 0);

        const isHost = meeting.host_id === session.user.id;
        const now = new Date();
        const meetingData = {
          ...meeting,
          isHost,
          hostName: meeting.host_name || "Unknown",
          meetingStart,
          meetingEnd,
          formattedDate: meetingStart.toLocaleDateString(undefined, {
            weekday: "short",
            year: "numeric",
            month: "short",
            day: "numeric",
          }),
          formattedStartTime: meetingStart.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          formattedEndTime: meetingEnd.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        };

        if (meetingEnd < now) {
          // Meeting ended in the past
          past.push(meetingData);
        } else if (meetingStart <= now && now <= meetingEnd) {
          // Meeting is currently ongoing
          ongoing.push(meetingData);
        } else {
          // Meeting is in the future
          upcoming.push(meetingData);
        }
      });

      ongoing.sort((a, b) => b.meetingStart - a.meetingStart);  // most recent first
      upcoming.sort((a, b) => a.meetingStart - b.meetingStart); // soonest first
      past.sort((a, b) => b.meetingEnd - a.meetingEnd);         // most recent past first


      // 4. Update state
      setMeetings({ ongoing, upcoming, past });
    } catch (err) {
      console.error("Failed to fetch meetings:", err);
    } finally {
      setFetching(false);
    }
  };

  const MeetingSection = ({ title, meetingsList, showButtons = false }) => {
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
              {showButtons && meeting.isHost && (
                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    className="button update-btn meeting-button"
                    onClick={() => router.push(`/meeting/form?mode=update&id=${meeting.id}`)}
                  >
                    Update
                  </button>
                  <button
                    className="button start-btn meeting-button"
                    onClick={() => router.push(`/meeting/ongoing_meeting`)}>
                    Start Meeting
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
      <MeetingSection title="Upcoming Meetings" meetingsList={meetings.upcoming} showButtons />
      <MeetingSection title="Past Meetings" meetingsList={meetings.past} />

    </div>
  );
};

