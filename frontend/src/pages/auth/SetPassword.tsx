import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../../api/client";
import { useAuth } from "../../auth/AuthProvider";
import { Button, Field, Illustration, Input } from "../../components/ui";
import "../onboarding/onboarding.css";
import { PageLoader } from "../../components/ui/states";

interface Info { workspace_name: string; invited_by: string; email: string; full_name: string; valid: boolean }

export default function SetPassword() {
  const { token } = useParams();
  const nav = useNavigate();
  const { signIn } = useAuth();
  const [info, setInfo] = useState<Info | null | "missing">(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Info>(`/api/invites/${token}/`, { auth: false }).then((i) => { setInfo(i); setName(i.full_name); }).catch(() => setInfo("missing"));
  }, [token]);

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError("");
    try {
      await api(`/api/invites/${token}/`, { method: "POST", body: { password, full_name: name }, auth: false });
      if (info && info !== "missing") { await signIn(info.email, password); }
      nav("/", { replace: true });
    } catch (err) { setError(err instanceof ApiError ? err.field("password") ?? err.summary : "Something went wrong."); }
    finally { setBusy(false); }
  };

  if (info === null) return <PageLoader />;
  const invalid = info === "missing" || !info.valid;
  return (
    <div className="ob-canvas">
      <div className="ob-wrap" style={{ maxWidth: 560 }}>
      <img className="ob-blob" src="/illustrations/blob.png" alt="" onError={(e) => (e.currentTarget.style.display = "none")} />
      <div className="ob-card">
        <div className="ob-head">
          <Illustration name="padlock-key" size={120} />
          {!invalid && <div className="quiet">{info.invited_by || "Someone"} invited you to {info.workspace_name}</div>}
          <h1 className="display-xl">{invalid ? "This link has expired" : <>Set a password<br />for your account</>}</h1>
          {invalid && <p className="muted">Ask the person who invited you to send a new one.</p>}
        </div>
        {!invalid && (
          <form onSubmit={submit} className="stack" style={{ gap: 18, width: "100%" }}>
            <Field label="You will sign in with" hint="This is your email address. It cannot be changed here."><Input type="email" value={info.email} readOnly /></Field>
            <Field label="Your full name"><Input value={name} onChange={(e) => setName(e.target.value)} required /></Field>
            <Field label="Password" hint="Long enough. Nothing else to worry about." error={error}><Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={10} required invalid={!!error} /></Field>
            <Button type="submit" variant="primary" size="xl" block loading={busy}>Create my account</Button>
          </form>
        )}
      </div>
      </div>
    </div>
  );
}
