import { cn } from '@/web/lib/cn'

export function Tooltip(props: {
  content: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        'group/tooltip relative inline-flex min-w-0',
        props.className
      )}
    >
      {props.children}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 max-w-xs rounded-lg bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-lg border border-white/10 opacity-0 transition-opacity duration-[var(--duration-fast)] group-hover/tooltip:opacity-100 whitespace-normal break-words z-50"
      >
        {props.content}
      </span>
    </span>
  )
}
