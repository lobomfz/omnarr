import { ORPCError } from '@orpc/client'

import { ERROR_MAP } from '@/shared/errors'

export function formatRpcError(error: unknown) {
  if (error instanceof ORPCError) {
    const isKnownCode = (code: string): code is keyof typeof ERROR_MAP =>
      code in ERROR_MAP
    const fallback = isKnownCode(error.code)
      ? ERROR_MAP[error.code].message
      : error.code
    const message = error.message === error.code ? fallback : error.message

    return new Error(message)
  }

  if (error instanceof Error) {
    return error
  }

  return new Error(String(error))
}
