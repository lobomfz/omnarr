export function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
      <h2 className="text-2xl font-light tracking-tight">
        Your library is empty
      </h2>
      <p className="text-muted-foreground mt-2 max-w-sm leading-relaxed">
        Search for something to get started.
      </p>
    </div>
  )
}
