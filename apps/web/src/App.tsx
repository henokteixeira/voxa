import { useEffect, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export default function App() {
  const [apiStatus, setApiStatus] = useState("checking…");

  useEffect(() => {
    fetch(`${API_URL}/api/health`)
      .then((r) => r.json())
      .then((d: { status: string }) => setApiStatus(d.status))
      .catch(() => setApiStatus("offline"));
  }, []);

  return (
    <main>
      <h1>Voxa</h1>
      <p>API: {apiStatus}</p>
    </main>
  );
}
