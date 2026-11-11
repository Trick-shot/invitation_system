import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import { Button, DoneTick, Field, Input } from "../../components/ui";
import { AuthFrame } from "./AuthFrame";
import "./auth.css";

export default function Forgot() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError("");
    try { await api("/api/auth/forgot/", { method: "POST", body: { email }, auth: false }); setSent(true); }
    catch { setError("Could not reach the server. Check your connection."); }
    finally { setBusy(false); }
  };
  return (
    <AuthFrame>
      {sent ? (
        <div className="stack" style={{ gap: 12, alignItems: "center", textAlign: "center" }}>
          <DoneTick size={96} />
          <h1 style={{ fontSize: 24 }}>Check your inbox</h1>
          <p className="muted">If {email} has an account, a link to set a new password is on its way. It works for 7 days.</p>
          <Link to="/sign-in">Back to sign in</Link>
        </div>
      ) : (<>
        <div className="stack" style={{ gap: 6 }}>
          <h1>Reset your password</h1>
          <p className="muted">Enter the email you sign in with. We will send a link that lets you choose a new password.</p>
        </div>
        <form onSubmit={submit}>
          <Field label="Email" error={error}><Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus /></Field>
          <Button type="submit" variant="primary" block loading={busy}>Send the link</Button>
        </form>
        <div className="links"><Link to="/sign-in">Back to sign in</Link></div>
      </>)}
    </AuthFrame>
  );
}
