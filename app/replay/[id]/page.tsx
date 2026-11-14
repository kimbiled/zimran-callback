import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadPublishedReplay } from "@/lib/replay/data";
import { ReplayPlayer } from "@/components/ReplayPlayer";

export const dynamic = "force-dynamic";

// One DB read per request, shared by generateMetadata and the page.
const load = cache(loadPublishedReplay);

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const replay = await load(id);
  if (!replay) return { title: "Replay not found · Callback", robots: { index: false } };
  const { persona, total, outcome } = replay;
  const title = `${total}/100 against ${persona.name}, ${persona.title} · Callback`;
  const description = `${outcome === "meeting" ? "Meeting booked" : "No meeting"} on a practice cold call with ${persona.name}, ${persona.title} at ${persona.company}. Watch the transcript replay with the buyer's interest, turn by turn.`;
  return {
    title,
    description,
    alternates: { canonical: `/replay/${id}` },
    openGraph: { title, description, type: "article", url: `/replay/${id}`, siteName: "Callback" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function ReplayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const replay = await load(id);
  if (!replay) notFound();
  return <ReplayPlayer replay={replay} />;
}
