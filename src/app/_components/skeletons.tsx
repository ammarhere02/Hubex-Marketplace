// Loading placeholders shown by the route loading.tsx files while server data streams in.
export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="mm-spinner-wrap" role="status">
      <span className="mm-spinner" />
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function GridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div className="mm-grid" aria-busy>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="card mm-card">
          <div className="mm-card-img mm-skel" />
          <div className="mm-card-body">
            <div className="mm-skel mm-skel-line" />
            <div className="mm-skel mm-skel-line w-50" />
            <div className="mm-skel mm-skel-line w-25 mt-3" />
          </div>
        </div>
      ))}
    </div>
  );
}
