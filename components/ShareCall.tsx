"use client";
// Publish a finished call as a public replay (transcript + saved judge events, no audio) and share the link.

import { useEffect, useState } from "react";
import { Check, Copy, ExternalLink, Globe, Share2 } from "lucide-react";
import { trackEvent } from "@/lib/analytics";

/** Clipboard API with a textarea fallback for browsers or contexts without it. */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

export function shareLinks(url: string, text: string) {
  return {
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
    x: `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
  };
}

export function ShareCall({
  callId,
  published: initiallyPublished = false,
  total,
  buyer,
  eligibleHint,
}: {
  callId: string;
  published?: boolean;
  total: number;
  buyer: string;
  /** Shown before publishing when the call likely can't be published (text call or offline debrief). */
  eligibleHint?: string | null;
}) {
  const [consent, setConsent] = useState(false);
  const [pending, setPending] = useState(false);
  // Relative path from the API; made absolute with the page origin after mount (keeps SSR and hydration identical).
  const [path, setPath] = useState<string | null>(initiallyPublished ? `/replay/${callId}` : null);
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setOrigin(window.location.origin), []);

  const absolute = (p: string) => (/^https?:/.test(p) ? p : `${origin || window.location.origin}${p}`);

  async function copy(link: string) {
    const ok = await copyText(link);
    setCopied(ok);
    if (ok) setTimeout(() => setCopied(false), 2200);
  }

  async function publish() {
    if (!consent || pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/samples", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callId, consent: true }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof body.error === "string" ? body.error : "The call could not be published.");
        return;
      }
      const next = typeof body.url === "string" ? body.url : `/replay/${callId}`;
      const link = absolute(next);
      setPath(next);
      trackEvent("call_published", { total });
      await copy(link);
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  const link = path ? (/^https?:/.test(path) ? path : `${origin}${path}`) : null;
  const shareText = `I scored ${total}/100 on a practice cold call against ${buyer} on Callback. Here's the replay:`;
  const links = link ? shareLinks(link, shareText) : null;

  return (
    <div className="card spot lift overflow-hidden p-6">
      <div className="flex items-start gap-4">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[#ff7a3d] via-[#ff2e6e] to-[#9b7bff] text-[#0a0508]">
          <Share2 size={20} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="display text-xl">{link ? "Your replay is live" : "Publish & share"}</h2>
          <p className="mt-1 text-sm text-mute">
            {link
              ? "Anyone with the link can watch the transcript replay with the buyer's interest, turn by turn."
              : `Show a hiring manager how you handle ${buyer}. The replay plays the transcript with the interest meter, turn by turn.`}
          </p>
        </div>
      </div>

      {!link && (
        <div className="mt-5 space-y-4">
          <label className="flex cursor-pointer items-start gap-3 text-sm leading-snug">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-[#ff5c26]"
            />
            <span>Publish the transcript of this practice call; no audio, no personal data.</span>
          </label>
          {eligibleHint && !error && <p className="text-xs text-mute-d">{eligibleHint}</p>}
          <button type="button" onClick={() => void publish()} disabled={!consent || pending} className="btn btn-accent btn-cta cta-quiet">
            <Globe size={16} aria-hidden="true" />
            {pending ? "Publishing…" : "Publish & copy link"}
          </button>
          {error && (
            <p role="alert" className="pop rounded-xl bg-bad/10 p-3 text-sm text-bad">
              {error}
            </p>
          )}
        </div>
      )}

      {link && links && (
        <div className="pop mt-5 space-y-3">
          <div className="flex items-center gap-2 rounded-2xl border border-line bg-panel-2 p-1.5 pl-4">
            <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label="Replay link" className="min-w-0 flex-1 bg-transparent font-mono text-xs text-fg outline-none sm:text-sm" />
            <button type="button" onClick={() => void copy(link)} className="btn btn-ghost shrink-0 !px-3 !py-2 text-sm" aria-live="polite">
              {copied ? <Check size={15} className="text-good" aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href={links.linkedin} target="_blank" rel="noopener noreferrer" className="btn btn-ghost !py-2 text-sm">
              Share on LinkedIn <ExternalLink size={14} aria-hidden="true" />
            </a>
            <a href={links.x} target="_blank" rel="noopener noreferrer" className="btn btn-ghost !py-2 text-sm">
              Post on X <ExternalLink size={14} aria-hidden="true" />
            </a>
            <a href={link} target="_blank" rel="noopener noreferrer" className="btn btn-ghost !py-2 text-sm">
              Open replay <ExternalLink size={14} aria-hidden="true" />
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
