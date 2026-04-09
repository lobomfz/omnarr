import { ORPCError } from '@orpc/client'
import { AlertCircle } from 'lucide-react'

import { ERROR_MAP } from '@/shared/errors'

function isKnownCode(code: string): code is keyof typeof ERROR_MAP {
  return code in ERROR_MAP
}

export function QueryErrorFallback(props: { error: Error }) {
  const message =
    props.error instanceof ORPCError && isKnownCode(props.error.code)
      ? ERROR_MAP[props.error.code]
      : props.error.message

  return (
    <div className="flex flex-col items-center justify-center min-h-[30vh] gap-3 text-center mt-4">
      <div className="rounded-2xl border border-white/10 bg-muted/50 p-5">
        <AlertCircle className="size-8 text-destructive" />
      </div>
      <div className="space-y-1">
        <p className="text-base font-medium">Something went wrong</p>
        <p className="text-sm text-muted-foreground max-w-sm">{message}</p>
      </div>
    </div>
  )
}
