import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react'
import { accountAuth, openAccountWorkspace } from './account-auth.ts'
import { WorkspaceRepository } from './data/workspace.ts'
import { ServiceError } from './data/api.ts'
import { readRecord } from './storage.ts'
import type { Currency, Ledger } from './ledger.ts'
export function useVault() {
  const repository = useRef(new WorkspaceRepository()).current
  const [status, setStatus] = useState<'loading' | 'sample' | 'locked' | 'open' | 'unavailable'>('loading')
  const [ledger, setLedger] = useState<Ledger | null>(null)
  const [legacyAvailable, setLegacyAvailable] = useState(false)
  const [passkeyEnabled, setPasskeyEnabled] = useState(false)
  const [accountOwned, setAccountOwned] = useState(false)
  const [pending, setPending] = useState(0)
  const [workspaceId, setWorkspaceId] = useState(0)
  const [error, setError] = useState('')
  const channel = useRef<BroadcastChannel | null>(null)
  const mounted = useRef(true)
  const generation = useRef(0)

  const display = useCallback(() => {
    if (!mounted.current) return
    const active = repository.current
    setLedger(active?.ledger ?? null)
    setPasskeyEnabled(Boolean(active?.record.passkey))
    setAccountOwned(Boolean(active?.owner))
    if (active) { setStatus('open'); setError('') }
  }, [repository])
  const clear = useCallback((next: 'locked' | 'sample') => {
    generation.current++; repository.close()
    setLedger(null); setPasskeyEnabled(false); setAccountOwned(false); setStatus(next); setWorkspaceId(value => value + 1)
  }, [repository])
  async function operation<T>(run: () => Promise<T>) {
    setPending(n => n + 1)
    try { return await run() } finally { if (mounted.current) setPending(n => n - 1) }
  }
  const lock = useCallback(() => {
    const owner = repository.current?.owner
    sessionStorage.setItem('folio-explicit-lock', '1')
    clear('locked')
    channel.current?.postMessage({ type: 'locked', owner })
    if (owner) void accountAuth.signOut().catch(() => {})
  }, [clear, repository])
  async function authenticate(password: string, currency: Currency, owner?: string, email?: string) {
    await operation(async () => {
      await repository.open(password, currency, owner, email, status === 'sample')
      sessionStorage.removeItem('folio-explicit-lock')
      display()
    })
  }
  const restore = useEffectEvent(async () => {
    const attempt = generation.current
    try {
      if (!crypto.subtle) throw new Error('Use HTTPS or localhost to open your encrypted workspace.')
      const legacy = await readRecord()
      if (!mounted.current || attempt !== generation.current) return
      setLegacyAvailable(Boolean(legacy))
      if (sessionStorage.getItem('folio-explicit-lock')) { setStatus('locked'); return }
      let workspace: Awaited<ReturnType<typeof openAccountWorkspace>>
      try { workspace = await openAccountWorkspace() }
      catch (cause) {
        if (cause instanceof ServiceError && cause.status === 401) { if (mounted.current && attempt === generation.current) setStatus(legacy ? 'locked' : 'sample'); return }
        throw cause
      }
      if (!mounted.current || attempt !== generation.current) return
      await repository.open(workspace.key, 'SGD', workspace.user.id, workspace.user.email)
      if (attempt === generation.current) display()
    } catch (cause) {
      if (mounted.current && attempt === generation.current) {
        setError(cause instanceof Error ? cause.message : 'Your workspace could not be opened. Your data has not been changed.')
        setStatus('unavailable')
      }
    }
  })
  useEffect(() => {
    mounted.current = true
    void restore()
    return () => { mounted.current = false; generation.current++; repository.close() }
  }, [repository])
  useEffect(() => {
    if (!('BroadcastChannel' in window)) return
    const connection = new BroadcastChannel('folio-vault-changes')
    channel.current = connection
    connection.onmessage = event => {
      const active = repository.current
      if (active && event.data?.owner === active.owner && ['locked', 'deleted'].includes(event.data?.type)) {
        sessionStorage.setItem('folio-explicit-lock', '1'); clear(event.data.type === 'deleted' ? 'sample' : 'locked')
      }
    }
    return () => { connection.close(); channel.current = null }
  }, [clear, repository])
  useEffect(() => {
    if (!ledger) return
    let deadline = Date.now() + ledger.lockMinutes * 60000
    let timeout: ReturnType<typeof setTimeout>
    const check = () => { if (Date.now() >= deadline) lock() }
    const activity = () => {
      if (Date.now() >= deadline) { lock(); return }
      deadline = Date.now() + ledger.lockMinutes * 60000
      clearTimeout(timeout); timeout = setTimeout(check, ledger.lockMinutes * 60000)
    }
    timeout = setTimeout(check, ledger.lockMinutes * 60000)
    window.addEventListener('pointerdown', activity); window.addEventListener('keydown', activity); document.addEventListener('visibilitychange', check)
    return () => { clearTimeout(timeout); window.removeEventListener('pointerdown', activity); window.removeEventListener('keydown', activity); document.removeEventListener('visibilitychange', check) }
  }, [ledger?.lockMinutes, Boolean(ledger), lock])
  async function update(transform: (current: Ledger) => Ledger) {
    await operation(async () => { await repository.update(transform); display() })
  }
  async function enablePasskey(password: string) {
    await operation(async () => { await repository.protect(password); display() })
  }
  async function erase() {
    await operation(async () => {
      const owner = repository.current?.owner
      await repository.erase()
      sessionStorage.setItem('folio-explicit-lock', '1')
      if (owner) await accountAuth.signOut().catch(() => {})
      channel.current?.postMessage({ type: 'deleted', owner })
      clear('sample')
    })
  }
  return { legacyAvailable, accountOwned, ledger, status, error, busy: pending > 0, workspaceId, lock, authenticate, update, erase, passkeyEnabled, enablePasskey }
}
