import { ORPCError } from '@orpc/client'

import { ERROR_MAP } from '@/shared/errors'

export function formatRpcError(error: unknown) {
  if (error instanceof ORPCError) {
    const fallback = ERROR_MAP[error.code as keyof typeof ERROR_MAP]?.message ?? error.code
    const message = error.message === error.code ? fallback : error.message

    return new Error(message)
  }

  if (error instanceof Error) {
    return error
  }

  return new Error(String(error))
}
