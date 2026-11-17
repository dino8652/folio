import { useEffect, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { parseAmount } from './statement'
import { ErrorText, messageOf } from './ui'
import { inspectFile } from './import-file.ts'
import { currencyText, dateText, type Ledger, type Statement, type StatementBalance } from './ledger.ts'

export function StatementBalances({ ledger, month, onSetStartingBalance }: {
  ledger: Ledger; month: string; onSetStartingBalance: (id: string, cents?: number) => Promise<void>
}) {
  const [recovered, setRecovered] = useState<Record<string, StatementBalance | null>>({})
  useEffect(() => {
    let active = true
    async function recover() {
      for (const doc of ledger.documents) {
        if (!active) break
        if (doc.type !== 'pdf' || doc.balance || !doc.source || doc.id in recovered) continue
        let balance: StatementBalance | null = null
        try {
          const bytes = Uint8Array.from(atob(doc.source), char => char.charCodeAt(0))
          balance = (await inspectFile(new File([bytes], doc.name), 'DMY', false)).balance ?? null
        } catch { /* This PDF cannot provide a verified statement balance. */ }
        if (active) setRecovered(current => ({ ...current, [doc.id]: balance }))
      }
    }
    void recover()
    return () => { active = false }
  }, [ledger.documents]) 

  const latest = new Map<string, { doc: Statement; balance: StatementBalance }>()
  for (const doc of ledger.documents) {
    const balance = doc.balance ?? recovered[doc.id]
    if (!balance || balance.currency !== ledger.currency || balance.end.slice(0, 7) > month) continue
    const previous = latest.get(doc.accountId)
    if (!previous || balance.end >= previous.balance.end) latest.set(doc.accountId, { doc, balance })
  }
  if (!latest.size) return null
  return <section className="statement-balances" aria-label="Bank statement balances">
    {ledger.accounts.map(account => {
      const statement = latest.get(account.id)
      return statement && <BalancePair key={statement.doc.id} {...statement} account={account.name}
        onSave={cents => onSetStartingBalance(statement.doc.id, cents)} />
    })}
  </section>
}

function BalancePair({ account, doc, balance, onSave }: {
  account: string; doc: Statement; balance: StatementBalance; onSave: (cents?: number) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  async function save(cents?: number) {
    setSaving(true)
    setError('')
    try { await onSave(cents); setEditing(false) }
    catch (cause) { setError(messageOf(cause)) }
    finally { setSaving(false) }
  }
  return <div className="statement-balance">
    <div className="statement-balance-header"><strong>{account}</strong><span>Statement through {dateText(balance.end)}</span></div>
    <div className="statement-balance-pair">
      <div><span>{doc.startingBalance === undefined ? 'Starting balance' : 'Your starting value'}</span>
        <strong>{currencyText(doc.startingBalance ?? balance.opening, balance.currency)}</strong></div>
      <ArrowRight size={19} aria-hidden="true" />
      <div><span>Ending balance</span><strong>{currencyText(balance.closing, balance.currency)}</strong></div>
    </div>
    {doc.startingBalance !== undefined && <p>Bank statement opening balance {currencyText(balance.opening, balance.currency)}</p>}
    {editing ? <form className="form-stack" onSubmit={event => {
      event.preventDefault()
      const cents = parseAmount(value)
      if (cents === null) { setError('Enter a valid starting value.'); return }
      void save(cents)
    }}>
      <label>Starting value ({balance.currency})<input inputMode="decimal" value={value} required onChange={event => setValue(event.target.value)} /></label>
      <ErrorText error={error} />
      <div className="form-actions">
        {doc.startingBalance !== undefined && <button type="button" className="quiet" disabled={saving} onClick={() => void save()}>Use bank opening</button>}
        <button type="button" className="quiet" disabled={saving} onClick={() => setEditing(false)}>Cancel</button>
        <button className="primary" disabled={saving}>Save starting value</button>
      </div>
    </form> : <button type="button" className="statement-start-edit" onClick={() => {
      setValue(((doc.startingBalance ?? balance.opening) / 100).toFixed(2))
      setError('')
      setEditing(true)
    }}>Edit starting value</button>}
  </div>
}
