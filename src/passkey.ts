export interface VaultPasskey {
  id: ArrayBuffer
  salt: Uint8Array<ArrayBuffer>
}

const random = () => crypto.getRandomValues(new Uint8Array(32))

export async function readPasskey(factor: VaultPasskey) {
  const credential = await navigator.credentials.get({
    publicKey: {
      challenge: random(),
      allowCredentials: [{ type: 'public-key', id: factor.id }],
      userVerification: 'required',
      timeout: 60_000,
      extensions: { prf: { eval: { first: factor.salt } } },
    },
  })
  if (!(credential instanceof PublicKeyCredential)) throw new Error('Verify with your Folio passkey to continue.')
  const result = credential.getClientExtensionResults().prf?.results?.first
  if (!result || result.byteLength !== 32) throw new Error('This passkey could not supply the vault encryption factor.')
  return result instanceof ArrayBuffer
    ? new Uint8Array(result)
    : new Uint8Array(result.buffer, result.byteOffset, result.byteLength)
}

export async function registerPasskey() {
  if (location.hostname === '127.0.0.1' || location.hostname === '[::1]') {
    throw new Error('Passkeys need localhost or a named HTTPS host.')
  }
  if (!window.PublicKeyCredential) throw new Error('This browser does not support passkeys.')
  const salt = random()
  const credential = await navigator.credentials.create({
    publicKey: {
      challenge: random(),
      rp: { name: 'Folio' },
      user: { id: random(), name: 'folio-vault', displayName: 'Folio private vault' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
      timeout: 60_000,
      attestation: 'none',
      extensions: { prf: { eval: { first: salt } } },
    },
  })
  if (!(credential instanceof PublicKeyCredential) || !credential.getClientExtensionResults().prf?.enabled) {
    throw new Error('Choose a passkey or security key that supports WebAuthn PRF.')
  }
  const factor = { id: credential.rawId, salt }
  const secret = await readPasskey(factor)
  return { factor, secret }
}
