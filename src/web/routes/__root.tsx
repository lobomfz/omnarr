import type { QueryClient } from '@tanstack/react-query'
import {
  Outlet,
  createRootRouteWithContext,
  Link,
} from '@tanstack/react-router'
import { Film } from 'lucide-react'

interface RouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootComponent,
})

function RootComponent() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Nav />
      <main className="px-4 sm:px-6 md:px-8 pb-20">
        <Outlet />
      </main>
    </div>
  )
}

function Nav() {
  return (
    <>
      <nav className="sticky top-4 z-50 mx-auto w-[95%] max-w-fit glass-liquid rounded-full shadow-2xl shadow-black/50 hidden md:flex items-center gap-1 px-4 py-2">
        <Link
          to="/"
          className="flex items-center gap-2 px-3 py-1.5 rounded-full focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <Film className="size-5 text-primary" />
          <span className="font-semibold tracking-tight">Omnarr</span>
        </Link>
        <div className="h-5 w-px bg-white/10" />
        <Link
          to="/"
          className="px-3 py-1.5 text-sm rounded-full transition-all duration-[var(--duration-fast)] [&.active]:bg-white/15 [&.active]:text-white text-muted-foreground hover:text-white hover:bg-white/5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          Library
        </Link>
      </nav>

      <nav className="sticky top-0 z-50 flex md:hidden items-center h-14 px-4 glass-liquid border-b border-white/10">
        <Link
          to="/"
          className="flex items-center gap-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <Film className="size-5 text-primary" />
          <span className="font-semibold tracking-tight">Omnarr</span>
        </Link>
      </nav>
    </>
  )
}
