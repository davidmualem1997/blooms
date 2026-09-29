import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";

// הלינק בביו של הלקוח (ציבורי): כל כפתור עובר דרך קישור מעקב, כך שהלחיצות נכנסות לדוח החודשי
async function load(handle: string) {
  const admin = createAdminClient();
  const { data: client } = await admin.from("clients").select("id, name, color, brand").eq("link_handle", handle.toLowerCase()).maybeSingle();
  if (!client) return null;
  const { data: links } = await admin.from("links").select("slug, label").eq("client_id", client.id).eq("active", true).order("position");
  const logoPath = (client.brand as { logo_path?: string } | null)?.logo_path;
  const logo = logoPath ? (await admin.storage.from("media").createSignedUrl(logoPath, 60 * 60 * 24)).data?.signedUrl ?? null : null;
  return { client, links: links ?? [], logo };
}

export async function generateMetadata({ params }: PageProps<"/l/[handle]">): Promise<Metadata> {
  const data = await load((await params).handle);
  return { title: data ? data.client.name : "BLOOMS", robots: { index: false } };
}

export default async function BioPage({ params, searchParams }: PageProps<"/l/[handle]">) {
  const { handle } = await params;
  const s = (await searchParams).s;
  const data = await load(handle);
  if (!data) notFound();
  const src = typeof s === "string" ? s : "bio";
  return (
    <main className="bio" style={{ ["--c" as string]: data.client.color }}>
      <span className="bio-logo" style={data.logo ? { backgroundImage: `url(${data.logo})` } : undefined}>{data.logo ? "" : data.client.name.slice(0, 1)}</span>
      <h1>{data.client.name}</h1>
      <nav className="bio-links">
        {data.links.map((l) => <a key={l.slug} href={`/l/${handle}/${l.slug}?s=${encodeURIComponent(src)}`}>{l.label}</a>)}
      </nav>
      <Link className="bio-foot" href="/" aria-label="BLOOMS">BLOOMS</Link>
    </main>
  );
}
