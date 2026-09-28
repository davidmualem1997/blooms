import { loadFeed } from "@/lib/feed-data";
import { TikTokFeed } from "@/components/feed-views";
import { BulkUpload } from "@/components/bulk-upload";
import { SocialTabs } from "@/components/social-tabs";

export default async function TikTokPage({ params }: PageProps<"/c/[clientId]/tiktok">) {
  const { clientId } = await params;
  const f = await loadFeed(clientId, true);
  const socials = (f.client.brand?.socials ?? {}) as { tiktok?: string };
  const handle = socials.tiktok?.match(/@([^/?]+)/)?.[1] ?? f.client.ig_handle;
  const upcoming = f.items.filter((i) => i.date >= f.today).length;
  return (
    <>
      <SocialTabs clientId={clientId} />
      <div className="prof">
        <div className="av" style={{ background: f.client.color }}>{f.client.name.replace(/[^א-תA-Za-z0-9]/g, "")[0]}</div>
        <div>
          <h2>{f.client.name}</h2>
          {handle && <div className="muted" dir="ltr" style={{ textAlign: "right" }}>@{handle}</div>}
          <div className="txt num">{upcoming} מתוכננים · {f.items.length - upcoming} עלו</div>
        </div>
      </div>
      {f.items.length ? (
        <TikTokFeed clientId={clientId} studioId={f.client.studio_id} canEdit={f.canEdit} thumbs={f.thumbs} today={f.today} items={f.items} handle={handle} />
      ) : <p className="empty sec">עוד אין טיקטוקים. {f.canEdit ? "לחצו על + כדי להעלות סרטונים" : ""}</p>}
      {f.canEdit && <BulkUpload clientId={clientId} studioId={f.client.studio_id} lastDate={f.lastDate} today={f.today} tiktok />}
    </>
  );
}
