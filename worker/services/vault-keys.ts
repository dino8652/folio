import type { Env } from '../types.ts'
import { ApiError } from '../http.ts'
const decode = (text: string) => Uint8Array.from(atob(text), c => c.charCodeAt(0))
const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
// This format must remain compatible with existing accounts. The auth secret is also
// the wrapping-key root; changing it requires an explicit key rewrapping migration.
export async function workspaceKey(env: Env, userId: string) {
  const material = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(env.BETTER_AUTH_SECRET + ':folio-vault-keys'))
  const key = await crypto.subtle.importKey('raw', material, 'AES-GCM', false, ['encrypt', 'decrypt'])
  const aad = new TextEncoder().encode(userId)
  let row = await env.DB.prepare('SELECT iv, cipher FROM vault_keys WHERE user_id = ?').bind(userId).first<{iv: string; cipher: string}>()
  if (!row) {
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const secret = crypto.getRandomValues(new Uint8Array(32))
    const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad }, key, secret))
    await env.DB.prepare('INSERT OR IGNORE INTO vault_keys(user_id, iv, cipher) VALUES (?, ?, ?)').bind(userId, encode(iv), encode(cipher)).run()
    // Concurrent first opens must all return the winning key, never their candidate.
    row = await env.DB.prepare('SELECT iv, cipher FROM vault_keys WHERE user_id = ?').bind(userId).first<{iv: string; cipher: string}>()
  }
  if (!row) throw new ApiError(503, 'WORKSPACE_UNAVAILABLE', 'Your workspace could not be opened. Try again.')
  try {
    return encode(new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode(row.iv), additionalData: aad }, key, decode(row.cipher))))
  } catch { throw new ApiError(503, 'KEY_UNAVAILABLE', 'Your workspace key is unavailable. Your saved data has not been changed.') }
}
