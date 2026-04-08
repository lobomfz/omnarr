export function ReleasesSkeleton() {
  return (
    <div className="space-y-2">
      <div className="flex gap-2 mb-4">
        {Array.from({ length: 3 }, (_, i) => (
          <div
            key={i}
            className="h-6 w-20 rounded-full bg-white/5 animate-pulse"
          />
        ))}
      </div>
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="h-16 rounded-lg bg-white/5 animate-pulse" />
      ))}
    </div>
  )
}
