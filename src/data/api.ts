export class ServiceError extends Error {
  status: number; code: string; requestId?: string
  constructor(message: string, status: number, code: string, requestId?: string) { super(message); this.status = status; this.code = code; this.requestId = requestId }
}
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, { credentials: 'same-origin', cache: 'no-store', ...options,
      headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
      signal: options.signal ?? AbortSignal.timeout(15000),
    })
  } catch { throw new ServiceError('Could not reach Folio. Check your connection and try again.', 0, 'OFFLINE') }
  let result: Record<string, unknown>
  try { result = await response.json() } catch { throw new ServiceError('Folio returned an unreadable response. Please try again.', response.status, 'INVALID_RESPONSE') }
  if (!response.ok) throw new ServiceError(String(result.message || result.error || 'The request could not be completed.'), response.status, String(result.code || 'REQUEST_FAILED'), response.headers.get('X-Request-Id') || undefined)
  return result as T
}
export interface Capabilities {
  version: number; emailPassword: boolean; passwordReset: boolean; emailVerification: boolean
  twoFactor: boolean; phoneVerification: boolean; google: boolean; googleClientId: string
  connectors: { id: string; label: string; available: boolean; detail: string }[]
}
export const getCapabilities = () => api<Capabilities>('/api/account-capabilities')
