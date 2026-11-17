import { useState, type ReactNode } from 'react'
import { ArrowUpRight, ArrowLeft, LockKeyhole } from 'lucide-react'
import './landing.css'
import { AccountForm } from './account-form'
import { LandingExperience } from './landing-experience.tsx'

export function Landing({ exists, auth, onAuthenticated, legacy }: { exists: boolean; legacy?: boolean; auth: ReactNode; onAuthenticated: (password: string, uid: string, email: string) => Promise<void> }) {
  const [mode, setMode] = useState<'signup' | 'signin'>()
  return <main className="landing">
    <header className="landing-nav"><a href="#" aria-label="Folio home" onClick={() => setMode(undefined)}><img src="/folio.svg" width="58" height="58" alt="Folio" /></a><nav aria-label="Welcome"><a href="#how-it-works" onClick={() => setMode(undefined)}>How it works</a><button onClick={() => setMode('signin')}>Sign in <ArrowUpRight size={17} /></button></nav></header>
    {mode ? <section className="entry-layout">
      <div className="entry-intro"><button className="entry-back" onClick={() => setMode(undefined)}><ArrowLeft size={17} /> Back</button><div className="entry-intro-copy"><h1>{mode === 'signup' ? 'Make room\nfor clarity.' : 'A little clarity.\nWelcome back.'}</h1><p>A private place for the details that make up your financial life.</p><div className="entry-security"><LockKeyhole size={18} /><span>Encrypted. On your device.</span></div></div></div>
      <div className="entry-form" data-ui><h2>{mode === 'signup' ? 'Sign up for Folio' : 'Sign in to Folio'}</h2><p>{mode === 'signup' ? 'A clearer picture starts here. Create your account, then we’ll help you settle in.' : 'Good to see you again. Sign in to pick up where you left off.'}</p>
      <AccountForm key={mode} create={mode === 'signup'} onAuthenticated={onAuthenticated} />
      {legacy && mode === 'signin' && <details className="legacy-vault"><summary>Unlock a vault from the earlier version</summary><p>This only opens your existing local vault. It does not sign in to an online account.</p>{auth}</details>}

      <p className="entry-alternate">{mode === 'signup' ? 'Already have an account?' : 'Starting fresh?'} <button onClick={() => setMode(mode === 'signup' ? 'signin' : 'signup')}>{mode === 'signup' ? 'Sign in' : 'Sign up'}</button></p></div>
    </section> : <LandingExperience exists={exists} start={() => { setMode(exists ? 'signin' : 'signup'); window.scrollTo(0, 0) }} />}

  </main>
}
