import { notFound } from "next/navigation";
import { getPersona, toPublic } from "@/lib/personas";
import { CallRoomLoader } from "@/components/CallRoomLoader";

export default async function CallPage({ params }: { params: Promise<{ personaId: string }> }) {
  const { personaId } = await params;
  if (personaId === "custom") return <CallRoomLoader persona={null} />;
  const persona = getPersona(personaId);
  if (!persona) notFound();
  return <CallRoomLoader persona={toPublic(persona)} />;
}
