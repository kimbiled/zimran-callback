"use client";
// One global pointer listener for the whole site (mounted in app/layout.tsx):
//  · .spot           → a light spot and glowing border follow the cursor (--mx/--my)
//  · .tilt           → the card tilts in 3D toward the cursor (--rx/--ry)
//  · [data-magnetic] → the button leans toward the cursor (--tx/--ty)
// Only for a fine pointer (mouse/trackpad) and only without prefers-reduced-motion.

import { useEffect } from "react";

const MAX_TILT = 8; // degrees
const MAX_PULL = 10; // px

export function Effects() {
  useEffect(() => {
    if (!matchMedia("(pointer: fine)").matches || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    let last: PointerEvent | null = null;
    let tilted: HTMLElement | null = null;
    let pulled: HTMLElement | null = null;

    const reset = (el: HTMLElement | null, kind: "tilt" | "pull") => {
      if (!el) return;
      if (kind === "tilt") {
        el.style.setProperty("--rx", "0deg");
        el.style.setProperty("--ry", "0deg");
        el.removeAttribute("data-tilting");
      } else {
        el.style.setProperty("--tx", "0px");
        el.style.setProperty("--ty", "0px");
      }
    };

    const apply = () => {
      raf = 0;
      const e = last;
      if (!e) return;
      const target = e.target instanceof Element ? e.target : null;

      const spot = target?.closest<HTMLElement>(".spot");
      if (spot) {
        const r = spot.getBoundingClientRect();
        spot.style.setProperty("--mx", `${e.clientX - r.left}px`);
        spot.style.setProperty("--my", `${e.clientY - r.top}px`);
      }

      const tilt = target?.closest<HTMLElement>(".tilt") ?? null;
      if (tilt !== tilted) {
        reset(tilted, "tilt");
        tilted = tilt;
      }
      if (tilt) {
        const r = tilt.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        tilt.setAttribute("data-tilting", "");
        tilt.style.setProperty("--ry", `${(px * MAX_TILT * 2).toFixed(2)}deg`);
        tilt.style.setProperty("--rx", `${(-py * MAX_TILT * 2).toFixed(2)}deg`);
      }

      const mag = target?.closest<HTMLElement>("[data-magnetic]") ?? null;
      if (mag !== pulled) {
        reset(pulled, "pull");
        pulled = mag;
      }
      if (mag) {
        const r = mag.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height / 2);
        mag.style.setProperty("--tx", `${Math.max(-MAX_PULL, Math.min(MAX_PULL, dx * 0.2)).toFixed(1)}px`);
        mag.style.setProperty("--ty", `${Math.max(-MAX_PULL, Math.min(MAX_PULL, dy * 0.3)).toFixed(1)}px`);
      }
    };

    const onMove = (e: PointerEvent) => {
      last = e;
      if (!raf) raf = requestAnimationFrame(apply);
    };
    const onLeave = () => {
      reset(tilted, "tilt");
      reset(pulled, "pull");
      tilted = pulled = null;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
      cancelAnimationFrame(raf);
    };
  }, []);
  return null;
}
