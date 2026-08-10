// Loading skeleton for /admin/activity — shows before the SSR data resolves.
export default function ActivityLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading activity">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-9">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-card border border-white/5 bg-white/[0.03]" />
        ))}
      </div>
      <div className="h-10 w-full max-w-sm animate-pulse rounded border border-white/5 bg-white/[0.03]" />
      <div className="overflow-hidden rounded-card border border-amber-500/15 bg-white/[0.02]">
        <div className="h-12 animate-pulse border-b border-white/5 bg-white/[0.03]" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-14 animate-pulse border-b border-white/5 bg-white/[0.02]" />
        ))}
      </div>
    </div>
  );
}