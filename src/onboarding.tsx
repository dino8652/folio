import { PhoneVerification } from './phone-verification.tsx'
import { getCapabilities, type Capabilities } from './data/api.ts'
import { customDirectory, ModelDirectory } from './model-directory'
import { googleClientId } from './account-auth'
import { useEffect, useState, type FormEvent } from 'react'
import type { Connections } from './ledger.ts'
import { ErrorText, messageOf, Modal } from './ui.tsx'

const steps = ['Profile', 'Google', 'AI provider', 'Model', 'Ready'] as const

export function Onboarding({ current, onClose, onSave, passkeyEnabled, email }: {
  email?: string; current?: Connections; onClose: () => void; onSave: (connections: Connections, addPasskey: boolean) => Promise<void>; passkeyEnabled: boolean
}) {
  const [step, setStep] = useState(0)
  const [capabilities, setCapabilities] = useState<Capabilities>()
  useEffect(() => { let active = true; void getCapabilities().then(caps => { if (active) { setCapabilities(caps); setDraft(value => ({ ...value, googleClientId: caps.googleClientId })) } }).catch(() => {}); return () => { active = false } }, [])
  const [draft, setDraft] = useState<Connections>(current ?? { email: email ?? '', phone: '', googleClientId, provider: 'gemini', model: '', endpoint: '', key: '' })
  const [addPasskey, setAddPasskey] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  function field<K extends keyof Connections>(name: K, value: Connections[K]) {
    setDraft(previous => ({ ...previous, [name]: value }))
  }
  async function next(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    if (step === 0 && event.currentTarget.querySelector<HTMLInputElement>('input[type="email"]')?.validity.typeMismatch) {
      setError('Enter a valid email address.')
      return
    }
    if (step === 2 && draft.key && draft.provider === 'custom') {
      try { customDirectory(draft.endpoint) }
      catch (cause) { setError(messageOf(cause)); return }
    }
    if (step === 2 && !draft.key) { setStep(4); return }
    if (step === 3 && !new FormData(event.currentTarget).get('directory-model')) { setError('Choose a model to continue.'); return }
    if (step < steps.length - 1) { setStep(step + 1); return }
    setBusy(true)
    setError('')
    try { await onSave(draft, addPasskey) }
    catch (cause) { setError(messageOf(cause)) }
    finally { setBusy(false) }
  }

  return <Modal title="Set up Folio" subtitle="A few preferences, then you’re ready. Connections are optional." onClose={onClose} busy={busy}>
    <ol className="onboarding-steps">{steps.map((label, index) => <li key={label} aria-current={step === index ? 'step' : undefined}>{label}</li>)}</ol>
    <form noValidate className="form-stack" onSubmit={next}>
      <div className="form-stack onboarding-step" key={step}>
        {step === 0 && <>
          <label>Email<input type="email" autoComplete="email" value={draft.email} onChange={event => field('email', event.target.value)} /></label>
          <label>Mobile number<input type="tel" autoComplete="tel" placeholder="+65…" value={draft.phone} onChange={event => {
            field('phone', event.target.value.trim()); field('phoneVerifiedAt', undefined)
          }} /></label>
          <PhoneVerification key={draft.phone} phone={draft.phone} available={Boolean(capabilities?.phoneVerification)} onVerified={at => field('phoneVerifiedAt', at)} />{draft.phoneVerifiedAt && <p className="positive">Phone number verified</p>}
          {passkeyEnabled ? <p className="positive">Two-factor unlock enabled</p> : <label className="check compact">
            <input type="checkbox" checked={addPasskey} onChange={event => setAddPasskey(event.target.checked)} /> Set up passkey two-factor unlock
          </label>}
        </>}
        {step === 1 && <>
          <div className="setup-ready"><h3>Connect your receipts</h3><p>{capabilities?.google ? 'Gmail is available. When you open a transaction, choose Receipts to authorize read-only access to your mailbox.' : 'Gmail connection is not available yet. You can still import statements and attach receipts.'}</p><p>Your mailbox is optional. Continue now and connect it later from your workspace.</p></div>
        </>}
        {step === 2 && <>
          <label>Provider<select value={draft.provider} onChange={event => { field('provider', event.target.value as Connections['provider']); field('key', ''); field('model', '') }}>
            <option value="gemini">Gemini</option><option value="openai">OpenAI</option><option value="openrouter">OpenRouter</option><option value="custom">Custom OpenAI-compatible</option>
          </select></label>
          {draft.provider === 'custom' && <label>Chat completions endpoint<input type="url" value={draft.endpoint} onChange={event => { field('endpoint', event.target.value); field('key', ''); field('model', '') }} /></label>}
          <label>AI API key<input type="password" autoComplete="off" value={draft.key} onChange={event => { field('key', event.target.value.trim()); field('model', '') }} /></label>
          <p className="field-hint">Folio encrypts this key inside your vault and sends it directly to your provider to load models and generate recaps. Leave it blank to skip AI setup.</p>
        </>}
        {step === 3 && <ModelDirectory provider={draft.provider} apiKey={draft.key} endpoint={draft.endpoint}
          value={draft.model} onChange={model => { field('model', model); setError('') }} />}
        {step === 4 && <>
          <div className="setup-ready"><h2>Make it your own.</h2><p>Your workspace starts empty. Import your first statement to see your spending, then open a transaction to explore its merchant.</p><p>Merchant discovery is included: Folio automatically searches websites and photos through Firecrawl. No extra key needed.</p><p>Only merchant names and your search location are sent for discovery. Your AI provider still uses your own key.</p></div>
        </>}
      </div>
      <ErrorText error={error} />
      <div className="form-actions">
        {step > 0 && <button type="button" className="quiet" disabled={busy} onClick={() => { setError(''); setStep(step === 4 && !draft.key ? 2 : step - 1) }}>Back</button>}
        <button className="primary" data-tone="lime" disabled={busy}>{busy ? 'Saving…' : step === steps.length - 1 ? 'Open my workspace' : 'Continue'}</button>
      </div>
    </form>
  </Modal>
}
