import { notFound } from "next/navigation";
import { getPersona, toPublic } from "@/lib/personas";
import { applyRole, parseRole } from "@/lib/roles";
import { CallRoomLoader } from "@/components/CallRoomLoader";

export default async function CallPage({
  params,
  searchParams,
}: {
  params: Promise<{ personaId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { personaId } = await params;
  const role = parseRole((await searchParams).role);
  if (personaId === "custom") return <CallRoomLoader persona={null} role={role} />;
  const persona = getPersona(personaId);
  if (!persona) notFound();
  return <CallRoomLoader persona={toPublic(applyRole(persona, role))} role={role} />;
}
