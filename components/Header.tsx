import Link from "next/link";
import { Phone } from "lucide-react";
import { Logo } from "./Logo";

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-bg/60 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-2.5">
        <Link href="/" className="group flex items-center" aria-label="Callback home">
          <Logo size={22} />
        </Link>
        <nav className="flex items-center gap-0.5 text-sm font-medium sm:gap-1">
          {[
            ["/#buyers", "Practice"],
            ["/progress", "Progress"],
            ["/drill", "Daily drill"],
            ["/objections", "Objections"],
            ["/pricing", "Pricing"],
          ].map(([href, label]) => (
            <Link key={href} href={href} className={`${href === "/progress" ? "hidden sm:flex" : href === "/drill" || href === "/objections" ? "hidden lg:flex" : "flex"} min-h-11 items-center rounded-full px-2.5 text-mute transition-colors hover:bg-white/5 hover:text-fg sm:px-3.5`}>
              {label}
            </Link>
          ))}
          <Link href="/call/jessica-hr?role=sdr" data-magnetic className="btn btn-accent btn-cta ml-2 hidden px-4 py-2 text-sm md:inline-flex">
            <Phone size={15} aria-hidden="true" /> Start a call
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function PhoneIcon({ size = 16 }: { size?: number }) {
  return <Phone size={size} aria-hidden="true" />;
}
