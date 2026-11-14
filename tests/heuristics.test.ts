import { describe, expect, it } from "vitest";
import { heuristicJudge, heuristicCriteria } from "@/lib/ai/heuristics";
import { guardJudge } from "@/lib/ai/guards";
import { caseTurns, EVAL_CASES, matches } from "@/lib/ai/eval-cases";
import { getPersona, PERSONAS } from "@/lib/personas";
import { buildBrief } from "@/lib/voice/brief";
import { sampleCall } from "@/lib/sample";
import { heuristicOutcome } from "@/lib/ai/debrief";

describe("fallback judge on the labeled set", () => {
  it("gets the direction right on most labeled turns", () => {
    const results = EVAL_CASES.map((c) => {
      const persona = getPersona(c.personaId)!;
      const turns = caseTurns(c);
      const raw = heuristicJudge(persona, turns, c.alreadyFound ?? []);
      const g = guardJudge(raw, { prevScore: 0, repText: c.rep, painIds: persona.pains.map((p) => p.id), alreadyFound: c.alreadyFound ?? [] });
      return { id: c.id, ok: matches(c.expect, g.delta), delta: g.delta };
    });
    const acc = results.filter((r) => r.ok).length / results.length;
    if (acc < 0.75) console.table(results);
    expect(acc).toBeGreaterThanOrEqual(0.75);
  });
});

describe("personas and brief", () => {
  it("every persona has three pains with keywords and a voice", () => {
    for (const p of PERSONAS) {
      expect(p.pains).toHaveLength(3);
      p.pains.forEach((x) => expect(x.keywords.length).toBeGreaterThan(2));
      expect(p.voiceId).toMatch(/^[A-Za-z0-9]{20}$/);
    }
  });
  it("brief carries the hidden profile", () => {
    const p = PERSONAS[0];
    const brief = buildBrief(p);
    expect(brief).toContain(p.name);
    p.pains.forEach((x) => expect(brief).toContain(x.text));
    expect(brief).not.toContain("undefined");
  });
});

describe("sample call", () => {
  it("is internally consistent", () => {
    const c = sampleCall();
    const d = c.debrief!;
    expect(d.criteria.reduce((s, k) => s + k.score, 0)).toBe(d.total);
    expect(d.scoreTimeline.at(-1)?.score).toBe(d.finalScore);
    expect(heuristicOutcome(c.turns, d.finalScore)).toBe("meeting");
    const crit = heuristicCriteria(c.persona, c.turns);
    expect(crit).toHaveLength(5);
  });
});
