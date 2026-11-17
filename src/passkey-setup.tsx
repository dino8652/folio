import { useState } from 'react'
import { ErrorText, messageOf, Modal } from './ui.tsx'

export function PasskeySetup({ busy, onEnable, onClose, accountOwned }: {
  accountOwned?: boolean; busy: boolean; onEnable: (password: string) => Promise<void>; onClose: () => void
}) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const ipPreview = location.hostname === '127.0.0.1' || location.hostname === '[::1]'
  const localhost = new URL(location.href)
  localhost.hostname = 'localhost'
  return <Modal title="Enable two-factor unlock" onClose={onClose} busy={busy}>
    <form className="form-stack" onSubmit={async event => {
      event.preventDefault()
      setError('')
      try { await onEnable(password) }
      catch (cause) { setError(messageOf(cause)) }
    }}>
      <p>{accountOwned ? "Your account and registered passkey will both be required to open this vault. Keep your passkey safe; it cannot be recovered by resetting your password." : "Unlocking will require your passphrase and a compatible passkey. Keep access to both. Folio has no recovery copy."}</p>
      {ipPreview ? <p className="field-hint">Passkeys need localhost or a named HTTPS host. The localhost preview uses a separate vault. <a className="quiet" href={localhost.href}>Open localhost preview ↗</a></p> : <>
      {!accountOwned && <label>Vault passphrase<input type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required /></label>}
      <ErrorText error={error} />
      <div className="form-actions"><button className="primary" data-tone="lime" disabled={busy}>{busy ? 'Setting up…' : 'Register passkey'}</button></div>
      </>}
    </form>
  </Modal>
}
