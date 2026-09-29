export type Role = "owner" | "manager" | "client";
export type ContentType = "post" | "reel" | "tiktok";
export type ContentStatus = "work" | "review" | "client" | "ok" | "live";

export type Profile = { id: string; full_name: string; email: string | null; avatar_url: string | null; avatar_path?: string | null };

// תמונת פרופיל: שהועלתה באפליקציה, אחרת של Google
export function avatarSrc(p?: { avatar_url?: string | null; avatar_path?: string | null } | null): string | null {
  if (p?.avatar_path) return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/avatars/${p.avatar_path}`;
  return p?.avatar_url ?? null;
}

export type Client = {
  id: string;
  studio_id: string;
  name: string;
  ig_handle: string;
  color: string;
  manager_id: string | null;
  brand: Record<string, unknown>;
};

export type ContentItem = {
  id: string;
  client_id: string;
  date: string;
  time?: string | null; // שעת עלייה מתוכננת, לתזכורת לפני העלאה
  type: ContentType;
  title: string;
  caption: string;
  notes: string;
  status: ContentStatus;
  thumb_path: string | null;
  media: { path: string; thumb: string | null; kind: "image" | "video" }[];
  stats?: Record<string, number>;
};

export type RecurringStory = { id: string; client_id: string; title: string; weekdays: number[] };
export type OneOffStory = { id: string; client_id: string; date: string; title: string; media?: { path: string; thumb: string | null; kind: string }[] };
export type MessageKind = "request" | "fix" | "idea" | "call";
export type RequestStatus = "new" | "in_progress" | "done" | "to_meeting";
export type Attachment = { path: string; thumb: string | null; kind: "image" | "video" | "file" };
export type Message = {
  id: string; client_id: string; kind: MessageKind; body: string; created_at: string; resolved_at?: string | null;
  status: RequestStatus; replies: { author_id: string; text: string; at: string }[]; attachments: Attachment[]; created_by?: string | null;
};
export const MESSAGE_LABEL: Record<MessageKind, string> = { request: "בקשה", fix: "תיקון", idea: "רעיון", call: "נושא לפגישה" };
export const REQUEST_STATUS: Record<RequestStatus, string> = { new: "חדש", in_progress: "בטיפול", done: "טופל", to_meeting: "הועבר לפגישה" };

export const TYPE_LABEL: Record<ContentType, string> = { post: "פוסט", reel: "ריל", tiktok: "טיקטוק" };
export const STATUS_LABEL: Record<ContentStatus, string> = {
  work: "בעבודה",
  review: "לבדיקה",
  client: "אצל הלקוח",
  ok: "מאושר",
  live: "עלה",
};

export type Brand = {
  socials?: { instagram?: string; tiktok?: string; facebook?: string; website?: string };
  hours?: string;
  contacts?: { name: string; role?: string; phone?: string; email?: string }[];
  materials?: { label: string; url: string }[];
  palette?: { hex: string; name: string }[];
  story?: string;
  values?: string;
  audience?: string;
  tone?: string;
  dos?: string;
  donts?: string;
  examples?: string;
  recurring?: string;
  faq?: { q: string; a: string }[];
  industry?: string;
  cover_path?: string;
  logo_path?: string;
  fonts?: string;
  ops?: string;
  elements?: string[];
  booking?: { reserve_url?: string; reserve_phone?: string; menu_url?: string; waze_url?: string; google_url?: string };
};

export type Task = { id: string; title: string; assignee_id: string | null; done: boolean };
export type Meeting = { id: string; kind: "meet" | "call" | "zoom"; starts_at: string; location: string; extra_topics: string[]; summary: string };

export type Idea = { id: string; client_id: string; month: string; title: string; note: string; url: string; image_path: string | null; source: "team" | "client"; used: boolean; created_at: string; author?: string };

export type TeamMeeting = { id: string; starts_at: string; kind: "meet" | "call" | "zoom"; location: string; attendee_ids: string[]; topics: { text: string; done: boolean }[]; summary: string };
export type ClientEvent = { id: string; client_id: string; date: string; title: string; description?: string; link?: string; needs_material?: boolean; images?: { path: string; thumb: string | null }[] };
