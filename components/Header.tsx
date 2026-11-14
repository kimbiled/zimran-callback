import Link from "next/link";

export function Header() {
  return (
    <header className="sticky top-0 z-20 border-b border-line/70 bg-paper/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
        <Link href="/" className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-ink text-paper">
            <PhoneIcon />
          </span>
          <span className="display text-xl">Callback</span>
        </Link>
        <nav className="flex items-center gap-1 text-sm font-medium sm:gap-3">
          <Link href="/#buyers" className="rounded-full px-3 py-1.5 hover:bg-black/5">
            Practice
          </Link>
          <Link href="/progress" className="rounded-full px-3 py-1.5 hover:bg-black/5">
            Progress
          </Link>
          <Link href="/pricing" className="rounded-full px-3 py-1.5 hover:bg-black/5">
            Pricing
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function PhoneIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 4h3l2 5-2.5 1.5a11 11 0 0 0 6 6L15 14l5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}
