import { useState } from 'react'
import { api } from './data/api.ts'
import { ErrorText, messageOf } from './ui.tsx'
export function PhoneVerification({ phone, available, onVerified }: {phone: string; available: boolean; onVerified: (at: string) => void}) {
  const [sent, setSent] = useState(false), [code, setCode] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('')
  async function submit() {
    setBusy(true); setError('')
    try {
      if (sent) {
        const result = await api<{verifiedAt: string}>('/api/phone/check', {method: 'POST', body: JSON.stringify({phone, code})})
        onVerified(result.verifiedAt)
      } else {
        await api('/api/phone/send', {method: 'POST', body: JSON.stringify({phone})}); setSent(true)
      }
    } catch (cause) { setError(messageOf(cause)) } finally { setBusy(false) }
  }
  if (!available) return <p className="field-hint">SMS verification is not configured by Folio yet. You can continue without a phone number.</p>
  return <div className="form-stack">
    {sent && <label>SMS code<input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={event => setCode(event.target.value)} /></label>}
    <ErrorText error={error} />
    <button type="button" className="quiet" disabled={busy || !phone || (sent && !code)} onClick={() => void submit()}>{busy ? 'Please wait…' : sent ? 'Verify number' : 'Send verification code'}</button>
  </div>
}
