"use client";
// [A] The voice SDK is browser-only, so the call room renders on the client.

import dynamic from "next/dynamic";
import type { PersonaPublic } from "@/lib/types";

const CallRoom = dynamic(() => import("./CallRoom"), {
  ssr: false,
  loading: () => <div className="mx-auto max-w-6xl px-5 py-20 text-mute">Loading the call room…</div>,
});

export function CallRoomLoader({ persona }: { persona: PersonaPublic | null }) {
  return <CallRoom persona={persona} />;
}
