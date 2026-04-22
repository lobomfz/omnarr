import { cn } from '@/web/lib/cn'

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 80 80"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('shrink-0', className)}
      aria-hidden="true"
    >
      <rect x="2" y="35" width="76" height="10" rx="2" fill="currentColor" />
      <rect x="35" y="2" width="10" height="76" rx="2" fill="currentColor" />
      <rect
        x="35"
        y="2"
        width="10"
        height="76"
        rx="2"
        fill="#4F6BF0"
        transform="rotate(45 40 40)"
      />
    </svg>
  )
}
