import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, tokens } from "../api/client";
import type { Me } from "../api/types";

interface Auth {
  me: Me | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<Me>;
  signOut: () => void;
  refresh: () => Promise<Me | null>;
}

const Ctx = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(Boolean(tokens.access));
  const qc = useQueryClient();

  const refresh = useCallback(async () => {
    if (!tokens.access) { setMe(null); setLoading(false); return null; }
    try { const m = await api<Me>("/api/me/"); setMe(m); return m; }
    catch { tokens.clear(); setMe(null); return null; }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const signIn = useCallback(async (email: string, password: string) => {
    const t = await api<{ access: string; refresh: string }>("/api/auth/token/", { method: "POST", body: { email, password }, auth: false });
    tokens.set(t.access, t.refresh);
    const m = await api<Me>("/api/me/");
    setMe(m);
    return m;
  }, []);

  const signOut = useCallback(() => { tokens.clear(); setMe(null); qc.clear(); }, [qc]);

  const value = useMemo(() => ({ me, loading, signIn, signOut, refresh }), [me, loading, signIn, signOut, refresh]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth outside AuthProvider");
  return v;
}

/** Where a signed-in user should land: scanner for door staff, the first workspace otherwise. */
export function homeFor(me: Me): string {
  if (me.memberships.length === 0) return me.is_platform_owner ? "/platform" : "/no-workspace";
  const admin = me.memberships.find((m) => m.role !== "door_staff");
  return admin ? `/app/${admin.workspace.slug}` : "/scan";
}
