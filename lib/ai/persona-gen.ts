// [B] Buyer from a job posting: the rep practices on a customer of the company they're interviewing with.

import { generateText, Output } from "ai";
import { z } from "zod";
import type { Persona } from "../types";
import { PERSONAS, VOICES } from "../personas";
import { aiEnabled, JUDGE_MODEL, withTimeout } from "./model";
import { PERSONA_GEN_INSTRUCTIONS } from "./prompts";
import { normalize } from "./guards";

export const PersonaSchema = z.object({
  name: z.string().min(3).max(60),
  firstName: z.string().min(2).max(30),
  title: z.string().min(2).max(80),
  company: z.string().min(2).max(80),
  industry: z.string().min(2).max(120),
  product: z.string().min(3).max(160),
  difficulty: z.enum(["easy", "medium", "hard"]),
  gender: z.enum(["female", "male"]),
  openingLine: z.string().min(2).max(160),
  background: z.string().min(10).max(600),
  pains: z
    .array(
      z.object({
        id: z.string().regex(/^[a-z0-9_]{2,32}$/),
        text: z.string().min(5).max(300),
        weight: z.number().int().min(1).max(5),
        keywords: z.array(z.string().min(2).max(30)).min(1).max(10),
      }),
    )
    .min(2)
    .max(4),
  budget: z.string().min(5).max(300),
  objections: z.array(z.string().min(3).max(200)).min(2).max(4),
  meetingTriggers: z.array(z.string().min(3).max(240)).min(1).max(4),
  turnOffs: z.array(z.string().min(3).max(200)).min(1).max(4),
  successStep: z.string().min(3).max(200),
});

export function finalizePersona(p: z.infer<typeof PersonaSchema>): Persona {
  return {
    ...p,
    id: `custom-${Math.random().toString(36).slice(2, 10)}`,
    voiceId: p.gender === "female" ? VOICES.sarah : VOICES.eric,
    generated: true,
  };
}

const KEYWORD_MAP: { id: string; words: string[] }[] = [
  { id: "jessica-hr", words: ["hr", "people ops", "onboarding", "training", "learning", "workforce", "healthcare", "hiring", "recruit"] },
  { id: "mike-sales", words: ["crm", "sales team", "revenue", "pipeline", "conversation intelligence", "distribution", "quota", "b2b"] },
  { id: "linda-cfo", words: ["finance", "accounting", "accounts payable", "ap ", "invoice", "spend", "cfo", "fintech", "procurement"] },
  { id: "ryan-cto", words: ["devops", "cloud", "observability", "monitoring", "infrastructure", "developer", "engineering", "api", "security"] },
];

export function closestPersona(jobText: string): Persona {
  const t = ` ${normalize(jobText)} `;
  let best = PERSONAS[1];
  let bestHits = 0;
  for (const k of KEYWORD_MAP) {
    const hits = k.words.filter((w) => t.includes(w)).length;
    if (hits > bestHits) {
      bestHits = hits;
      best = PERSONAS.find((p) => p.id === k.id) ?? best;
    }
  }
  return best;
}

export async function personaFromJob(jobText: string): Promise<{ persona: Persona; generated: boolean }> {
  const text = jobText.slice(0, 6000);
  if (aiEnabled()) {
    try {
      const { output } = await withTimeout(
        generateText({
          model: JUDGE_MODEL,
          instructions: PERSONA_GEN_INSTRUCTIONS,
          temperature: 0.7,
          output: Output.object({ schema: PersonaSchema, name: "buyer_persona" }),
          prompt: `Job posting:\n"""\n${text}\n"""`,
        }),
        20000,
      );
      return { persona: finalizePersona(output), generated: true };
    } catch (e) {
      console.error("persona generation failed, using closest persona", e);
    }
  }
  return { persona: closestPersona(text), generated: false };
}
