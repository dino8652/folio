import { useState } from 'react'
import { currencyText, monthOffset, selectPeriod, spendingByCategory, type Ledger } from './ledger.ts'
import { ErrorText, messageOf, Modal } from './ui.tsx'

export function CapSuggestions({ ledger, month, demo, onClose, onApply }: {
  ledger: Ledger; month: string; demo: boolean; onClose: () => void
  onApply: (caps: Ledger['budgets']) => Promise<void>
}) {
  const [selected, setSelected] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const prior = selectPeriod(ledger.transactions, monthOffset(month, -1), 3)
  const provisional = !prior.length
  const history = provisional ? selectPeriod(ledger.transactions, month, 1) : prior
  const observedMonths = new Set(history.map(row => row.date.slice(0, 7))).size
  const suggestions = spendingByCategory(history)
    .filter(item => item.category !== 'Income' && !ledger.budgets.some(budget => budget.category === item.category))
    .map(item => ({ category: item.category, cents: Math.max(1, Math.round(item.cents / observedMonths * .95)) }))

  async function apply() {
    setBusy(true)
    setError('')
    try { await onApply(suggestions.filter(item => selected.includes(item.category))) }
    catch (cause) { setError(messageOf(cause)) }
    finally { setBusy(false) }
  }

  return <Modal title="Suggested spending caps" subtitle={provisional ? 'A starting point from this month’s imported spending.' : 'Based on up to three earlier months. Existing caps are kept.'} onClose={onClose} busy={busy}>
    <div className="form-stack">
      <p className="field-hint">{provisional ? 'These provisional caps use this month’s spending, reduced by 5%. A partial statement may understate a full month. Adjust your caps as more activity arrives.' : 'Suggestions are 5% below your average across imported months.'}</p>
      {suggestions.length ? <div className="ai-preview">{suggestions.map(item =>
        <label className="check cap-check" key={item.category}>
          <input type="checkbox" checked={selected.includes(item.category)} disabled={demo || busy} onChange={event => {
            const checked = event.target.checked
            setSelected(values => checked ? [...values, item.category] : values.filter(value => value !== item.category))
          }} />
          <span>{item.category}</span><strong>{currencyText(item.cents, ledger.currency)}</strong>
        </label>,
      )}</div> : <p>No new caps to suggest. Import expenses or edit your existing caps on the Budgets page.</p>}
      {demo && <p className="field-hint">Create a private vault to save caps for your own spending.</p>}
      <ErrorText error={error} />
      {!demo && suggestions.length > 0 && <div className="form-actions"><button className="primary" data-tone="peach" disabled={busy || !selected.length} onClick={apply}>{busy ? 'Saving…' : 'Save selected caps'}</button></div>}
    </div>
  </Modal>
}
