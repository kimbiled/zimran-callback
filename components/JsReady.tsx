"use client";
// Rendered once in app/layout.tsx: tells the no-JS failsafe that the app bundle loaded,
// so <html class="js"> (which lets entrance animations start hidden) is kept.
if (typeof window !== "undefined") (window as unknown as { __rv?: boolean }).__rv = true;

export function JsReady() {
  return null;
}
