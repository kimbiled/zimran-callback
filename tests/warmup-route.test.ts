import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ sid: "", limited: false, rateCalls: 0 }));
vi.mock("@/lib/server/session", () => ({
  FREE_CALL_LIMIT: 3,
  sessionId: async () => fixture.sid,
  isUuid: (value: string) => /^[0-9a-f-]{36}$/.test(value),
}));
vi.mock("@/lib/server/rate-limit", () => ({
  rateLimit: async (_req: Request, route: string) => {
    fixture.rateCalls++;
    expect(route).toBe("warmup");
    return fixture.limited ? Response.json({ error: "Too many calls from this network. Try again in an hour." }, { status: 429 }) : null;
  },
}));

import { GET, POST } from "@/app/api/warmup/route";
import { GET as progress } from "@/app/api/progress/route";
import { getObjection } from "@/lib/objections";
import { db, utcToday } from "@/lib/server/db";

const OBJ = "jessica-hr.just-send-me-an-email-and";
const post = (body: unknown) =>
  POST(new Request("http://localhost/api/warmup", { method: "POST", headers: { "Content-Type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) }));

beforeEach(() => {
  vi.stubEnv("AI_DISABLED", "1");
  fixture.sid = crypto.randomUUID();
  fixture.limited = false;
  fixture.rateCalls = 0;
});

describe("POST /api/warmup", () => {
  it("scores with the heuristic judge when AI is off and starts the streak", async () => {
    const res = await post({ objectionId: OBJ, personaId: "jessica-hr", answer: "That's fair, I hear that a lot. Can I ask what you'd want the email to answer?", seconds: 24 });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.source).toBe("heuristic");
    expect(body.event).toBe("objection_handled");
    expect(body.delta).toBeGreaterThan(0);
    expect(body.score).toBeGreaterThanOrEqual(75);
    expect(body.reason).toMatch(/objection/i);
    expect(body.evidenceQuote.length).toBeGreaterThan(0);
    expect(body.sayInstead).toContain("up to speed");
    expect(body.streak).toBe(1);
    expect(body.doneToday).toBe(true);
    expect(fixture.rateCalls).toBe(1);
  });
  it("scores a pitch that ignores the objection low", async () => {
    const res = await post({ objectionId: OBJ, answer: "Our platform is the industry leading solution with great features." });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.delta).toBeLessThan(0);
    expect(body.score).toBeLessThan(40);
  });
  it("keeps the streak the same on a second drill the same day", async () => {
    await post({ objectionId: OBJ, answer: "Fair enough. What would make it worth reading?" });
    const second = await (await post({ objectionId: "mike-sales.we-already-have-salesforce", answer: "Makes sense. How do you use it today?" })).json();
    expect(second.streak).toBe(1);
    expect(await (await GET()).json()).toEqual({ streak: 1, lastWarmup: utcToday(), doneToday: true });
  });
  it("adds a day when the last drill was yesterday", async () => {
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    await db().recordWarmup(fixture.sid, yesterday);
    const body = await (await post({ objectionId: OBJ, answer: "Happy to. What should the email cover?" })).json();
    expect(body.streak).toBe(2);
  });
  it("rejects invalid input with 400 before rate limiting or scoring", async () => {
    expect((await post("{not json")).status).toBe(400);
    expect((await post({ objectionId: OBJ })).status).toBe(400);
    expect((await post({ objectionId: OBJ, answer: "   " })).status).toBe(400);
    expect((await post({ objectionId: OBJ, answer: "x".repeat(2001) })).status).toBe(400);
    expect((await post({ objectionId: "nope.nope", answer: "Fair. Why?" })).status).toBe(400);
    expect((await post({ objectionId: OBJ, personaId: "mike-sales", answer: "Fair. Why?" })).status).toBe(400);
    const res = await post({ objectionId: 42, answer: "Fair. Why?" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBeTruthy();
    expect(fixture.rateCalls).toBe(0);
    expect((await (await GET()).json()).streak).toBe(0);
  });
  it("returns 429 when rate limited and does not count the drill", async () => {
    fixture.limited = true;
    const res = await post({ objectionId: OBJ, answer: "Fair. What should it cover?" });
    expect(res.status).toBe(429);
    expect((await (await GET()).json()).doneToday).toBe(false);
  });
});

describe("GET /api/progress", () => {
  it("includes the streak and the public buyer roster for the 7-day plan", async () => {
    await post({ objectionId: OBJ, answer: "Fair. What should the email cover?" });
    const body = await (await progress()).json();
    expect(body.streak).toEqual({ streak: 1, lastWarmup: utcToday(), doneToday: true });
    expect(body.buyers).toHaveLength(13);
    expect(body.buyers[0]).toMatchObject({ id: "jessica-hr", firstName: "Jessica", difficulty: "easy" });
    for (const b of body.buyers) {
      expect(b).not.toHaveProperty("pains");
      expect(b).not.toHaveProperty("budget");
      for (const o of b.objections) expect(getObjection(o.id)?.personaId).toBe(b.id);
    }
  });
});
