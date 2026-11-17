export class ApiError extends Error {
  status: number; code: string; retryAfter?: number
  constructor(status: number, code: string, message: string, retryAfter?: number) { super(message); this.status = status; this.code = code; this.retryAfter = retryAfter }
}
export function json(value: unknown, status = 200, headers: Record<string, string> = {}) {
  return Response.json(value, { status, headers: { 'Cache-Control': 'no-store', ...headers } })
}
export function failure(error: unknown, requestId: string) {
  const known = error instanceof ApiError
  const status = known ? error.status : 500
  const message = known ? error.message : 'Folio could not finish this request. Please try again.'
  return json({ error: message, message, code: known ? error.code : 'INTERNAL_ERROR', requestId }, status,
    known && error.retryAfter ? { 'Retry-After': String(error.retryAfter) } : {})
}
export function secure(response: Response, requestId: string) {
  const result = new Response(response.body, response)
  result.headers.set('X-Request-Id', requestId)
  result.headers.set('X-Content-Type-Options', 'nosniff')
  result.headers.set('Referrer-Policy', 'no-referrer')
  result.headers.set('Cache-Control', 'no-store')
  return result
}
export function method(request: Request, allowed: string[]) {
  if (!allowed.includes(request.method)) throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'This request method is not supported.')
}
export function isLocal(origin: string) {
  const url = new URL(origin)
  return ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
}
export function trustedOrigins(origin: string, configured?: string) {
  const canonical = configured || origin
  return isLocal(origin) ? [canonical, origin, 'http://127.0.0.1:4173', 'http://127.0.0.1:4174', 'http://localhost:4174'] : [canonical]
}
export function requireOrigin(request: Request, configured?: string) {
  if (!trustedOrigins(new URL(request.url).origin, configured).includes(request.headers.get('origin') || '')) {
    throw new ApiError(403, 'INVALID_ORIGIN', 'This request must come from Folio.')
  }
}
export async function readJson(request: Request, max = 4096): Promise<Record<string, unknown>> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new ApiError(415, 'JSON_REQUIRED', 'Send this request as JSON.')
  if (Number(request.headers.get('content-length')) > max) throw new ApiError(413, 'REQUEST_TOO_LARGE', 'This request is too large.')
  const reader = request.body?.getReader()
  if (!reader) throw new ApiError(400, 'INVALID_JSON', 'A JSON body is required.')
  const chunks: Uint8Array[] = []; let length = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > max) { await reader.cancel(); throw new ApiError(413, 'REQUEST_TOO_LARGE', 'This request is too large.') }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  const bytes = new Uint8Array(length); let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
  try {
    const parsed = JSON.parse(new TextDecoder().decode(bytes))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error()
    return parsed
  } catch { throw new ApiError(400, 'INVALID_JSON', 'The request body is not a JSON object.') }
}
export function requiredText(value: unknown, label: string, max: number) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max || /[\u0000-\u001f]/.test(value)) throw new ApiError(400, 'INVALID_INPUT', `${label} must contain 1–${max} characters.`)
  return value.trim()
}
