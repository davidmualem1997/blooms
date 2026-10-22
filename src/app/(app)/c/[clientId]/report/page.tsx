import { ReportView } from "./report-view";

export const metadata = { title: "דוח חודשי · BLOOMS" };

export default async function ReportPage({ params, searchParams }: PageProps<"/c/[clientId]/report">) {
  const { clientId } = await params;
  const sp = await searchParams;
  return <ReportView clientId={clientId} m={typeof sp.m === "string" ? sp.m : undefined} />;
}
