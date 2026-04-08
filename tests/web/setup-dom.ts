import { GlobalRegistrator } from '@happy-dom/global-registrator'

import { envVariables } from '@/lib/env'

const bunFetch = globalThis.fetch
const bunResponse = globalThis.Response
const bunRequest = globalThis.Request
const bunHeaders = globalThis.Headers
const bunFormData = globalThis.FormData
const bunWebSocket = globalThis.WebSocket
const bunAbortController = globalThis.AbortController
const bunAbortSignal = globalThis.AbortSignal
const bunBlob = globalThis.Blob
const bunFile = globalThis.File
const bunReadableStream = globalThis.ReadableStream

GlobalRegistrator.register({
  url: `http://localhost:${envVariables.OMNARR_PORT}`,
})

globalThis.fetch = bunFetch
globalThis.Response = bunResponse
globalThis.Request = bunRequest
globalThis.Headers = bunHeaders
globalThis.FormData = bunFormData
globalThis.WebSocket = bunWebSocket
globalThis.AbortController = bunAbortController
globalThis.AbortSignal = bunAbortSignal
globalThis.Blob = bunBlob
globalThis.File = bunFile
globalThis.ReadableStream = bunReadableStream
