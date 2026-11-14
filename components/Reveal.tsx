"use client";
// Scroll-triggered entrance. One shared IntersectionObserver for the whole page.
// Content is visible without JS: the hidden state only applies under <html class="js">
// (set in app/layout.tsx), and prefers-reduced-motion turns it off in CSS.

import { createElement, useEffect, useRef, type CSSProperties, type ReactNode } from "react";

export type RevealVariant = "up" | "down" | "left" | "right" | "scale" | "blur" | "flip";

// Tells the no-JS failsafe in app/layout.tsx that the app bundle loaded.
if (typeof window !== "undefined") (window as unknown as { __rv?: boolean }).__rv = true;

let observer: IntersectionObserver | null = null;
function getObserver(): IntersectionObserver | null {
  if (typeof window === "undefined" || !("IntersectionObserver" in window)) return null;
  observer ??= new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add("is-in");
        observer?.unobserve(e.target);
      }
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
  );
  return observer;
}

export function Reveal({
  as = "div",
  variant = "up",
  index = 0,
  className,
  style,
  children,
  ...rest
}: {
  as?: keyof React.JSX.IntrinsicElements;
  variant?: RevealVariant;
  /** Position in a group: delays the entrance by index × 60ms. */
  index?: number;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
  id?: string;
  "aria-labelledby"?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = getObserver();
    if (!io) {
      el.classList.add("is-in");
      return;
    }
    io.observe(el);
    return () => io.unobserve(el);
  }, []);
  return createElement(
    as,
    { ref, "data-reveal": variant, className, style: { ...style, ["--i" as string]: index }, ...rest },
    children,
  );
}
