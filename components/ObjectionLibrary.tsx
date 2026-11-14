"use client";
// Objection library: filter by theme and difficulty, search, then drill or call.

import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";
import { Input, Segmented } from "antd";
import { Lightbulb, Phone, Quote, Search, Timer } from "lucide-react";
import type { Difficulty } from "@/lib/types";
import type { ObjectionItem, ObjectionTheme } from "@/lib/objections";
import { DIFFICULTY_LABEL } from "@/lib/labels";
import { Reveal } from "./Reveal";

type ThemeInfo = { id: ObjectionTheme; label: string; pattern: string };
type DiffFilter = "all" | Difficulty;
type ThemeFilter = "all" | ObjectionTheme;

const DIFF_CHIP: Record<Difficulty, string> = {
  easy: "bg-good/15 text-good",
  medium: "bg-acc-d/15 text-acc",
  hard: "bg-bad/15 text-bad",
};

function matches(o: ObjectionItem, q: string) {
  if (!q) return true;
  const hay = `${o.text} ${o.say} ${o.buyer} ${o.company} ${o.title}`.toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w));
}

export function ObjectionLibrary({ items, themes }: { items: ObjectionItem[]; themes: ThemeInfo[] }) {
  const [theme, setTheme] = useState<ThemeFilter>("all");
  const [diff, setDiff] = useState<DiffFilter>("all");
  const [query, setQuery] = useState("");
  const q = useDeferredValue(query.trim());

  const filtered = useMemo(
    () => items.filter((o) => (theme === "all" || o.theme === theme) && (diff === "all" || o.difficulty === diff) && matches(o, q)),
    [items, theme, diff, q],
  );
  const themeCount = (t: ThemeFilter) => items.filter((o) => (t === "all" || o.theme === t) && (diff === "all" || o.difficulty === diff) && matches(o, q)).length;
  const groups = themes.map((t) => ({ ...t, items: filtered.filter((o) => o.theme === t.id) })).filter((g) => g.items.length);

  const clear = () => {
    setTheme("all");
    setDiff("all");
    setQuery("");
  };

  return (
    <div className="mt-8">
      <Reveal index={3} className="card space-y-4 p-4 sm:p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <Input
            size="large"
            allowClear
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            prefix={<Search size={16} className="text-mute-d" aria-hidden="true" />}
            placeholder="Search objections, buyers or companies"
            aria-label="Search objections"
            className="md:max-w-md"
          />
          <Segmented<DiffFilter>
            value={diff}
            onChange={setDiff}
            options={[
              { label: "All levels", value: "all" },
              { label: DIFFICULTY_LABEL.easy, value: "easy" },
              { label: DIFFICULTY_LABEL.medium, value: "medium" },
              { label: DIFFICULTY_LABEL.hard, value: "hard" },
            ]}
            className="self-start md:ml-auto md:self-auto"
          />
        </div>
        <div className="-mx-1 overflow-x-auto px-1 pb-1">
          <Segmented<ThemeFilter>
            value={theme}
            onChange={setTheme}
            options={[
              { label: `All · ${themeCount("all")}`, value: "all" },
              ...themes.map((t) => ({ label: `${t.label} · ${themeCount(t.id)}`, value: t.id })),
            ]}
          />
        </div>
      </Reveal>

      <p className="mt-5 text-sm text-mute" aria-live="polite">
        {filtered.length === items.length ? `Showing all ${items.length} objections` : `${filtered.length} of ${items.length} objections`}
      </p>

      {filtered.length === 0 ? (
        <div className="card rise mt-4 p-10 text-center">
          <h2 className="display text-2xl">Nothing matches</h2>
          <p className="mt-2 text-mute">Try a different word, or clear the filters.</p>
          <button type="button" onClick={clear} className="btn btn-ghost mt-5">
            Clear filters
          </button>
        </div>
      ) : (
        <div className="mt-2 space-y-10">
          {groups.map((g) => (
            <section key={g.id} aria-labelledby={`theme-${g.id}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-3">
                <h2 id={`theme-${g.id}`} className="display text-2xl">
                  {g.label} <span className="num text-base text-mute-d">{g.items.length}</span>
                </h2>
                <p className="text-sm text-mute">{g.pattern}</p>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {g.items.map((o, i) => (
                  <ObjectionCard key={o.id} o={o} index={i % 4} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function ObjectionCard({ o, index }: { o: ObjectionItem; index: number }) {
  return (
    <Reveal variant="up" index={index} className="spot card lift flex flex-col p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`chip ${DIFF_CHIP[o.difficulty]}`}>{DIFFICULTY_LABEL[o.difficulty]}</span>
        <span className="text-xs text-mute">
          {o.buyer} · {o.title}, {o.company}
        </span>
      </div>
      <p className="display mt-4 flex gap-2 text-xl leading-snug">
        <Quote size={18} className="mt-1 shrink-0 text-acc" aria-hidden="true" />
        <span>{o.text}</span>
      </p>
      <div className="mt-4 flex-1 rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-acc">
          <Lightbulb size={13} aria-hidden="true" /> Try saying
        </div>
        <p className="mt-1.5 text-sm leading-relaxed">&ldquo;{o.say}&rdquo;</p>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link href={`/drill?o=${encodeURIComponent(o.id)}`} className="btn btn-accent px-4 py-2 text-sm">
          <Timer size={15} aria-hidden="true" /> Practice it
        </Link>
        <Link href={`/call/${o.personaId}?role=sdr`} className="btn btn-ghost px-4 py-2 text-sm">
          <Phone size={15} aria-hidden="true" /> Call {o.firstName}
        </Link>
      </div>
    </Reveal>
  );
}
