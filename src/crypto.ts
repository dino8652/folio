import type { VaultPasskey } from './passkey.ts'

export interface Envelope {
  version: 1
  revision: string
  salt: Uint8Array<ArrayBuffer>
  iv: Uint8Array<ArrayBuffer>
  cipher: ArrayBuffer
  passkey?: VaultPasskey
}

const encoder = new TextEncoder()
const iterations = 600_000

async function derive(password: string, salt: Envelope['salt'], secret?: Uint8Array) {
  const encoded = encoder.encode(password)
  const input = new Uint8Array(encoded.length + (secret?.length ?? 0))
  input.set(encoded)
  if (secret) input.set(secret, encoded.length)
  const material = await crypto.subtle.importKey('raw', input, 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, material,
    { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

const aad = (revision: string) => encoder.encode('folio-vault-v1:' + revision)

export async function seal<T>(key: CryptoKey, salt: Envelope['salt'], data: T, passkey?: VaultPasskey): Promise<Envelope> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const revision = crypto.randomUUID()
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad(revision) }, key, encoder.encode(JSON.stringify(data)))
  return { version: 1, revision, salt, iv, cipher, ...(passkey ? { passkey } : {}) }
}

export async function createEnvelope<T>(password: string, data: T, protection?: { factor: VaultPasskey; secret: Uint8Array }) {
  if (password.length < 14 || password.length > 512) throw new Error('Use a passphrase between 14 and 512 characters.')
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const key = await derive(password, salt, protection?.secret)
  return { key, record: await seal(key, salt, data, protection?.factor) }
}

export async function openEnvelope<T>(password: string, record: Envelope, secret?: Uint8Array) {
  if (record.version !== 1 || record.salt.byteLength !== 16 || record.iv.byteLength !== 12 || password.length > 512) throw new Error('Invalid vault.')
  if (Boolean(record.passkey) !== Boolean(secret)) throw new Error('A passkey is required for this vault.')
  const key = await derive(password, record.salt, secret)
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: record.iv, additionalData: aad(record.revision) }, key, record.cipher)
  return { key, data: JSON.parse(new TextDecoder().decode(plain)) as T }
}
