import { notFound } from "next/navigation";
import { loadPublishedReplay } from "@/lib/replay/data";
import { ReplayPlayer } from "@/components/ReplayPlayer";

export const dynamic = "force-dynamic";

export default async function ReplayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const replay = await loadPublishedReplay(id);
  if (!replay) notFound();
  return <ReplayPlayer replay={replay} />;
}
