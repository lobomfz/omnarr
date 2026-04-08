export function PageSkeleton() {
  return (
    <>
      <div className="-mx-4 sm:-mx-6 md:-mx-8 -mt-14 md:-mt-16 h-[50vh] min-h-[380px] max-h-[600px] bg-white/5 animate-pulse" />
      <div className="pt-8 md:pt-12">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4 sm:gap-6">
          {Array.from({ length: 10 }, (_, i) => (
            <div key={i}>
              <div className="aspect-[2/3] rounded-xl bg-white/5 animate-pulse" />
              <div className="mt-2 space-y-1.5 px-0.5">
                <div className="h-4 w-3/4 rounded bg-white/5 animate-pulse" />
                <div className="h-3 w-1/3 rounded bg-white/5 animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
