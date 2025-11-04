// context/ListeningContext.js
"use client";

import { createContext, useContext, useState } from "react";

// Context: ListeningContext
// This context provides a shared state for whether audio transcription
// or recording is currently "listening" across the app.
const ListeningContext = createContext();

export const ListeningProvider = ({ children }) => {
  const [listening, setListening] = useState(false);

  return (
    <ListeningContext.Provider value={{ listening, setListening }}>
      {children}
    </ListeningContext.Provider>
  );
};

export const useListening = () => useContext(ListeningContext);
