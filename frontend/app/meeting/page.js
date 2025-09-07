"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from '../../lib/supabaseClient';

// dummy data
const meetingsData = {
  ongoing: [
    {
      id: 1,
      name: 'Meeting Name',
      host: 'Host Name',
      time: '10:00am, June 12',
    },
  ],
  upcoming: [
    {
      id: 2,
      name: 'Meeting Name',
      host: 'You are the host',
      time: '09:00am, June 21',
      isHost: true,
    },
    {
      id: 3,
      name: 'Meeting Name',
      host: 'Host Name',
      time: '09:00am, June 21',
    },
    {
      id: 4,
      name: 'Meeting Name',
      host: 'Host Name',
      time: '09:00am, June 21',
    },
    {
      id: 5,
      name: 'Meeting Name',
      host: 'Host Name',
      time: '09:00am, June 21',
    },
    {
      id: 6,
      name: 'Meeting Name',
      host: 'Host Name',
      time: '09:00am, June 21',
    },
  ],
  past: [
    {
      id: 5,
      name: 'Meeting Name',
      host: 'Host Name',
      time: '09:00am, June 21',
    },
  ],
};

export default function Meetings() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkAuth() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push("/login?toast=notAuthenticated");
      } else {
        setLoading(false);
      }
    }
    checkAuth();
  }, [router]);

  if (loading) return <p>Loading...</p>;

  return (
    <div className="page-container">
      <h1 className="page-title">Meetings</h1>

      {/* Ongoing Meetings */}
      <section className="meetings-section">
        <h3>Ongoing Meetings</h3>
        {meetingsData.ongoing.map((meeting) => (
          <div key={meeting.id} className="meeting-card">
            <div className="meeting-name">{meeting.name}</div>
            <div className="meeting-host">{meeting.host}</div>
            <div className="meeting-time">{meeting.time}</div>
          </div>
        ))}
      </section>

      {/* Upcoming Meetings */}
      <section className="meetings-section">
        <div className='section-header'>
          <h3>Upcoming Meetings</h3>
          <button className="button create-btn">
            Create New <span aria-hidden="true">+</span>
          </button>
        </div>
          
        {meetingsData.upcoming.map((meeting) => (
          <div key={meeting.id} className="meeting-card">
            <div>
              <div className="meeting-name">{meeting.name}</div>
              <div className="meeting-host">{meeting.host}</div>
              <div className="meeting-time">{meeting.time}</div>
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
        {meetingsData.past.map((meeting) => (
          <div key={meeting.id} className="meeting-card">
            <div className="meeting-name">{meeting.name}</div>
            <div className="meeting-host">{meeting.host}</div>
            <div className="meeting-time">{meeting.time}</div>
          </div>
        ))}
      </section>
    </div>
  );
};

