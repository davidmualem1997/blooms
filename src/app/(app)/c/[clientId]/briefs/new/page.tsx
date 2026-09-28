import { notFound } from "next/navigation";
import { getContext } from "@/lib/context";
import { BriefForm } from "../brief-form";

export default async function NewBriefPage({ params }: PageProps<"/c/[clientId]/briefs/new">) {
  const { clientId } = await params;
  const ctx = await getContext();
  if (ctx.role === "client") notFound();
  return (
    <div className="sec">
      <h1 className="display-title">בריף חדש</h1>
      <BriefForm clientId={clientId} />
    </div>
  );
}
