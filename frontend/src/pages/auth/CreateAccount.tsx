import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { ApiError } from "../../api/client";
import { homeFor, useAuth } from "../../auth/AuthProvider";
import { Button, Field, Input } from "../../components/ui";
import { AuthFrame } from "./AuthFrame";
import "./auth.css";

/**
 * Self-serve sign up. Only email and password: the workspace is created behind the
 * scenes with a placeholder name and the guided setup asks for the real one, so the
 * form stays as short as the one it sits next to.
 */
export default function CreateAccount() {
  const { me, register } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ email?: string; password?: string; other?: string }>({});
  const [busy, setBusy] = useState(false);
  if (me) return <Navigate to={homeFor(me)} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setErrors({});
    try { const m = await register(email, password); nav(homeFor(m), { replace: true }); }
    catch (err) {
      if (err instanceof ApiError && err.status === 400 && err.data && typeof err.data === "object") {
        const d = err.data as Record<string, string[] | string>;
        const first = (v: string[] | string | undefined) => (Array.isArray(v) ? v[0] : v);
        setErrors({ email: first(d.email), password: first(d.password), other: first(d.non_field_errors) ?? first(d.detail) });
      } else setErrors({ other: "Could not reach the server. Check your connection." });
    } finally { setBusy(false); }
  };

  return (
    <AuthFrame>
      <div className="stack" style={{ gap: 6 }}>
        <h1>Create an account</h1>
        <p className="muted">You will be the admin of your own workspace. Add events, guests and door staff from there.</p>
      </div>
      <form onSubmit={submit}>
        <Field label="Email" error={errors.email}><Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus invalid={!!errors.email} /></Field>
        <Field label="Password" hint="At least 10 characters. A short sentence you will remember works well." error={errors.password}><Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={10} invalid={!!errors.password} /></Field>
        {errors.other && <p style={{ color: "var(--danger-text)", fontSize: 13 }}>{errors.other}</p>}
        <Button type="submit" variant="primary" block loading={busy}>Create account</Button>
      </form>
      <div className="links"><span className="muted">Already have one?</span><Link to="/sign-in">Sign in</Link></div>
    </AuthFrame>
  );
}
