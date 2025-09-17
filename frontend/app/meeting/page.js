"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import useAuthCheck from "@/hooks/useAuthCheck";

// dummy data
// const meetingsData = {
//   ongoing: [
//     {
//       id: 1,
//       name: 'Meeting Name',
//       host: 'Host Name',
//       time: '10:00am, June 12',
//     },
//   ],
//   upcoming: [
//     {
//       id: 2,
//       name: 'Meeting Name',
//       host: 'You are the host',
//       time: '09:00am, June 21',
//       isHost: true,
//     },
//     {
//       id: 3,
//       name: 'Meeting Name',
//       host: 'Host Name',
//       time: '09:00am, June 21',
//     },
//     {
//       id: 4,
//       name: 'Meeting Name',
//       host: 'Host Name',
//       time: '09:00am, June 21',
//     },
//     {
//       id: 5,
//       name: 'Meeting Name',
//       host: 'Host Name',
//       time: '09:00am, June 21',
//     },
//     {
//       id: 6,
//       name: 'Meeting Name',
//       host: 'Host Name',
//       time: '09:00am, June 21',
//     },
//   ],
//   past: [
//     {
//       id: 5,
//       name: 'Meeting Name',
//       host: 'Host Name',
//       time: '09:00am, June 21',
//     },
//   ],
// };

export default function Meetings() {
  const router = useRouter();
  const { isLoggedIn, loading, session } = useAuthCheck({ redirectIfNotAuth: true, returnSession: true });
  const [mounted, setMounted] = useState(false);
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

      if (!Array.isArray(data)) {
        console.warn("Expected an array from /meetings, got:", data);
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

        const meetingData = {
          ...meeting,
          isHost,
          hostName: meeting.host_name || "Unknown",
          formattedDate: meetingStart.toLocaleDateString(undefined, {
            weekday: "short",
            year: "numeric",
            month: "short",
            day: "numeric",
          }),
          formattedStartTime: meetingStart.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          formattedEndTime: meetingEnd.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        };

        if (meetingStart < new Date()) past.push(meetingData);
        else if (meetingStart.toDateString() === new Date().toDateString()) ongoing.push(meetingData);
        else upcoming.push(meetingData);
      });


      // 4. Update state
      setMeetings({ ongoing, upcoming, past });
    } catch (err) {
      console.error("Failed to fetch meetings:", err);
    } finally {
      setFetching(false);
    }
  };


  if (loading) return <p>Loading...</p>;

  return (
    <div className="page-container">
      <h1 className="page-title">Meetings</h1>

      {/* Ongoing Meetings */}
      <section className="meetings-section">
        <h3>Ongoing Meetings</h3>
        {meetings.ongoing.map((meeting) => (
          <div key={meeting.id} className="meeting-card">
            <div className="meeting-name">{meeting.name}</div>
            <div className="meeting-host">Host: {meeting.host_name || meeting.host_id}</div>
            <div className="meeting-time">
              {meeting.formattedDate} {meeting.formattedStartTime} - {meeting.formattedEndTime}
            </div>
          </div>
        ))}
      </section>

      {/* Upcoming Meetings */}
      <section className="meetings-section">
        <div className='section-header'>
          <h3>Upcoming Meetings</h3>
          <button
            className="button create-btn"
            onClick={() => router.push("/meeting/create_meeting")}
          >
            Create New <span aria-hidden="true">+</span>
          </button>
        </div>

        {meetings.upcoming.map((meeting) => (
          <div key={meeting.id} className="meeting-card">
            <div>
              <div className="meeting-name">{meeting.name}</div>
              <div className="meeting-host">Host: {meeting.host_name || meeting.host_id}</div>
              <div className="meeting-time">
                {meeting.formattedDate} {meeting.formattedStartTime} - {meeting.formattedEndTime}
              </div>

            </div>
            {meeting.isHost && (
              <button className="button start-btn">Start Meeting</button>
            )}
          </div>
        ))}
      </section>

      {/* Past Meetings */}
      <section className="meetings-section">
        <h3>Past Meetings</h3>
        {meetings.past.map((meeting) => (
          <div key={meeting.id} className="meeting-card">
            <div className="meeting-name">{meeting.name}</div>
            <div className="meeting-host">Host: {meeting.host_name || meeting.host_id}</div>
            <div className="meeting-time">
              {meeting.formattedDate} {meeting.formattedStartTime} - {meeting.formattedEndTime}
            </div>

          </div>
        ))}
      </section>
    </div>
  );
};

