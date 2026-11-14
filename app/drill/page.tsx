import type { Metadata } from "next";
import { dailyObjection, getObjection, THEMES } from "@/lib/objections";
import { DrillRoom, type DrillObjection } from "@/components/DrillRoom";

export const metadata: Metadata = {
  title: "Daily drill · Callback",
  description: "One buyer objection a day. 60 seconds to answer. Keep the streak alive.",
};

export default async function DrillPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const requested = typeof sp.o === "string" ? getObjection(sp.o) : undefined;
  const now = new Date();
  const o = requested ?? dailyObjection(now);
  const objection: DrillObjection = {
    id: o.id,
    text: o.text,
    personaId: o.personaId,
    buyer: o.buyer,
    firstName: o.firstName,
    title: o.title,
    company: o.company,
    difficulty: o.difficulty,
    themeLabel: THEMES[o.theme].label,
    pattern: THEMES[o.theme].pattern,
  };
  return (
    <DrillRoom
      key={objection.id}
      objection={objection}
      daily={!requested}
      dateLabel={now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" })}
    />
  );
}
