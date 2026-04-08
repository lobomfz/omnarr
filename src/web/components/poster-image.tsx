import { Film } from 'lucide-react'
import { useState } from 'react'

import { cn } from '@/web/lib/cn'

type ImageStatus = 'loading' | 'loaded' | 'error'

export function PosterImage(props: {
  posterPath: string | null
  title: string
  className?: string
}) {
  const [status, setStatus] = useState<ImageStatus>('loading')

  const src = props.posterPath
    ? `https://image.tmdb.org/t/p/w300${props.posterPath}`
    : null

  if (!src || status === 'error') {
    return (
      <div
        className={cn(
          'flex items-center justify-center bg-white/5 text-muted-foreground',
          props.className
        )}
      >
        <Film className="size-10" />
      </div>
    )
  }

  return (
    <div className={cn('relative bg-white/5', props.className)}>
      {status === 'loading' && (
        <div className="absolute inset-0 animate-pulse bg-white/5" />
      )}
      <img
        src={src}
        alt={props.title}
        loading="lazy"
        onLoad={() => setStatus('loaded')}
        onError={() => setStatus('error')}
        className={cn(
          'h-full w-full object-cover transition-opacity duration-300',
          status === 'loaded' ? 'opacity-100' : 'opacity-0'
        )}
      />
    </div>
  )
}
