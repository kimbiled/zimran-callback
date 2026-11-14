// Loading placeholders that mirror the final layouts, so nothing jumps when data arrives.

export function Sk({ className = "", dark = false }: { className?: string; dark?: boolean }) {
  return <span aria-hidden="true" className={`block ${dark ? "skeleton-d" : "skeleton"} ${className}`} />;
}

function Loading({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

/** Call brief: eyebrow, title, info rows, dark call panel. */
export function BriefSkeleton() {
  return (
    <Loading label="Loading the call brief…">
      <div className="mx-auto grid max-w-6xl gap-6 px-5 pb-32 pt-8 sm:py-10 lg:grid-cols-[1.2fr_1fr]">
        <div>
          <Sk className="h-4 w-32" />
          <Sk className="mt-4 h-11 w-4/5" />
          <Sk className="mt-2 h-11 w-1/2" />
          <Sk className="mt-4 h-5 w-64" />
          <div className="mt-6 space-y-4">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="grid grid-cols-[96px_1fr] gap-3 border-b border-line pb-3 sm:grid-cols-[130px_1fr]">
                <Sk className="h-4 w-20" />
                <Sk className="h-4 w-full" />
              </div>
            ))}
          </div>
          <Sk className="mt-6 h-28 w-full rounded-[20px]" />
        </div>
        <div className="rounded-3xl bg-panel p-6">
          <Sk dark className="h-4 w-36" />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Sk dark className="h-[68px] rounded-2xl" />
            <Sk dark className="h-[68px] rounded-2xl" />
          </div>
          <Sk dark className="mt-5 h-14 w-full rounded-full" />
          <Sk dark className="mx-auto mt-3 h-3 w-2/3" />
        </div>
      </div>
    </Loading>
  );
}

/** Debrief: score card + summary, stat tiles, criteria grid. */
export function DebriefSkeleton() {
  return (
    <Loading label="Loading the debrief…">
      <div className="mx-auto max-w-6xl space-y-5 px-5 py-10">
        <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
          <div className="card p-6">
            <Sk className="h-4 w-2/3" />
            <Sk className="mt-4 h-20 w-40" />
            <Sk className="mt-4 h-4 w-full" />
            <Sk className="mt-2 h-4 w-5/6" />
            <div className="mt-5 flex gap-2">
              <Sk className="h-11 w-40 rounded-full" />
              <Sk className="h-11 w-32 rounded-full" />
            </div>
          </div>
          <div className="card p-6">
            <Sk className="h-4 w-1/2" />
            {Array.from({ length: 3 }, (_, i) => (
              <Sk key={i} className="mt-4 h-12 w-full" />
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="card p-4">
              <Sk className="h-3 w-16" />
              <Sk className="mt-3 h-7 w-12" />
            </div>
          ))}
        </div>
        <Sk className="h-56 w-full rounded-[20px]" />
        <div className="grid gap-3 md:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="card p-5">
              <Sk className="h-4 w-28" />
              <Sk className="mt-3 h-4 w-full" />
              <Sk className="mt-2 h-4 w-4/5" />
            </div>
          ))}
        </div>
      </div>
    </Loading>
  );
}

/** Progress: stat tiles, chart, skill bars. */
export function ProgressSkeleton() {
  return (
    <Loading label="Loading your progress…">
      <div className="mx-auto max-w-6xl px-5 py-12">
        <Sk className="h-10 w-72" />
        <Sk className="mt-3 h-5 w-96 max-w-full" />
        <div className="mt-8 grid grid-cols-3 gap-3">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="card p-5">
              <Sk className="h-3 w-20" />
              <Sk className="mt-3 h-8 w-14" />
            </div>
          ))}
        </div>
        <Sk className="mt-5 h-56 w-full rounded-[20px]" />
        <div className="card mt-5 space-y-4 p-6">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="grid grid-cols-[120px_1fr] items-center gap-3">
              <Sk className="h-4 w-24" />
              <Sk className="h-3 w-full rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </Loading>
  );
}

/** Pricing: headline + four plan cards. */
export function PricingSkeleton() {
  return (
    <Loading label="Loading plans…">
      <div className="mx-auto max-w-6xl px-5 py-12">
        <Sk className="h-12 w-3/4" />
        <Sk className="mt-4 h-5 w-2/3" />
        <Sk className="mt-6 h-14 w-full rounded-2xl" />
        <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="card p-6">
              <Sk className="h-4 w-24" />
              <Sk className="mt-4 h-12 w-20" />
              <Sk className="mt-3 h-3 w-28" />
              {Array.from({ length: 3 }, (_, j) => (
                <Sk key={j} className="mt-3 h-3 w-full" />
              ))}
              <Sk className="mt-6 h-11 w-full rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </Loading>
  );
}
