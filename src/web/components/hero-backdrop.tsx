import { useState } from 'react'

import { cn } from '@/web/lib/cn'

export function HeroBackdrop(props: {
  backdropPath: string | null | undefined
  animated?: boolean
  children: React.ReactNode
}) {
  const [loaded, setLoaded] = useState(false)

  const backdropUrl = props.backdropPath
    ? `https://image.tmdb.org/t/p/w1280${props.backdropPath}`
    : null

  return (
    <section className="relative -mx-4 sm:-mx-6 md:-mx-8 -mt-14 md:-mt-16 h-[50vh] min-h-[380px] max-h-[600px] overflow-hidden">
      {backdropUrl && (
        <img
          src={backdropUrl}
          alt=""
          onLoad={() => setLoaded(true)}
          className={cn(
            'absolute inset-0 h-full w-full object-cover transition-opacity duration-700',
            loaded ? 'opacity-100' : 'opacity-0',
            props.animated && 'animate-ken-burns'
          )}
        />
      )}

      {!loaded && <div className="absolute inset-0 bg-white/5 animate-pulse" />}

      <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-[#050505]/60 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#050505]/80 via-transparent to-transparent" />

      <div className="absolute inset-0 flex items-end px-4 sm:px-6 md:px-8 pb-8 md:pb-12">
        {props.children}
      </div>
    </section>
  )
}
