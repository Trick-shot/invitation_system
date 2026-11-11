export type Role = "admin" | "coordinator" | "door_staff";

export interface WorkspaceBrief { slug: string; name: string; logo: string | null; default_country: string; default_language: string }
export interface Me { id: number; email: string; full_name: string; phone: string; initials: string; is_platform_owner: boolean; memberships: { workspace: WorkspaceBrief; role: Role }[] }

export type EventStatus = "draft" | "open" | "closed";
export type EventKind = "wedding" | "communion" | "graduation" | "other";
export interface Event {
  id: number; name: string; kind: EventKind; date: string; start_time: string | null; venue: string; status: EventStatus;
  invitation_count: number; people_expected: number; people_arrived: number; has_template: boolean; has_message: boolean; created_at: string; updated_at: string;
}
export interface CardTemplate { id: number; image: string; width: number; height: number; slot_x: number; slot_y: number; slot_size: number; updated_at: string }
export interface MessageTemplate { id: number; channel: "sms" | "whatsapp"; language: string; body: string; segments: { characters: number; segments: number; encoding: string }; preview: string; updated_at: string }

export type DeliveryStatus = "queued" | "sent" | "delivered" | "failed";
export interface Delivery { id: number; channel: string; sequence: number; status: DeliveryStatus; provider: string; error: string; created_at: string; updated_at: string }
export type CardStatus = "pending" | "generating" | "ready" | "failed";
export interface Invitation {
  id: number; name: string; phone: string; phone_display: string; initials: string; capacity: number; admitted_count: number;
  card: string | null; card_status: CardStatus; card_error: string; view_count: number; first_viewed_at: string | null; notes: string;
  token: string; public_url: string; last_delivery: Delivery | null; created_at: string; updated_at: string;
}
export interface Paginated<T> { count: number; next: string | null; previous: string | null; results: T[] }

export interface PreviewRow { name: string; phone_raw: string; phone: string; phone_display?: string; capacity: number; status: "ready" | "duplicate" | "needs_attention"; reason: string }
export interface ImportPreview { rows: PreviewRow[]; counts: { ready: number; duplicate: number; needs_attention: number }; found: number }

export interface Dashboard {
  tiles: { arrived: { value: number; of: number; last_hour: number }; cards_scanned: { value: number; of: number }; sent: { value: number; delivered: number; failed: number }; failed: { value: number } };
  funnel: { stage: string; count: number; note?: string }[];
  resends: number; cards_ready: number;
  door: { by_staff: { name: string; scans: number }[]; rejections: Record<string, number>; manual_admits: number };
  arrivals_by_hour: { hour: string; count: number }[];
  generated_at: string;
}
export interface SendProgress { counts: Record<DeliveryStatus, number>; total: number; recent: { invitation_id: number; name: string; status: DeliveryStatus; error: string; sequence: number }[] }

export interface Member { id: number; email: string; full_name: string; phone: string; initials: string; role: Role; is_active: boolean; created_at: string }
export interface ScanLogRow { id: number; at: string; result: string; manual: boolean; device_id: string; staff: string; guest: string; admitted_after: number }

export interface WorkspaceSettings { name: string; slug: string; logo: string | null; timezone: string; default_country: string; default_language: string; messaging: { mode: "platform" | "own"; provider?: string; sender_id: string; api_key_masked: string } }

export type ScanResult = "accepted" | "exhausted" | "unknown" | "wrong_event" | "closed";
export interface Verdict { result: ScanResult; guest_name: string; capacity: number; admitted_count: number; previous_scans: { at: string; by: string; manual: boolean }[]; invitation_id: number | null; event_arrived: number }
export interface ScanEvent { id: number; name: string; date: string; venue: string; status: EventStatus; workspace: string }
export interface ScanSearchRow { id: number; name: string; phone: string; capacity: number; admitted_count: number }

export interface PublicInvitation { state: "ready" | "preparing" | "finished" | "invalid"; guest_name?: string; capacity?: number; event?: { name: string; date: string; start_time: string | null; venue: string }; card_url?: string | null }

export interface PlatformWorkspace { id: number; name: string; slug: string; status: string; default_country: string; default_language: string; created_at: string; members: number; events: number; events_open: number; messages_this_month: number; setup: "invite_not_accepted" | "no_events" | "complete" }
