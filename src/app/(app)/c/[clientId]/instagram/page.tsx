import { createClient } from "@/lib/supabase/server";
import { loadFeed } from "@/lib/feed-data";
import { FeedPlanner } from "@/components/feed-planner";
import { BulkUpload } from "@/components/bulk-upload";
import { SocialTabs } from "@/components/social-tabs";
import { Avatar } from "@/components/avatar";
import { signPaths } from "@/lib/media-server";

// תכנון הפיד – הדף הראשון אחרי "היום": כאן מעלים ומסדרים, והגאנט מסתנכרן
export default async function FeedPlanPage({ params }: PageProps<"/c/[clientId]/instagram">) {
  const { clientId } = await params;
  const f = await loadFeed(clientId, false);
  const supabase = await createClient();
  const { data: focus } = await supabase.from("monthly_focus").select("id, text, url")
    .eq("client_id", clientId).eq("month", f.today.slice(0, 7) + "-01").eq("kind", "content").eq("done", false).order("position");
  const logo = (f.client.brand as { logo_path?: string })?.logo_path;
  const logoUrl = logo ? (await signPaths([logo]))[logo] : null;
  const upcoming = f.items.filter((i) => i.date >= f.today).length;
  return (
    <>
      <SocialTabs clientId={clientId} />
      <div className="prof">
        <Avatar src={logoUrl} name={f.client.name} size={64} color={f.client.color} />
        <div>
          <h2>{f.client.name}</h2>
          {f.client.ig_handle && <div className="muted" dir="ltr" style={{ textAlign: "right" }}>@{f.client.ig_handle}</div>}
          <div className="txt num">{upcoming} מתוכננים · {f.items.length - upcoming} עלו</div>
        </div>
      </div>
      {(focus ?? []).length > 0 && (
        <div className="focus-open">
          <span className="label dotted">דגשים לחודש שעוד לא נוספו</span>
          <div className="chiprow">{(focus ?? []).map((x) => <span key={x.id} className="fchip">{x.text}</span>)}</div>
        </div>
      )}
      <FeedPlanner clientId={clientId} studioId={f.client.studio_id} items={f.items} thumbs={f.thumbs} today={f.today} canEdit={f.canEdit} />
      {!f.items.length && <p className="empty">עוד אין תוכן. {f.canEdit ? "לחצו על + או הוסיפו שורה ריקה" : ""}</p>}
      {f.canEdit && <BulkUpload clientId={clientId} studioId={f.client.studio_id} lastDate={f.lastDate} today={f.today} tiktok={false} />}
    </>
  );
}
