/** Keep in step with apps/invitations/models.py MAX_CAPACITY. */
export const MAX_CAPACITY = 20;
export type Role = "admin" | "coordinator" | "door_staff";

export interface WorkspaceBrief { slug: string; name: string; logo: string | null; default_country: string; default_language: string; event_count: number }
export interface SupportSessionBrief { id: number; mode: "view" | "edit"; reason: string; expires_at: string; workspace_id: number; workspace: WorkspaceBrief }
export interface Me { id: number; email: string; full_name: string; phone: string; initials: string; is_platform_owner: boolean; memberships: { workspace: WorkspaceBrief; role: Role }[]; support?: SupportSessionBrief[] }

export type EventStatus = "draft" | "open" | "closed";
export type EventKind = "wedding" | "communion" | "graduation" | "other";
export type GuestBand = "under_100" | "100_300" | "300_1000" | "over_1000";
export interface Event {
  id: number; name: string; kind: EventKind; date: string; start_time: string | null; venue: string; status: EventStatus;
  invitation_count: number; people_expected: number; people_arrived: number; has_template: boolean; has_message: boolean; created_at: string; updated_at: string;
  guests_estimate_band: GuestBand | ""; guests_estimate: number | null;
}
export interface CardTemplate { id: number; image: string; width: number; height: number; slot_x: number; slot_y: number; slot_size: number; updated_at: string }
export interface MessageTemplate { id: number; channel: "sms" | "whatsapp"; language: string; body: string; segments: { characters: number; segments: number; encoding: string }; preview: string; welcome_enabled: boolean; welcome_body: string; welcome_segments: { characters: number; segments: number; encoding: string }; welcome_preview: string; updated_at: string }

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

export interface StaffRef { name: string; email: string }
export interface ScanAttempt { id: number; at: string; result: string; manual: boolean; device_id: string; staff: StaffRef; admitted_after: number }
export interface ScanGuestLog { invitation_id: number; name: string; phone: string; capacity: number; admitted_count: number; stage: string; tone: "success" | "accent" | "warning"; reused: number; manual: boolean; last_at: string; last_staff: StaffRef; attempts: ScanAttempt[] }
export interface ScanLogGrouped { guests: ScanGuestLog[]; unrecognised: { count: number; last_at: string | null; attempts: ScanAttempt[] }; total_scans: number }

export interface WorkspaceSettings { name: string; slug: string; logo: string | null; timezone: string; default_country: string; default_language: string; messaging: { mode: "platform" | "own"; provider?: string; sender_id: string; api_key_masked: string } }

export type ScanResult = "accepted" | "exhausted" | "unknown" | "wrong_event" | "closed";
export interface Verdict { result: ScanResult; guest_name: string; capacity: number; admitted_count: number; previous_scans: { at: string; by: string; manual: boolean }[]; invitation_id: number | null; event_arrived: number }
export interface ScanEvent { id: number; name: string; date: string; venue: string; status: EventStatus; workspace: string }
export interface ScanSearchRow { id: number; name: string; phone: string; capacity: number; admitted_count: number }

export interface PublicInvitation { state: "ready" | "preparing" | "finished" | "invalid"; guest_name?: string; capacity?: number; admitted_count?: number; entries?: string[]; event?: { name: string; date: string; start_time: string | null; venue: string; status?: string }; card_url?: string | null }

export interface PlatformWorkspace { id: number; name: string; slug: string; status: string; default_country: string; default_language: string; created_at: string; members: number; events: number; events_open: number; messages_this_month: number; sms_this_month: number; contact: { name: string; email: string; phone: string; user_id: number } | null; sends_on: "platform" | "own_keys"; last_active: string | null; setup: "invite_not_accepted" | "no_events" | "complete"; delete_after: string | null }
export interface ActivityRow { kind: string; summary: string; reason: string; at: string }
export interface PlatformWorkspaceDetail extends PlatformWorkspace {
  money: { sms_this_month: number; sms_running_event: number; billed_year: number; profit_year: number; bills_year: number; unpaid: number; unpaid_open: number; unpaid_invoiced: number };
  events_total: number; events_running: number; team: { admin: number; coordinator: number; door_staff: number }; country_name: string;
  activity: ActivityRow[]; support: { id: number; mode: "view" | "edit"; expires_at: string; reason: string } | null;
  deletion: { scheduled: boolean; delete_after?: string; reason?: string; by?: string; grace_days: number; removes: { events: number; guests: number; team: number; accounts: number } };
}
export interface HowToPay { business_name: string; instructions: string; support_email: string; support_phone: string; due_days: number }
export interface PlatformSettingsData { business_name: string; support_email: string; support_phone: string; payment_instructions: string; invoice_due_days: number; updated_at: string }
export type BillStatus = "open" | "invoiced" | "paid";
export interface BillState { status: BillStatus; invoiced_at: string | null; due_at: string | null; paid_at: string | null }
export interface KindRow { kind: string; label: string; messages: number; sms: number; amount: number; prices_used: number[]; cost?: number; profit?: number }
export interface EventBillData {
  event: { id: number; name: string; date: string; status: EventStatus; workspace: string; workspace_id: number };
  bill: BillState; currency: string; price_per_sms: number; prices_used: number[]; messages: number; sms: number; amount: number;
  still_to_come: { welcome_texts: number; amount: number }; by_kind: KindRow[];
  charges: { recipient: string; kind: string; label: string; sms: number; price_per_sms: number; amount: number; at: string }[];
  cost?: number; profit?: number; cost_per_sms?: number; costs_used?: number[]; how_to_pay?: HowToPay;
}
export interface BillingData { currency: string; price_per_sms: number; prices_used: number[]; to_pay_now: number; running: number; paid_this_year: number; sms_this_year: number; events: { id: number; name: string; date: string; sms: number; amount: number; prices_used: number[]; bill: BillState }[]; how_to_pay: HowToPay }
export interface EarningsData {
  year: number; month: number; currency: string; cost_per_sms: number; price_per_sms: number; prices_used: number[]; costs_used: number[]; sms: number; cost: number; billed: number; profit: number;
  unpaid: number; unpaid_open: number; unpaid_invoiced: number; profit_by_month: { year: number; month: number; profit: number }[];
  events: { id: number; name: string; workspace: string; workspace_id: number; date: string; sms: number; cost: number; billed: number; profit: number; bill: BillState }[];
}
export interface OpenBillRow { id: number; name: string; workspace: string; workspace_id: number; sms: number; prices_used: number[]; amount_now: number; amount_after: number }
export interface OpenBills { price_per_sms: number; events: OpenBillRow[]; amount_now: number; amount_after: number }
export interface SmsRatesData { cost_per_sms: number; price_per_sms: number; currency: string; updated_at: string; open_bills: OpenBills }
