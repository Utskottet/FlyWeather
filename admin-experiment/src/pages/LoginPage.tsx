import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../domain/api";

export function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.login(password);
      navigate("/sites");
    } catch {
      setError("Incorrect password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 320, margin: "20vh auto", fontFamily: "sans-serif" }}>
      <h1>FlyWeather admin (experiment)</h1>
      <form onSubmit={handleSubmit}>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          autoFocus
          style={{ width: "100%", padding: 8, boxSizing: "border-box" }}
        />
        <button type="submit" disabled={busy} style={{ marginTop: 8, width: "100%", padding: 8 }}>
          {busy ? "Checking…" : "Log in"}
        </button>
        {error && <p style={{ color: "#f23535" }}>{error}</p>}
      </form>
    </div>
  );
}
