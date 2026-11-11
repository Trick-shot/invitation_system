import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { ApiError } from "../../api/client";
import { homeFor, useAuth } from "../../auth/AuthProvider";
import { Button, Field, Illustration, Input, Logo } from "../../components/ui";
import "./auth.css";

export default function SignIn() {
  const { me, signIn } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (me) return <Navigate to={homeFor(me)} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError("");
    try { const m = await signIn(email, password); nav(homeFor(m), { replace: true }); }
    catch (err) { setError(err instanceof ApiError && err.status === 401 ? "That password does not match this email. Try again, or reset it." : "Could not reach the server. Check your connection."); }
    finally { setBusy(false); }
  };

  return (
    <div className="auth-canvas">
      <div className="auth-wrap">
      <img className="blob" src="/illustrations/blob.png" alt="" style={{ top: -130, right: -120 }} onError={(e) => e.currentTarget.classList.add("hidden")} />
      <div className="auth-card">
        <Illustration name="door" size={88} />
        <div className="brand"><Logo /> Trickshot Invitations</div>
        <h1>Sign in</h1>
        <form onSubmit={submit} className="stack" style={{ gap: 16 }}>
          <Field label="Email"><Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus /></Field>
          <Field label="Password" error={error}><Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required invalid={!!error} /></Field>
          <Button type="submit" variant="primary" size="lg" block loading={busy}>Sign in</Button>
        </form>
        <div className="row" style={{ justifyContent: "space-between", marginTop: 16, fontSize: 13 }}>
          <Link to="/forgot">Forgot password</Link>
          <span className="quiet">Have an invite link? Open it to set up your account.</span>
        </div>
      </div>
      </div>
    </div>
  );
}
