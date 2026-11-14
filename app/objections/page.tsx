import type { Metadata } from "next";
import { BookOpen } from "lucide-react";
import { OBJECTIONS, THEME_ORDER, THEMES } from "@/lib/objections";
import { ObjectionLibrary } from "@/components/ObjectionLibrary";
import { Reveal } from "@/components/Reveal";

export const metadata: Metadata = {
  title: "Objection library · Callback",
  description: "Every objection our AI buyers throw at you, with a line to say back. Practice any of them in 60 seconds.",
};

export default function ObjectionsPage() {
  const themes = THEME_ORDER.map((id) => ({ id, ...THEMES[id] }));
  const buyers = new Set(OBJECTIONS.map((o) => o.personaId)).size;
  return (
    <div className="mx-auto max-w-6xl px-5 pb-24 pt-10">
      <Reveal variant="down">
        <span className="eyebrow">
          <span className="chip bg-acc-d/15 text-acc">
            <BookOpen size={13} aria-hidden="true" /> Library
          </span>
          {OBJECTIONS.length} objections from {buyers} buyers
        </span>
      </Reveal>
      <Reveal as="h1" variant="blur" index={1} className="display mt-4 text-4xl sm:text-6xl">
        Hear it here <span className="text-gradient">before the interview</span>
      </Reveal>
      <Reveal as="p" index={2} className="mt-3 max-w-2xl text-lg text-mute">
        Every objection our buyers use on calls, grouped by what&apos;s really behind it. Each one comes with a line to say back. Drill any of them in 60 seconds, or take the full call.
      </Reveal>
      <ObjectionLibrary items={OBJECTIONS} themes={themes} />
    </div>
  );
}
