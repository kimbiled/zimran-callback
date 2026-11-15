import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({ sid: "" }));
vi.mock("@/lib/server/session", () => ({ FREE_CALL_LIMIT: 3, sessionId: async () => fixture.sid }));
import { db } from "@/lib/server/db";
import { getPersona } from "@/lib/personas";
import { POST } from "@/app/api/voice/startup/route";
import { recordVoiceSession } from "@/lib/voice/store";
beforeEach(() => { fixture.sid = crypto.randomUUID(); });
afterEach(() => vi.restoreAllMocks());
const request = (callId: string, state: string) => new Request("http://localhost/api/voice/startup", { method: "POST", body: JSON.stringify({ callId, state }), headers: { "Content-Type": "application/json" } });
async function reserved(mode: "voice" | "text" = "voice") {
  const id = crypto.randomUUID();
  await db().reserveCall(fixture.sid, 3);
  await db().createCall({ id, sessionId: fixture.sid, persona: getPersona("jessica-hr")!, mode });
  return id;
}
describe("voice startup quota", () => {
  it("refunds an unused failed start once even under parallel retries, and closes the call", async () => {
    const id = await reserved();
    const responses = await Promise.all(Array.from({ length: 4 }, () => POST(request(id, "failed"))));
    expect(responses.every(response => response.status === 200)).toBe(true);
    expect((await db().getOrCreateSession(fixture.sid)).callsUsed).toBe(0);
    expect((await db().getCall(id))?.status).toBe("cancelled");
    expect((await POST(request(id, "connected"))).status).toBe(409);
  });
  it("never refunds a connected call", async () => {
    const id = await reserved();
    await recordVoiceSession(id, "sess_created");
    expect((await POST(request(id, "connected"))).status).toBe(200);
    expect((await POST(request(id, "failed"))).status).toBe(409);
    expect((await db().getOrCreateSession(fixture.sid)).callsUsed).toBe(1);
  });
  it("cannot confirm a connection without a created provider session", async () => {
    const id = await reserved();
    expect((await POST(request(id, "connected"))).status).toBe(409);
    expect((await POST(request(id, "failed"))).status).toBe(200);
  });
  it("serializes a confirmation racing a refund without losing or double-crediting usage", async () => {
    const id = await reserved();
    await recordVoiceSession(id, "sess_race");
    const results = await Promise.all([POST(request(id, "connected")), POST(request(id, "failed"))]);
    expect(results.map(result => result.status).sort()).toEqual([200, 409]);
    const call = await db().getCall(id);
    expect((await db().getOrCreateSession(fixture.sid)).callsUsed).toBe(call?.status === "cancelled" ? 0 : 1);
  });
  it("hides another session's call and refuses text calls and invalid input", async () => {
    const text = await reserved("text");
    expect((await POST(request(text, "failed"))).status).toBe(404);
    const id = await reserved();
    fixture.sid = crypto.randomUUID();
    expect((await POST(request(id, "failed"))).status).toBe(404);
    expect((await POST(request("invalid", "failed"))).status).toBe(400);
  });
});
