import { useState, type FormEvent } from 'react'
import { accountAuth } from './account-auth.ts'
import { ErrorText, messageOf } from './ui.tsx'
export function ResetPassword({token}: {token: string}) {
  const [password, setPassword] = useState(''), [show, setShow] = useState(false), [busy, setBusy] = useState(false), [done, setDone] = useState(false), [error, setError] = useState('')
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('')
    if (password.length < 12) { setError('Use at least 12 characters for your password.'); return }
    setBusy(true)
    try { const result = await accountAuth.resetPassword({newPassword: password, token}); if (result.error) throw new Error(result.error.message); setDone(true); setPassword('') }
    catch (cause) { setError(messageOf(cause)) } finally { setBusy(false) }
  }
  return <main className="lock-screen"><div className="lock-card panel"><h1>{done ? 'Password updated' : 'Choose a new password'}</h1>
    {done ? <a className="primary" href="/#signin">Return to sign in</a> : <form className="form-stack" noValidate onSubmit={submit}><label>New password<input type={show ? 'text' : 'password'} autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} /></label><button type="button" className="quiet" onClick={() => setShow(!show)}>{show ? 'Hide password' : 'Show password'}</button><ErrorText error={error}/><button className="primary" disabled={busy || !token}>Save password</button></form>}
  </div></main>
}
