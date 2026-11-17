import QRCode from 'qrcode'
import { useEffect, useState } from 'react'
import { accountAuth } from './account-auth.ts'
import { api, getCapabilities, type Capabilities } from './data/api.ts'
import { ErrorText, messageOf } from './ui.tsx'
export function AccountSecurity() {
  const [enabled, setEnabled] = useState<boolean>(), [capabilities, setCapabilities] = useState<Capabilities>()
  const [password, setPassword] = useState(''), [code, setCode] = useState('')
  const [setup, setSetup] = useState<{totpURI: string; backupCodes: string[]}>()
  const [qr, setQr] = useState('')
  useEffect(() => { let active = true; setQr(''); if (setup) void QRCode.toDataURL(setup.totpURI, { width: 224, margin: 2 }).then(value => { if (active) setQr(value) }).catch(() => setError('Could not render the QR code. Use the setup key below.')); return () => { active = false } }, [setup])
  const [editing, setEditing] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('')
  useEffect(() => {
    let active = true
    void Promise.all([api<{user: {twoFactorEnabled: boolean}}>('/api/session'), getCapabilities()]).then(([session, caps]) => {
      if (active) { setEnabled(session.user.twoFactorEnabled); setCapabilities(caps) }
    }).catch(cause => { if (active) setError(messageOf(cause)) })
    return () => { active = false }
  }, [])
  async function act(action: 'enable' | 'verify' | 'disable') {
    setBusy(true); setError(''); setNotice('')
    try {
      if (action === 'enable') {
        const result = await accountAuth.twoFactor.enable({password})
        if (result.error) throw new Error(result.error.message)
        if (result.data && 'totpURI' in result.data) setSetup(result.data)
        setPassword('')
      } else if (action === 'verify') {
        const result = await accountAuth.twoFactor.verifyTotp({code})
        if (result.error) throw new Error(result.error.message)
        setEnabled(true); setCode(''); setSetup(undefined); setEditing(false); setNotice('Authenticator verification is enabled for future sign-ins.')
      } else {
        const result = await accountAuth.twoFactor.disable({password})
        if (result.error) throw new Error(result.error.message)
        setEnabled(false); setPassword(''); setEditing(false); setNotice('Authenticator verification is disabled.')
      }
    } catch (cause) { setError(messageOf(cause)) } finally { setBusy(false) }
  }
  return <section className="panel section-panel account-security"><div className="panel-heading"><div><h2>Account & connections</h2><p>Security and services for your workspace.</p></div></div>
    <div className="setting-row"><div><strong>Authenticator verification</strong><p>{enabled === undefined ? 'Checking account security…' : enabled ? 'A code is required when you sign in.' : 'Add a second factor to your account sign-in.'}</p></div><button className="quiet" disabled={enabled === undefined || busy} onClick={() => { setEditing(!editing); setError('') }}>{editing ? 'Close' : enabled ? 'Manage 2FA' : 'Set up 2FA'}</button></div>
    {editing && <div className="form-stack authenticator-setup">
      {!setup ? <><label>Current password<input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} /></label><button className="primary" disabled={busy || !password} onClick={() => void act(enabled ? 'disable' : 'enable')}>{busy ? 'Please wait…' : enabled ? 'Disable authenticator' : 'Set up authenticator'}</button></> : <>
        <h3>1. Add Folio to your authenticator</h3>{qr && <img className="authenticator-qr" src={qr} alt="Scan this QR code with your authenticator app" />}<p>Scan the code, or enter this setup key manually:</p><code style={{overflowWrap: 'anywhere'}}>{new URL(setup.totpURI).searchParams.get('secret')}</code>
        <h3>2. Save your recovery codes</h3><p>Keep these somewhere private. Each works once if you lose your authenticator.</p><pre style={{whiteSpace: 'pre-wrap'}}>{setup.backupCodes.join('\n')}</pre>
        <label>Authenticator code<input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={e => setCode(e.target.value)} /></label>
        <button className="primary" disabled={busy || !/^\d{6}$/.test(code)} onClick={() => void act('verify')}>Verify and enable</button>
      </>}
    </div>}
    <ErrorText error={error}/>{notice && <p role="status">{notice}</p>}
    {capabilities?.connectors.map(connector => <div className="setting-row" key={connector.id}><div><strong>{connector.label}</strong><p>{connector.detail}</p></div><span className={`connection-status ${connector.available ? 'ready' : 'pending'}`}>{connector.available ? 'Available' : 'Not configured'}</span></div>)}
  </section>
}
