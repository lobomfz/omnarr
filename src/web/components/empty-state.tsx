import { Film } from 'lucide-react'

export function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center">
      <div className="relative">
        <div className="absolute inset-0 bg-primary/20 blur-3xl rounded-full" />
        <div className="relative rounded-3xl border border-white/10 shadow-2xl bg-muted/50 p-8">
          <Film className="size-16 text-muted-foreground" />
        </div>
      </div>
      <div className="space-y-2">
        <h2 className="text-2xl sm:text-3xl font-light tracking-tight">
          Your library is empty
        </h2>
        <p className="text-muted-foreground text-lg max-w-md leading-relaxed">
          Search for media and add it to your library using the CLI to see it
          here.
        </p>
      </div>
    </div>
  )
}
