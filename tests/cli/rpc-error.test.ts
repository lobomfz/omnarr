import { describe, expect, test } from 'bun:test'

import { ORPCError } from '@orpc/client'

import { formatRpcError } from '@/cli/rpc-error'

describe('formatRpcError', () => {
  test('maps a known ORPC code to its friendly message', () => {
    const result = formatRpcError(new ORPCError('TRACK_NOT_FOUND'))

    expect(result.message).toBe('Track not found')
  })

  test('returns the explicit error message when set', () => {
    const result = formatRpcError(
      new ORPCError('TRACK_NOT_FOUND', { message: 'custom override' })
    )

    expect(result.message).toBe('custom override')
  })

  test('falls back to the raw code for unknown ORPC codes', () => {
    const result = formatRpcError(new ORPCError('CUSTOM_UNKNOWN'))

    expect(result.message).toBe('CUSTOM_UNKNOWN')
  })

  test('passes through plain Error instances unchanged', () => {
    const raw = new Error('boom')
    const result = formatRpcError(raw)

    expect(result).toBe(raw)
  })

  test('wraps non-error values in an Error', () => {
    const result = formatRpcError('panic-string')

    expect(result).toBeInstanceOf(Error)
    expect(result.message).toBe('panic-string')
  })
})
