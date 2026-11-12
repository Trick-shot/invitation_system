import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { ApiError } from "../../api/client";
import { homeFor, useAuth } from "../../auth/AuthProvider";
import { Button, Field, Input } from "../../components/ui";
import { AuthFrame } from "./AuthFrame";
import "./auth.css";

const STAFF_EMAIL_KEY = "ti.staff.email";

/**
 * One account system, two front doors. /sign-in is for admins; /staff is the
 * door team's way in. Same accounts and passwords: the page only changes the
 * wording and where you land (always the scanner). Roles still decide access.
 */
export default function SignIn({ staff = false }: { staff?: boolean }) {
  const { me, signIn } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState(() => (staff ? safeGet(STAFF_EMAIL_KEY) : "") ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const landing = (m: Parameters<typeof homeFor>[0]) => (staff ? "/scan" : homeFor(m));
  if (me) return <Navigate to={landing(me)} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError("");
    try { const m = await signIn(email, password); if (staff) safeSet(STAFF_EMAIL_KEY, email); nav(landing(m), { replace: true }); }
    catch (err) { setError(err instanceof ApiError && err.status === 401 ? "That password does not match this email. Try again, or reset it." : "Could not reach the server. Check your connection."); }
    finally { setBusy(false); }
  };

  return (
    <AuthFrame>
      <h1>{staff ? "Sign in as staff" : "Sign in"}</h1>
      {staff && <p className="muted" style={{ marginTop: -6 }}>For the door team. Use the email your event admin added you with.</p>}
      <form onSubmit={submit}>
        <Field label="Email"><Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus={!email} /></Field>
        <Field label="Password" error={error}><Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required invalid={!!error} autoFocus={staff && !!email} /></Field>
        <Button type="submit" variant="primary" block loading={busy}>Sign in</Button>
      </form>
      {staff ? (
        <>
          <div className="links"><Link to="/forgot">Forgot password?</Link><Link to="/sign-in">Not door staff? Sign in here</Link></div>
          <p className="muted staff-tip">Add this page to your home screen before the event, so the scanner opens in one tap at the door.</p>
        </>
      ) : (
        <div className="links"><Link to="/forgot">Forgot password?</Link><Link to="/create-account">Create an account</Link><Link to="/staff">Door staff? Sign in to scan</Link></div>
      )}
    </AuthFrame>
  );
}

function safeGet(k: string) { try { return localStorage.getItem(k); } catch { return null; } }
function safeSet(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* private mode */ } }
