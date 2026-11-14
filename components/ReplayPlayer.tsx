"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { replayAt, type RecordedReplay } from "@/lib/replay/model";
import { Meter } from "./Meter";
import { ScoreChart } from "./ScoreChart";

const mmss = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

export function ReplayPlayer({ replay }: { replay: RecordedReplay }) {
  const [position, setPosition] = useState(0);
  const [playing, setPlaying] = useState(false);
  const positionRef = useRef(0);
  const latestTurn = useRef<HTMLLIElement | null>(null);
  const frame = replayAt(replay, position);
  const recordedDate = new Date(replay.recordedAt).toISOString().slice(0, 16).replace("T", " ");

  function seek(seconds: number) {
    const next = Math.max(0, Math.min(replay.durationSec, seconds));
    positionRef.current = next;
    setPosition(next);
    setPlaying(false);
  }

  useEffect(() => {
    if (!playing) return;
    const beganAt = performance.now();
    const beganFrom = positionRef.current;
    let animation: number;
    const tick = (now: number) => {
      const next = Math.min(replay.durationSec, beganFrom + (now - beganAt) / 1000);
      positionRef.current = next;
      setPosition(next);
      if (next < replay.durationSec) animation = requestAnimationFrame(tick);
      else setPlaying(false);
    };
    animation = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animation);
  }, [playing, replay.durationSec]);

  useEffect(() => { latestTurn.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [frame.turns.length]);

  return (
    <div className="mx-auto max-w-6xl px-5 py-10">
      <div className="mb-7 flex flex-wrap items-start justify-between gap-5">
        <div>
          <div className="text-sm font-semibold uppercase tracking-wider text-acc">Published call replay</div>
          <h1 className="display mt-2 text-3xl sm:text-4xl">Cold-call {replay.persona.name}</h1>
          <p className="mt-2 text-mute">{replay.persona.title} at {replay.persona.company}</p>
          <p className="mt-2 text-sm text-mute">Recorded {recordedDate} UTC · original transcript and saved judge events · no audio or microphone</p>
        </div>
        <Link href={replay.persona.generated ? "/#buyers" : `/call/${replay.persona.id}`} className="btn btn-primary">Try a call yourself</Link>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_1.15fr]">
        <div className="space-y-5">
          <div className="rounded-3xl bg-panel p-6 text-fg">
            <Meter score={frame.score} delta={frame.delta} reason={frame.reason} />
          </div>
          <div className="card p-5">
            <div className="flex flex-wrap items-center gap-3">
              <button className="btn btn-primary" onClick={() => {
                if (positionRef.current >= replay.durationSec) { positionRef.current = 0; setPosition(0); }
                setPlaying(value => !value);
              }} aria-label={playing ? "Pause replay" : "Play replay"}>{playing ? "Pause" : "Play replay"}</button>
              <button className="btn btn-ghost" onClick={() => seek(0)}>Restart</button>
              <span className="ml-auto font-mono text-sm tabular-nums" aria-live="off">{mmss(frame.at)} / {mmss(replay.durationSec)}</span>
            </div>
            <label className="mt-5 block text-sm font-semibold" htmlFor="replay-position">Replay position</label>
            <input id="replay-position" type="range" min={0} max={replay.durationSec} step={0.1} value={position} onChange={event => seek(Number(event.target.value))} className="mt-2 w-full accent-[#ff5c26]" aria-valuetext={`${mmss(frame.at)} of ${mmss(replay.durationSec)}`} />
            <p className="mt-2 text-xs text-mute">Move the slider or select a chart point to seek. Interest changes at each recorded verdict.</p>
          </div>
          <div className="card p-5">
            <h2 className="font-semibold">Interest during the call</h2>
            <ScoreChart points={replay.scoreTimeline} selected={Math.max(0, frame.points.length - 1)} showFirst onSelect={index => seek(replay.scoreTimeline[index].t)} labels={index => `${mmss(replay.scoreTimeline[index].t)} · interest ${replay.scoreTimeline[index].score}`} />
          </div>
          {position >= replay.durationSec && <div className="card rise p-5" role="status">
            <div className="display text-2xl">{replay.total}/100 · {replay.outcome === "meeting" ? "Meeting booked" : "No meeting"}</div>
            <p className="mt-2 text-sm text-mute">{replay.summary}</p>
          </div>}
        </div>

        <section className="card p-5" aria-labelledby="replay-transcript-title">
          <h2 id="replay-transcript-title" className="font-semibold">Recorded transcript</h2>
          <ol className="mt-4 max-h-[65vh] space-y-3 overflow-y-auto pr-1" aria-live="polite" aria-relevant="additions">
            {frame.turns.map((turn, index) => <li key={index} ref={index === frame.turns.length - 1 ? latestTurn : undefined} className={`rise rounded-2xl p-4 ${turn.role === "rep" ? "bg-acc-d/10" : "bg-white/5"}`}>
              <div className="flex items-center justify-between gap-3 text-xs font-semibold uppercase tracking-wide text-mute">
                <span>{turn.role === "rep" ? "Candidate" : replay.persona.name.split(" ")[0]} · {mmss(turn.start)}</span>
                {typeof turn.delta === "number" && <span className={turn.delta >= 0 ? "text-good" : "text-bad"}>{turn.delta > 0 ? "+" : ""}{turn.delta}</span>}
              </div>
              <p className="mt-2 text-sm leading-relaxed">{turn.text}</p>
              {turn.reason && <p className="mt-2 text-xs text-mute">{turn.reason}</p>}
            </li>)}
          </ol>
          {frame.turns.length === 0 && <p className="py-10 text-center text-sm text-mute">Press play to begin the recorded call.</p>}
        </section>
      </div>
    </div>
  );
}
