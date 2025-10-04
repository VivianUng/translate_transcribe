/**
 * Format a database date (YYYY-MM-DD) into a human-readable string
 * Example: "2025-09-24" → "Wed, Sep 24, 2025"
 */
export const formatDate = (dateStr) => {
  if (!dateStr) return "";

  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  return date.toLocaleDateString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

/**
 * Format a database time (HH:MM:SS) into local time
 * Example: "13:45:00" → "1:45 PM"
 */
export const formatTime = (timeStr) => {
  if (!timeStr) return "";

  const [hour, minute, second] = timeStr.split(":").map(Number);

  const now = new Date();
  const date = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    hour,
    minute,
    second || 0
  );

  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

/**
 * Format a full timestamp into en-GB date (DD/MM/YYYY)
 * Example: "2025-09-24T13:45:30.000Z" → "24/09/2025"
 */
export const formatDateFromTimestamp = (timestamp) => {
  if (!timestamp) return "";
  return new Date(timestamp).toLocaleDateString("en-GB");
};

/**
 * Format a full timestamp into a human-readable string
 * Example: "2025-09-24T13:45:30.000Z" → "Wed, Sep 24, 2025"
 */
export const formatPrettyDateFromTimestamp = (timestamp) => {
  if (!timestamp) return "";

  return new Date(timestamp).toLocaleDateString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};


/**
 * Format a full timestamp (created_at) into local time
 * Example: "2025-09-24T13:45:30.000Z" → "9:45 PM"
 */
export const formatTimeFromTimestamp = (timestamp) => {
  if (!timestamp) return "";
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
};

/**
 * Format a full timestamp into en-GB date and local time
 * Example: "2025-09-24T13:45:30.000Z" → "24/09/2025 9:45 PM"
 */
export const formatDateTimeFromTimestamp = (timestamp) => {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  const formattedDate = date.toLocaleDateString("en-GB");
  const formattedTime = date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${formattedDate}, ${formattedTime}`;
};
