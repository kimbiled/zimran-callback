import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/server/db";
import { isUuid } from "@/lib/server/session";
import { DebriefView } from "@/components/DebriefView";

export const dynamic = "force-dynamic";

export default async function DebriefPage({ params }: { params: Promise<{ callId: string }> }) {
  const { callId } = await params;
  if (!isUuid(callId)) notFound();
  const call = await db().getCall(callId);
  if (!call) notFound();
  if (!call.debrief) {
    return (
      <div className="mx-auto max-w-xl px-5 py-20 text-center">
        <h1 className="display text-3xl">No debrief for this call</h1>
        <p className="mt-3 text-mute">The call was interrupted before it finished. Start a new one, it only takes a minute.</p>
        <Link href={`/call/${call.persona.generated ? "custom" : call.persona.id}`} className="btn btn-primary mt-6">
          Call {call.persona.firstName} again
        </Link>
      </div>
    );
  }
  const { sessionId: _s, ...safe } = call;
  return <DebriefView call={{ ...safe, sessionId: "" }} debrief={call.debrief} />;
}
