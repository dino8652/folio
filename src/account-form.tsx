import { getCapabilities, type Capabilities } from './data/api.ts'
import { useEffect, useState, type FormEvent } from 'react'
import { ArrowRight, Eye, EyeOff, Mail, Check, LockKeyhole } from 'lucide-react'
import { accountAuth, openAccountWorkspace } from './account-auth'
import { ErrorText } from './ui'

export function AccountForm({ create, onAuthenticated }: { create: boolean; onAuthenticated: (password: string, uid: string, email: string) => Promise<void> }) {
  const [capabilities, setCapabilities] = useState<Capabilities>()
  const [challenge, setChallenge] = useState(false), [code, setCode] = useState(''), [backup, setBackup] = useState(false)
  useEffect(() => { let active = true; void getCapabilities().then(value => { if (active) setCapabilities(value) }).catch(() => {}); return () => { active = false } }, [])
  const [email, setEmail] = useState(''), [password, setPassword] = useState('')
  const [invalid, setInvalid] = useState<'email' | 'password'>()
  const [show, setShow] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [notice, setNotice] = useState(''), [reset, setReset] = useState(false)
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (challenge) {
      setBusy(true); setError('')
      try {
        const result = backup ? await accountAuth.twoFactor.verifyBackupCode({code}) : await accountAuth.twoFactor.verifyTotp({code})
        if (result.error) throw new Error(result.error.message || 'Check your verification code.')
        const workspace = await openAccountWorkspace()
        await onAuthenticated(workspace.key, workspace.user.id, workspace.user.email)
        setCode(''); setPassword('')
      } catch (cause) { setError(cause instanceof Error ? cause.message : 'Verification failed.') }
      finally { setBusy(false) }
      return
    }
    setInvalid(undefined)
    const fields = event.currentTarget
    const emailField = fields.querySelector<HTMLInputElement>('#account-email')
    const passwordField = fields.querySelector<HTMLInputElement>('#account-password')
    if (!email.trim() || emailField?.validity.typeMismatch) {
      setInvalid('email')
      setError('Enter a valid email address.')
      emailField?.focus()
      return
    }
    if (!reset && (!password || (create && password.length < 12))) {
      setInvalid('password')
      setError(password ? 'Use at least 12 characters for your password.' : 'Enter your password.')
      passwordField?.focus()
      return
    }
    setError(''); setNotice(''); setBusy(true)
    try {
      if (reset) {
        const result = await accountAuth.requestPasswordReset({ email: email.trim(), redirectTo: location.origin + '/reset-password' })
        if (result.error) throw new Error(result.error.message || 'Password reset is unavailable.')
        setNotice('If an account exists for this email, you’ll receive a reset link.'); return
      }
      const result = create
        ? await accountAuth.signUp.email({ email: email.trim(), password, name: email.trim().split('@')[0] })
        : await accountAuth.signIn.email({ email: email.trim(), password })
      if (result.error) throw new Error(result.error.message || 'Unable to sign in. Check your email and password.')
      if (result.data && 'twoFactorRedirect' in result.data && result.data.twoFactorRedirect) { setChallenge(true); setPassword(''); return }
      const workspace = await openAccountWorkspace()
      await onAuthenticated(workspace.key, workspace.user.id, workspace.user.email)
      setPassword('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to connect. Please try again.')
    } finally { setBusy(false) }
  }
  if (challenge) return <form noValidate className="form-stack account-form" onSubmit={submit}>
    <h3>Verify it’s you</h3><p>{backup ? 'Enter one of your saved recovery codes.' : 'Enter the six-digit code from your authenticator app.'}</p>
    <label>{backup ? 'Recovery code' : 'Authenticator code'}<input autoComplete="one-time-code" inputMode={backup ? 'text' : 'numeric'} value={code} onChange={e => setCode(e.target.value)} autoFocus /></label>
    <ErrorText error={error} /><button className="primary" disabled={busy || !code}>Verify and sign in</button>
    <button type="button" className="account-text-button" onClick={() => { setBackup(!backup); setCode(''); setError('') }}>{backup ? 'Use authenticator' : 'Use a recovery code'}</button>
  </form>
  return <form noValidate className="form-stack account-form" onSubmit={submit}>
    {reset && <div className="account-reset-copy"><h3>Reset your password</h3><p>{capabilities?.passwordReset ? 'We’ll email you a link to choose a new password.' : 'Email recovery has not been configured by Folio yet. Your current password is unchanged.'}</p></div>}
    <label htmlFor="account-email">Email address</label><div className="account-input"><Mail size={18}/><input id="account-email" aria-invalid={invalid === 'email'} aria-describedby={invalid === 'email' ? 'account-error' : undefined} type="email" autoComplete="username" placeholder="you@example.com" value={email} onChange={e=>setEmail(e.target.value)} required disabled={busy}/></div>
    {!reset && <><div className="password-label"><label htmlFor="account-password">Password</label>{!create && <button type="button" className="account-text-button" onClick={()=>{setReset(true);setError('');setNotice('');setPassword('')}}>Forgot password?</button>}</div><div className="account-input"><LockKeyhole size={18}/><input id="account-password" aria-invalid={invalid === 'password'} aria-describedby={invalid === 'password' ? 'account-error' : undefined} type={show?'text':'password'} autoComplete={create?'new-password':'current-password'} minLength={create?12:undefined} maxLength={128} placeholder={create?'Create a strong password':'Enter your password'} value={password} onChange={e=>setPassword(e.target.value)} required disabled={busy}/><button type="button" className="password-toggle" aria-label={show?'Hide password':'Show password'} aria-pressed={show} onClick={()=>setShow(!show)}>{show?<EyeOff size={19}/>:<Eye size={19}/>}</button></div>{create&&<p className="password-guidance"><Check size={14} className={password.length>=12?'met':''}/> At least 12 characters. A few memorable words work well.</p>}</>}
    <ErrorText id="account-error" error={error}/>{notice&&<p className="account-notice" role="status">{notice}</p>}
    <button className="primary auth-action" disabled={busy || (reset && !capabilities?.passwordReset)}>{busy?'Please wait…':reset?'Send reset link':create?'Create account':'Sign in'}<ArrowRight size={18}/></button>
    {reset&&<button type="button" className="account-text-button" onClick={()=>{setReset(false);setNotice('');setError('')}}>Back to sign in</button>}
    <p className="account-fine">Your account is managed by Folio. Only optional AI features need your own API key.</p>
  </form>
}
