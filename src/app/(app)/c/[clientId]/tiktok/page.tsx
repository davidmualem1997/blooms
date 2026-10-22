import { loadFeed } from "@/lib/feed-data";
import { FeedPlanner } from "@/components/feed-planner";
import { BulkUpload } from "@/components/bulk-upload";
import { SocialTabs } from "@/components/social-tabs";
import { Avatar } from "@/components/avatar";
import { signPaths } from "@/lib/media-server";

// טיקטוק – בדיוק כמו תכנון הפיד: גוררים לשינוי סדר, שורות ריקות, והגאנט מסתנכרן
export default async function TikTokPage({ params }: PageProps<"/c/[clientId]/tiktok">) {
  const { clientId } = await params;
  const f = await loadFeed(clientId, true);
  const socials = (f.client.brand?.socials ?? {}) as { tiktok?: string };
  const handle = socials.tiktok?.match(/@([^/?]+)/)?.[1] ?? f.client.ig_handle;
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
          {handle && <div className="muted" dir="ltr" style={{ textAlign: "right" }}>@{handle}</div>}
          <div className="txt num">{upcoming} מתוכננים · {f.items.length - upcoming} עלו</div>
        </div>
      </div>
      <FeedPlanner clientId={clientId} studioId={f.client.studio_id} items={f.items} thumbs={f.thumbs} today={f.today} canEdit={f.canEdit} tiktok />
      {!f.items.length && <p className="empty">עוד אין טיקטוקים. {f.canEdit ? "לחצו על + או הוסיפו שורה ריקה" : ""}</p>}
      {f.canEdit && <BulkUpload clientId={clientId} studioId={f.client.studio_id} lastDate={f.lastDate} today={f.today} tiktok />}
    </>
  );
}
