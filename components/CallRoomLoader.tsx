"use client";
// [A] The voice SDK is browser-only, so the call room renders on the client.

import dynamic from "next/dynamic";
import type { PersonaPublic, SalesRole } from "@/lib/types";
import { BriefSkeleton } from "./Skeletons";

const CallRoom = dynamic(() => import("./CallRoom"), {
  ssr: false,
  loading: () => <BriefSkeleton />,
});

export function CallRoomLoader({ persona, role }: { persona: PersonaPublic | null; role: SalesRole }) {
  return <CallRoom persona={persona} role={role} />;
}
