export function PageSkeleton() {
  return (
    <>
      <div className="-mx-4 sm:-mx-6 md:-mx-8 -mt-14 md:-mt-16 h-[50vh] min-h-[380px] max-h-[600px] bg-white/5 animate-pulse" />
      <div className="max-w-5xl mx-auto pt-6">
        <div className="space-y-2">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="h-16 rounded-xl bg-white/5 animate-pulse" />
          ))}
        </div>
      </div>
    </>
  )
}
