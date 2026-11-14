"use client";
// Mobile-only bottom bar: appears once the hero call button scrolls away,
// hides again while the buyer list (which has its own call buttons) is on screen.

import Link from "next/link";
import { useEffect, useState } from "react";
import { PhoneIcon } from "./Header";

export function StickyCta({ href, watch = "hero-cta", hideOn = "buyers" }: { href: string; watch?: string; hideOn?: string }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const hero = document.getElementById(watch);
    const list = document.getElementById(hideOn);
    if (!hero || !("IntersectionObserver" in window)) return;
    let heroVisible = true;
    let listVisible = false;
    const update = () => setShow(!heroVisible && !listVisible);
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.target === hero) heroVisible = e.isIntersecting;
        if (e.target === list) listVisible = e.isIntersecting;
      }
      update();
    });
    io.observe(hero);
    if (list) io.observe(list);
    return () => io.disconnect();
  }, [watch, hideOn]);

  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-panel/95 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 backdrop-blur transition duration-300 sm:hidden ${
        show ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-full opacity-0"
      }`}
      aria-hidden={!show}
    >
      <Link href={href} tabIndex={show ? 0 : -1} className="btn btn-accent btn-cta min-h-12 w-full">
        <PhoneIcon /> Start a free call · 3 min
      </Link>
      <p className="mt-1.5 text-center text-xs text-mute-d">3 free calls · no sign-up · no mic? use text</p>
    </div>
  );
}
