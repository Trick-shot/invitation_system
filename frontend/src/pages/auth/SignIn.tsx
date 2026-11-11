import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { ApiError } from "../../api/client";
import { homeFor, useAuth } from "../../auth/AuthProvider";
import { Button, Field, Input } from "../../components/ui";
import { AuthFrame } from "./AuthFrame";
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
    <AuthFrame>
      <h1>Sign in</h1>
      <form onSubmit={submit}>
        <Field label="Email"><Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus /></Field>
        <Field label="Password" error={error}><Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required invalid={!!error} /></Field>
        <Button type="submit" variant="primary" block loading={busy}>Sign in</Button>
      </form>
      <div className="links"><Link to="/forgot">Forgot password?</Link><Link to="/create-account">Create an account</Link></div>
    </AuthFrame>
  );
}
