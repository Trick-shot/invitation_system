/**
 * Thin fetch wrapper: JSON in and out, JWT from localStorage, one silent
 * refresh on 401, and errors that carry the server's field messages so
 * forms can show them next to the right input.
 */
const ACCESS = "ti.access";
const REFRESH = "ti.refresh";

export class ApiError extends Error {
  status: number;
  data: unknown;
  constructor(status: number, data: unknown) {
    super(typeof data === "object" && data && "detail" in (data as object) ? String((data as { detail: unknown }).detail) : `Request failed (${status})`);
    this.status = status;
    this.data = data;
  }
  field(name: string): string | undefined {
    const d = this.data as Record<string, unknown> | null;
    const v = d?.[name];
    if (Array.isArray(v)) return String(v[0]);
    if (typeof v === "string") return v;
    return undefined;
  }
  get summary(): string {
    const d = this.data as Record<string, unknown> | null;
    if (!d || typeof d !== "object") return this.message;
    if (typeof d.detail === "string") return d.detail;
    const first = Object.entries(d)[0];
    if (!first) return this.message;
    const [k, v] = first;
    const msg = Array.isArray(v) ? v[0] : v;
    return k === "non_field_errors" ? String(msg) : `${k}: ${msg}`;
  }
}

export const tokens = {
  get access() { return localStorage.getItem(ACCESS); },
  get refresh() { return localStorage.getItem(REFRESH); },
  set(access: string, refresh?: string) { localStorage.setItem(ACCESS, access); if (refresh) localStorage.setItem(REFRESH, refresh); },
  clear() { localStorage.removeItem(ACCESS); localStorage.removeItem(REFRESH); },
};

let refreshing: Promise<boolean> | null = null;
async function tryRefresh(): Promise<boolean> {
  if (!tokens.refresh) return false;
  refreshing ??= fetch("/api/auth/token/refresh/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refresh: tokens.refresh }) })
    .then(async (r) => { if (!r.ok) { tokens.clear(); return false; } const d = await r.json(); tokens.set(d.access, d.refresh); return true; })
    .finally(() => { refreshing = null; });
  return refreshing;
}

interface Options { method?: string; body?: unknown; form?: FormData; auth?: boolean; signal?: AbortSignal }

export async function api<T>(path: string, opts: Options = {}): Promise<T> {
  const { method = "GET", body, form, auth = true, signal } = opts;
  const headers: Record<string, string> = {};
  if (!form) headers["Content-Type"] = "application/json";
  if (auth && tokens.access) headers.Authorization = `Bearer ${tokens.access}`;
  const run = () => fetch(path, { method, headers, body: form ?? (body !== undefined ? JSON.stringify(body) : undefined), signal });
  let res = await run();
  if (res.status === 401 && auth && (await tryRefresh())) {
    headers.Authorization = `Bearer ${tokens.access}`;
    res = await run();
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, data);
  return data as T;
}

export const ws = (slug: string) => `/api/workspaces/${slug}`;
export const ev = (slug: string, id: number | string) => `${ws(slug)}/events/${id}`;
