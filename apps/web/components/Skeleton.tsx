/** ✨ Squelettes de chargement — shimmer Afterglow, fini les « … » nus. */

export function Skeleton({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={`skeleton ${className}`} style={style} aria-hidden />;
}

/** Chargement du feed : bandeau « Pour toi » + cartes de posts. */
export function FeedSkeleton() {
  return (
    <div className="px-3 pt-3">
      <div className="mb-3 flex gap-2.5">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-16 w-[76px] shrink-0 rounded-2xl" />
        ))}
      </div>
      {[0, 1].map((i) => (
        <div key={i} className="mb-4 rounded-3xl border border-border bg-surface p-3">
          <div className="flex items-center gap-2.5">
            <Skeleton className="h-9 w-9 rounded-full" />
            <div className="flex-1">
              <Skeleton className="h-3 w-24 rounded" />
              <Skeleton className="mt-1.5 h-2.5 w-16 rounded" />
            </div>
          </div>
          <Skeleton className="mt-3 aspect-[4/3] w-full rounded-2xl" />
        </div>
      ))}
    </div>
  );
}

/** Chargement d'une liste (messages, notifs). */
export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3 p-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-12 w-12 rounded-full" />
          <div className="flex-1">
            <Skeleton className="h-3.5 w-32 rounded" />
            <Skeleton className="mt-2 h-2.5 w-48 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}
