import { AlertCircle, Check } from 'lucide-react'

import { cn } from '@/web/lib/cn'

export function Toast(props: {
  message: string
  type: 'success' | 'error'
  code: string
}) {
  return (
    <div
      data-component="toast"
      data-code={props.code}
      className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[200] animate-in fade-in duration-200"
    >
      <div
        className={cn(
          'rounded-full px-4 py-2.5 text-sm font-medium shadow-2xl backdrop-blur-md border flex items-center gap-2',
          props.type === 'success'
            ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
            : 'bg-destructive/15 text-destructive border-destructive/30'
        )}
      >
        {props.type === 'success' ? (
          <Check className="size-4" />
        ) : (
          <AlertCircle className="size-4" />
        )}
        {props.message}
      </div>
    </div>
  )
}
