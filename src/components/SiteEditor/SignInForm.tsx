import { useState } from "react";
import { signIn } from "../../app/editorApi.ts";

interface Props {
  onSignedIn: () => void;
}

/**
 * Password sign-in for publishing.
 *
 * The password authenticates to the publishing Worker only. It is never
 * stored - what is kept is the short-lived session token the Worker issues
 * in exchange, and the GitHub credential that can actually write to the
 * repository never leaves the Worker's secrets.
 */
export function SignInForm({ onSignedIn }: Props) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await signIn(password);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    // Cleared on success so it is not sitting in component state, and
    // never written to storage at any point.
    setPassword("");
    onSignedIn();
  }

  return (
    <form onSubmit={submit} className="site-editor-signin" data-testid="editor-signin">
      <label>
        Password
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          autoFocus
          data-testid="editor-password"
        />
      </label>
      {error && (
        <p className="site-editor-error" data-testid="editor-signin-error">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy || password.length === 0} data-testid="editor-signin-submit">
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
