import { loadPublishedReplay } from "@/lib/replay/data";
import { bad, json } from "@/lib/server/validate";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const replay = await loadPublishedReplay(id);
  return replay ? json(replay) : bad("Replay not found", 404);
}
