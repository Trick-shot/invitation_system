/**
 * Every page is its own chunk. A guest opening their card downloads the guest
 * page only, not the admin. Inside an event, the Overview loads first and the
 * other tabs are fetched in idle time (see preloadEventTabs) so they open instantly.
 */
import { lazyPage } from "./lazy";

export const SignIn = lazyPage(() => import("./pages/auth/SignIn"));
export const SetPassword = lazyPage(() => import("./pages/auth/SetPassword"));
export const Forgot = lazyPage(() => import("./pages/auth/Forgot"));
export const CreateAccount = lazyPage(() => import("./pages/auth/CreateAccount"));
export const Guest = lazyPage(() => import("./pages/guest/Guest"));
export const Scanner = lazyPage(() => import("./pages/scanner/Scanner"));
export const PlatformShell = lazyPage(() => import("./pages/platform/PlatformShell"));
export const PlatformWorkspaces = lazyPage(() => import("./pages/platform/Workspaces"));
export const PlatformWorkspaceDetail = lazyPage(() => import("./pages/platform/WorkspaceDetail"));
export const PlatformEarnings = lazyPage(() => import("./pages/platform/Earnings"));
export const PlatformEventBill = lazyPage(() => import("./pages/platform/Earnings").then((m) => ({ default: m.PlatformEventBill })));
export const PlatformRates = lazyPage(() => import("./pages/platform/Rates"));
export const Onboarding = lazyPage(() => import("./pages/onboarding/Onboarding"));

export const Shell = lazyPage(() => import("./pages/admin/Shell"));
export const Events = lazyPage(() => import("./pages/admin/Events"));
export const StaffPage = lazyPage(() => import("./pages/admin/Staff"));
export const Settings = lazyPage(() => import("./pages/admin/Settings"));
export const Billing = lazyPage(() => import("./pages/admin/Billing"));
export const EventBillPage = lazyPage(() => import("./pages/admin/Billing").then((m) => ({ default: m.EventBillPage })));
export const EventLayout = lazyPage(() => import("./pages/admin/EventLayout"));
export const Overview = lazyPage(() => import("./pages/admin/Overview"));
export const Guests = lazyPage(() => import("./pages/admin/Guests"));
export const Template = lazyPage(() => import("./pages/admin/Template"));
export const Message = lazyPage(() => import("./pages/admin/Message"));
export const StaffPanel = lazyPage(() => import("./pages/admin/Staff").then((m) => ({ default: m.StaffPanel })));
export const Send = lazyPage(() => import("./pages/admin/Send"));
export const ScanLog = lazyPage(() => import("./pages/admin/ScanLog"));

export const preloadEventTabs = () => [Guests, Template, Message, StaffPanel, Send, ScanLog].forEach((c) => c.preload());
export const preloadAdmin = () => [Shell, Events, EventLayout, Overview].forEach((c) => c.preload());
