import { describe, expect, it } from "vitest";
import { db, nextStreak, streakInfo, utcToday } from "@/lib/server/db";

const id = () => crypto.randomUUID();

describe("streak rules", () => {
  it("adds a day after yesterday, keeps it today, resets after a gap", () => {
    expect(nextStreak(4, "2026-11-13", "2026-11-14")).toBe(5);
    expect(nextStreak(4, "2026-11-14", "2026-11-14")).toBe(4);
    expect(nextStreak(4, "2026-11-12", "2026-11-14")).toBe(1);
    expect(nextStreak(0, null, "2026-11-14")).toBe(1);
    expect(nextStreak(9, "2026-12-31", "2027-01-01")).toBe(10);
    expect(nextStreak(9, "2026-02-28", "2026-03-01")).toBe(10);
  });
  it("reads a streak not extended yesterday or today as broken", () => {
    expect(streakInfo(3, "2026-11-14", "2026-11-14")).toEqual({ streak: 3, lastWarmup: "2026-11-14", doneToday: true });
    expect(streakInfo(3, "2026-11-13", "2026-11-14")).toEqual({ streak: 3, lastWarmup: "2026-11-13", doneToday: false });
    expect(streakInfo(3, "2026-11-12", "2026-11-14").streak).toBe(0);
    expect(streakInfo(0, null, "2026-11-14")).toEqual({ streak: 0, lastWarmup: null, doneToday: false });
  });
  it("uses the UTC calendar date", () => {
    expect(utcToday(new Date("2026-11-14T23:30:00-05:00"))).toBe("2026-11-15");
  });
});

describe("memory store streak", () => {
  it("is the memory store in tests", () => {
    expect(db().kind).toBe("memory");
  });
  it("starts at 0 and counts the first drill as 1", async () => {
    const s = id();
    expect(await db().getStreak(s, "2026-11-14")).toEqual({ streak: 0, lastWarmup: null, doneToday: false });
    expect(await db().recordWarmup(s, "2026-11-14")).toEqual({ streak: 1, lastWarmup: "2026-11-14", doneToday: true });
  });
  it("yesterday → +1, today → same", async () => {
    const s = id();
    await db().recordWarmup(s, "2026-11-12");
    expect((await db().recordWarmup(s, "2026-11-13")).streak).toBe(2);
    expect((await db().recordWarmup(s, "2026-11-14")).streak).toBe(3);
    expect((await db().recordWarmup(s, "2026-11-14")).streak).toBe(3);
    expect(await db().getStreak(s, "2026-11-14")).toEqual({ streak: 3, lastWarmup: "2026-11-14", doneToday: true });
    // Next day, not drilled yet: still alive, not done.
    expect(await db().getStreak(s, "2026-11-15")).toEqual({ streak: 3, lastWarmup: "2026-11-14", doneToday: false });
  });
  it("a missed day resets to 1", async () => {
    const s = id();
    await db().recordWarmup(s, "2026-11-10");
    await db().recordWarmup(s, "2026-11-11");
    expect((await db().getStreak(s, "2026-11-14")).streak).toBe(0);
    expect((await db().recordWarmup(s, "2026-11-14")).streak).toBe(1);
  });
  it("keeps sessions separate", async () => {
    const a = id();
    const b = id();
    await db().recordWarmup(a, "2026-11-13");
    await db().recordWarmup(a, "2026-11-14");
    expect((await db().getStreak(b, "2026-11-14")).streak).toBe(0);
    expect((await db().getStreak(a, "2026-11-14")).streak).toBe(2);
  });
});
