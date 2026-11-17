import { AccountSecurity } from './account-security.tsx'
import { TransactionLookup } from './transaction-lookup.tsx'
import { useMemo, useState, type FormEvent } from 'react'
import { ArrowDownToLine, ArrowDownUp, ArrowRight, CircleAlert, Coffee, CreditCard, FileText, Film, HeartPulse, House, Landmark, LockKeyhole, Pencil, Plane, Plus, ReceiptText, Search, ShoppingBag, ShoppingBasket, TrainFront, Trash2, Wallet, X, SlidersHorizontal, Zap } from 'lucide-react'
import { categories, currencyText, dateText, spendingByCategory, totals, unusual, type Account, type Category, type Ledger, type Statement, type Transaction } from './ledger.ts'
import { parseAmount } from './statement.ts'
import { Empty, ErrorText, messageOf, Modal } from './ui.tsx'

export type Update = (transform: (data: Ledger) => Ledger) => Promise<void>

const symbols = {
  'Housing': House, 'Food & groceries': ShoppingBasket, 'Dining': Coffee, 'Shopping': ShoppingBag,
  'Transport': TrainFront, 'Bills & utilities': Zap, 'Entertainment': Film, 'Health': HeartPulse,
  'Travel': Plane, 'Other': ReceiptText, 'Income': Wallet, 'Other deposits': Landmark, 'Transfer': ArrowDownUp,
}

export function ActivityTable({ rows, ledger, onEdit, empty, showAccount = true }: {
  rows: Transaction[]; ledger: Ledger; onEdit: (row: Transaction) => void; empty: string; showAccount?: boolean
}) {
  if (!rows.length) return <Empty>{empty}</Empty>
  const accounts = new Map(ledger.accounts.map(account => [account.id, account.name]))
  return <div className="table-wrap"><table className="activity-table"><thead><tr>
    <th scope="col">Transaction</th><th scope="col">Category</th><th scope="col">Date</th>{showAccount && <th scope="col" className="account-cell">Account</th>}<th scope="col">Amount</th>
  </tr></thead><tbody>
    {rows.map(row => {
      const Icon = symbols[row.category] ?? ReceiptText
      return <tr key={row.id}>
        <td><button className="transaction-name" onClick={() => onEdit(row)}><span className="transaction-icon" data-category={row.category}><Icon size={17} /></span>
          <span><strong>{row.description}</strong>{row.review && <small className="row-flag">Review extraction</small>}</span></button></td>
        <td><span className="category-tag">{row.category}</span></td><td className="neutral">{dateText(row.date, { month: 'short', day: 'numeric', year: 'numeric' })}</td>
        {showAccount && <td className="account-cell neutral">{accounts.get(row.accountId) ?? 'Unknown'}</td>}
        <td className={row.cents > 0 ? 'money positive' : 'money'}>{row.cents > 0 ? '+' : ''}{currencyText(row.cents, ledger.currency)}</td>
      </tr>
    })}
  </tbody></table></div>
}

export function Transactions({ ledger, initialCategory, initialAccount, onEdit, focusSearch, initialFrom, initialTo }: {
  ledger: Ledger; initialCategory: string; initialAccount: string; onEdit: (row: Transaction) => void; focusSearch: boolean; initialFrom: string; initialTo: string
}) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState(initialCategory)
  const [account, setAccount] = useState(initialAccount)
  const [from, setFrom] = useState(initialFrom)
  const [to, setTo] = useState(initialTo ? new Date(Date.parse(initialTo) - 86400000).toISOString().slice(0, 10) : '')
  const [flow, setFlow] = useState('')
  const [needsReview, setNeedsReview] = useState(false)
  const [sort, setSort] = useState('new')
  const [page, setPage] = useState(0)
  const filtered = useMemo(() => ledger.transactions.filter(row => {
    const term = query.trim().toLowerCase()
    return (!term || [row.description, row.original, row.category, row.date].some(value => value.toLowerCase().includes(term))) &&
      (!category || row.category === category) && (!account || row.accountId === account) &&
      (!flow || (flow === 'income' ? row.cents > 0 : row.cents < 0)) && (!needsReview || row.review) && (!from || row.date >= from) && (!to || row.date <= to)
  }).sort((a, b) => sort === 'amount' ? Math.abs(b.cents) - Math.abs(a.cents) :
    sort === 'old' ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date)), [account, category, flow, from, to, ledger.transactions, needsReview, query, sort])
  const { income, otherDeposits, spending, transfersIn, transfersOut, net } = totals(filtered)
  const totalPages = Math.max(1, Math.ceil(filtered.length / 25))
  const current = Math.min(page, totalPages - 1)
  const [showFilters, setShowFilters] = useState(Boolean(initialFrom || initialTo))
  const extraFilters = Number(Boolean(from || to)) + Number(Boolean(flow)) + Number(needsReview)
  return <div className="transactions-layout">
    <section className="panel transaction-search" aria-label="Find transactions">
      <div className="transaction-search-main">
        <div className="transaction-search-field">
          <Search size={20} aria-hidden="true" />
          <input type="text" autoFocus={focusSearch} value={query} onChange={event => { setQuery(event.target.value); setPage(0) }} placeholder="Search merchants, descriptions, or dates" aria-label="Search transactions" />
          {query && <button type="button" className="icon-button" aria-label="Clear search" onClick={() => { setQuery(''); setPage(0) }}><X size={17} /></button>}
        </div>
        <button type="button" className="quiet transaction-filter-toggle" data-tone="sky" aria-expanded={showFilters} aria-controls="transaction-extra-filters" onClick={() => setShowFilters(value => !value)}>
          <SlidersHorizontal size={17} /> Filters{extraFilters > 0 && <span>{extraFilters}</span>}
        </button>
      </div>
      <div className="transaction-filter-grid">
        <label>Category<select aria-label="Filter by category" value={category} onChange={event => { setCategory(event.target.value); setPage(0) }}><option value="">All categories</option>{categories.map(item => <option key={item}>{item}</option>)}</select></label>
        <label>Account<select aria-label="Filter by account" value={account} onChange={event => { setAccount(event.target.value); setPage(0) }}><option value="">All accounts</option>{ledger.accounts.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      </div>
      <div id="transaction-extra-filters" className="transaction-extra-filters" hidden={!showFilters}>
        <div className="transaction-filter-grid">
          <label>From <input type="date" value={from} onChange={event => { setFrom(event.target.value); setPage(0) }} /></label>
          <label>Through <input type="date" value={to} onChange={event => { setTo(event.target.value); setPage(0) }} /></label>
          <label>Direction<select aria-label="Filter by direction" value={flow} onChange={event => { setFlow(event.target.value); setPage(0) }}><option value="">Money in & out</option><option value="income">Money in</option><option value="spend">Money out</option></select></label>
        </div>
        <div className="transaction-filter-footer">
          <label className="check compact"><input type="checkbox" checked={needsReview} onChange={event => { setNeedsReview(event.target.checked); setPage(0) }} /> Needs review</label>
          <button type="button" className="quiet" disabled={!from && !to} onClick={() => { setFrom(''); setTo(''); setPage(0) }}>Clear dates</button>
        </div>
      </div>
    </section>
    <section className="panel table-panel transaction-results" aria-labelledby="transaction-results-title">
      <div className="transaction-results-heading">
        <h2 id="transaction-results-title">Results</h2>
        <select aria-label="Sort transactions" value={sort} onChange={event => { setSort(event.target.value); setPage(0) }}><option value="new">Newest first</option><option value="old">Oldest first</option><option value="amount">Largest first</option></select>
      </div>
    <dl className="transaction-totals" aria-label="Totals for filtered transactions">
      <div><dt>Matching transactions</dt><dd>{filtered.length.toLocaleString()}</dd></div>
      <div><dt>Earned income</dt><dd>{currencyText(income, ledger.currency)}</dd></div>
      <div><dt>Spending</dt><dd>{currencyText(spending, ledger.currency)}</dd></div>
      <div><dt>Other deposits</dt><dd>{currencyText(otherDeposits, ledger.currency)}</dd></div>
      <div><dt>Net cash flow</dt><dd className={net < 0 ? 'warn' : 'positive'}>{currencyText(net, ledger.currency)}</dd></div>
    </dl>
    {(transfersIn > 0 || transfersOut > 0) && <p className="transfer-summary">Transfers · {currencyText(transfersIn, ledger.currency)} in · {currencyText(transfersOut, ledger.currency)} out</p>}
    <ActivityTable rows={filtered.slice(current * 25, current * 25 + 25)} ledger={ledger} onEdit={onEdit} empty={ledger.transactions.length ? 'No transactions match these filters.' : 'Import a statement to see your transactions here.'} />
    {filtered.length > 0 && <div className="pagination"><span>{current * 25 + 1}–{Math.min((current + 1) * 25, filtered.length)} of {filtered.length}</span><div>
      <button className="quiet" onClick={() => setPage(current - 1)} disabled={current === 0}>Previous</button><button className="quiet" onClick={() => setPage(current + 1)} disabled={current + 1 >= totalPages}>Next</button>
    </div></div>}
    </section>
  </div>
}

export function Insights({ ledger, rows, month, onEdit }: { ledger: Ledger; rows: Transaction[]; month: string; onEdit: (row: Transaction) => void }) {
  const flags = unusual(ledger.transactions, month)
  const category = spendingByCategory(rows)[0]
  return <section className="panel insight-panel">
    <div className="panel-heading"><div><h2>Spending insights</h2><p>Patterns from your statements</p></div></div>
    {category && <div className="insight-item"><strong>{category.category === 'Other' ? 'Your expenses need categories' : `${category.category} led your spending`}</strong><p>{currencyText(category.cents, ledger.currency)} {category.category === 'Other' ? 'has not been classified. Open the spending breakdown to categorize these transactions.' : 'in this period.'}</p></div>}
    {flags.length ? flags.slice(0, 4).map(row => <button className="insight-item insight-link" key={row.id} onClick={() => onEdit(row)}>
      <span><strong>{row.description}</strong><small>{currencyText(-row.cents, ledger.currency)} vs. typical {currencyText(row.median, ledger.currency)} in {row.category.toLowerCase()}.</small></span><ArrowRight size={16} /></button>)
      : <div className="insight-item"><strong>No comparison available</strong><p>Unusual-spending comparisons need enough categorized expenses from earlier months. This is not an all-clear on your spending.</p></div>}
  </section>
}

export function Budgets({ ledger, rows, onSet, onRemove, month }: { ledger: Ledger; rows: Transaction[]; onSet: () => void; onRemove: (category: Category) => void; month: string }) {
  const spending = new Map(spendingByCategory(rows).map(item => [item.category, item.cents]))
  return <section className="panel section-panel"><div className="panel-heading"><div><h2>Category budgets</h2><p>{dateText(month, { month: 'long', year: 'numeric' })} spending against your monthly limits</p></div><button className="primary" data-tone="peach" onClick={onSet}><Plus size={16} /> Set budget</button></div>
    {ledger.budgets.length ? <div className="budget-list">{ledger.budgets.map(budget => {
      const spent = spending.get(budget.category) ?? 0
      const remaining = budget.cents - spent
      return <div className="budget-item" key={budget.category}><div className="budget-title"><strong>{budget.category}</strong>
        <button className="icon-button" aria-label={`Remove ${budget.category} budget`} onClick={() => onRemove(budget.category)}><Trash2 size={17} /></button></div>
        <progress className={remaining < 0 ? 'over-budget' : ''} aria-label={`${budget.category} budget used`} value={Math.min(spent, budget.cents)} max={budget.cents} />
        <div className="budget-amount"><span>{currencyText(spent, ledger.currency)} of {currencyText(budget.cents, ledger.currency)}</span><strong className={remaining < 0 ? 'warn' : 'positive'}>{currencyText(Math.abs(remaining), ledger.currency)} {remaining < 0 ? 'over' : 'left'}</strong></div>
      </div>
    })}</div> : <Empty>Choose a spending category and set a monthly limit.</Empty>}
  </section>
}

export function Accounts({ ledger, onAdd, onSee }: { ledger: Ledger; onAdd: () => void; onSee: (id: string) => void }) {
  return <section className="panel section-panel"><div className="panel-heading"><div><h2>Bank accounts</h2><p>Accounts organize statements and keep duplicate checks separate.</p></div><button className="primary" data-tone="sky" onClick={onAdd}><Plus size={16} /> Add account</button></div>
    {ledger.accounts.length ? <div className="data-list">{ledger.accounts.map(account => <article className="data-row" key={account.id}>
      <span className="row-icon" data-tone="sky">{account.kind === 'Credit card' ? <CreditCard size={21} /> : <Landmark size={21} />}</span><div><strong>{account.name}</strong><p>{account.bank} · {account.kind} · {ledger.currency}</p></div>
      <span className="neutral list-count">{ledger.transactions.filter(row => row.accountId === account.id).length} transactions</span><button className="quiet" data-tone="sky" onClick={() => onSee(account.id)}>View activity <ArrowRight size={16} /></button>
    </article>)}</div> : <Empty>Add an account now or create one during your first statement import.</Empty>}
  </section>
}

export function Documents({ ledger, onImport, onDelete, onForgetSource }: {
  ledger: Ledger; onImport: () => void; onDelete: (doc: Statement) => void; onForgetSource: (doc: Statement) => void
}) {
  function download(doc: Statement) {
    if (!doc.source) return
    const text = atob(doc.source)
    const raw = Uint8Array.from(text, character => character.charCodeAt(0))
    const url = URL.createObjectURL(new Blob([raw], { type: 'application/octet-stream' }))
    const link = document.createElement('a')
    link.href = url
    link.download = doc.name
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return <section className="panel section-panel"><div className="panel-heading"><div><h2>Imported statements</h2><p>Manage statement records and any encrypted originals you kept.</p></div><button className="primary" data-tone="lime" onClick={onImport}><Plus size={16} /> Import statement</button></div>
    {ledger.documents.length ? <div className="data-list">{[...ledger.documents].reverse().map(doc => <article className="data-row document-row" key={doc.id}>
      <span className="row-icon" data-tone="violet"><FileText size={21} /></span><div><strong>{doc.name}</strong><p>{ledger.accounts.find(item => item.id === doc.accountId)?.name} · {doc.type.toUpperCase()} · {dateText(doc.importedAt)}{doc.source ? ' · Original kept' : ''}</p></div>
      <span className="neutral list-count">{ledger.transactions.filter(item => item.documentId === doc.id).length} transactions</span>
      <div className="data-actions">{doc.source && <><button className="icon-button" onClick={() => download(doc)} aria-label={`Download ${doc.name}`}><ArrowDownToLine size={18} /></button>
        <button className="quiet" onClick={() => onForgetSource(doc)}>Remove original</button></>}
        <button className="icon-button danger-icon" aria-label={`Delete ${doc.name}`} onClick={() => onDelete(doc)}><Trash2 size={18} /></button></div>
    </article>)}</div> : <Empty>Imported statements will appear here.</Empty>}
  </section>
}

export function Settings({ ledger, isSample, onAuth, onLock, onRetention, onTimeout, onErase, busy, accountOwned }: {
  ledger: Ledger; isSample: boolean; onAuth: () => void; onLock: () => void; onRetention: (days: number) => void;
  onTimeout: (minutes: number) => Promise<void>; onErase: () => void; busy: boolean; accountOwned: boolean
}) {
  const [error, setError] = useState('')
  return <div className="settings-grid">
    {accountOwned && <AccountSecurity />}
    <section className="panel section-panel"><div className="panel-heading"><div><h2>Vault security</h2><p>This browser profile stores your encrypted vault.</p></div></div>
      <div className="setting-row"><div><strong>{isSample ? 'Sample workspace' : 'Encryption'}</strong><p>{isSample ? 'Create a private vault to use your own statements.' : 'AES-256-GCM encryption. Your financial data stays on this device.'}</p></div>
        <button className="quiet" data-tone="mint" onClick={isSample ? onAuth : onLock}><LockKeyhole size={16} /> {isSample ? 'Create vault' : 'Lock now'}</button></div>
      <div className="setting-row"><div><strong>Auto-lock</strong><p>Lock after a period without keyboard or pointer activity.</p></div>
        <select aria-label="Auto-lock timeout" value={ledger.lockMinutes} disabled={busy} onChange={event => { setError(''); void onTimeout(Number(event.target.value)).catch(cause => setError(messageOf(cause))) }}>
          <option value={1}>1 minute</option><option value={5}>5 minutes</option><option value={15}>15 minutes</option><option value={30}>30 minutes</option>
        </select></div>
      <ErrorText error={error} />
    </section>
    <section className="panel section-panel"><div className="panel-heading"><div><h2>Data retention</h2><p>Expired data is removed when the vault opens or saves.</p></div></div>
      <div className="setting-row"><div><strong>Keep records for</strong><p>Retention uses transaction dates. Related originals may be removed too.</p></div>
        <select aria-label="Retention duration" value={ledger.retention} onChange={event => onRetention(Number(event.target.value))}>
          <option value={0}>Until I delete them</option><option value={30}>30 days</option><option value={90}>90 days</option><option value={365}>1 year</option>
        </select></div>
      <div className="setting-row"><div><strong>Delete this vault</strong><p>Remove all accounts, budgets, transactions, and saved statements from this browser.</p></div>
        <button className="quiet danger" onClick={onErase}><Trash2 size={16} /> Delete vault</button></div>
    </section>
  </div>
}

export function EditTransaction({ row, ledger, update, onClose, onDone, sample }: {
  row: Transaction; ledger: Ledger; update: Update; onClose: () => void; onDone: () => void; sample: boolean
}) {
  const [description, setDescription] = useState(row.description)
  const [category, setCategory] = useState(row.category)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!description.trim()) { setError('Enter a transaction description.'); return }
    setBusy(true); setError('')
    try {
      await update(current => ({ ...current, transactions: current.transactions.map(item => item.id === row.id ? { ...item, description: description.trim(), category, categoryEdited: item.categoryEdited || category !== item.category, review: false } : item) }))
      onDone()
    } catch (cause) { setError(messageOf(cause)) }
    finally { setBusy(false) }
  }
  const [receipt, setReceipt] = useState(row.receipt)
  const [receiptError, setReceiptError] = useState('')
  async function changeReceipt(file?: File) {
    if (busy) return
    setReceiptError('')
    if (file && (file.size > 2_000_000 || !/^(application\/pdf|image\/(jpeg|png|webp))$/.test(file.type))) {
      setReceiptError('Choose a PDF, JPEG, PNG or WebP file under 2 MB.')
      return
    }
    setBusy(true)
    try {
      let next: Transaction['receipt']
      if (file) {
        const bytes = new Uint8Array(await file.arrayBuffer())
        const chunks: string[] = []
        for (let index = 0; index < bytes.length; index += 8192) {
          chunks.push(String.fromCharCode(...bytes.subarray(index, index + 8192)))
        }
        next = { name: file.name, source: btoa(chunks.join('')) }
      }
      await update(current => ({
        ...current,
        transactions: current.transactions.map(item => item.id === row.id ? { ...item, receipt: next } : item),
      }))
      setReceipt(next)
    } catch (cause) { setReceiptError(messageOf(cause)) }
    finally { setBusy(false) }
  }
  function downloadReceipt() {
    if (!receipt) return
    const raw = Uint8Array.from(atob(receipt.source), character => character.charCodeAt(0))
    const url = URL.createObjectURL(new Blob([raw], { type: 'application/octet-stream' }))
    const link = document.createElement('a')
    link.href = url
    link.download = receipt.name
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const Icon = symbols[row.category] ?? ReceiptText
  const expense = row.cents < 0 && row.category !== 'Transfer'
  const account = ledger.accounts.find(item => item.id === row.accountId)?.name
  return <Modal fullscreen title="Transaction details" onClose={onClose} busy={busy}>
    <div className="transaction-detail-layout">
      <div className="transaction-detail-hero">
        <div className="transaction-merchant">
          <span className="transaction-icon" data-category={row.category}><Icon size={27} /></span>
          <div><span className="transaction-detail-category">{row.category}</span><h3>{row.description}</h3></div>
        </div>
        <div className="transaction-detail-amount"><strong>{currencyText(row.cents, ledger.currency)}</strong><span>{ledger.currency} · {dateText(row.date)}</span></div>
      </div>
      <div className="transaction-detail-grid">
        <div className="transaction-detail-main">
          {expense && <TransactionLookup row={row} googleClientId={ledger.connections?.googleClientId} />}

        </div>
        <section className="panel transaction-detail-card transaction-record">
          <header><span className="transaction-tool-icon record"><ReceiptText size={19} /></span><div><h3>Ledger record</h3><p>{account ?? 'Statement activity'}</p></div></header>
          {sample ? <dl className="transaction-record-meta"><div><dt>Statement description</dt><dd>{row.original}</dd></div><div><dt>Category</dt><dd>{row.category}</dd></div></dl> :
            <form className="form-stack" onSubmit={submit}>
              {row.review && <div className="inline-note"><CircleAlert size={18} /><p>Compare this extraction with the original statement before marking it reviewed.</p></div>}
              <label>Description<input required value={description} maxLength={240} onChange={event => setDescription(event.target.value)} /></label>
              <label>Category<select value={category} onChange={event => setCategory(event.target.value as Category)}>{categories.map(item => <option key={item}>{item}</option>)}</select></label>
              <dl className="transaction-record-meta"><div><dt>Statement description</dt><dd>{row.original}</dd></div></dl>
              <ErrorText error={error} />
              <div className="form-actions"><button className="primary" data-tone="mint" disabled={busy}><Pencil size={16} /> {row.review ? 'Save & mark reviewed' : 'Save changes'}</button></div>
            </form>}
          {expense && !sample && <div className="transaction-receipt-file form-stack">
            <h3>Receipt file</h3>
            {receipt && <div className="transaction-receipt-actions">
              <button className="quiet" data-tone="violet" disabled={busy} onClick={downloadReceipt}><ArrowDownToLine size={16} /> Download receipt</button>
              <button className="icon-button" aria-label="Remove receipt" disabled={busy} onClick={() => void changeReceipt()}><Trash2 size={16} /></button>
            </div>}
            <label>{receipt ? 'Replace receipt' : 'Attach a receipt'}<input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" disabled={busy} onChange={event => {
              const file = event.currentTarget.files?.[0]
              event.currentTarget.value = ''
              if (file) void changeReceipt(file)
            }} /></label>
            <p className="field-hint">{receipt ? receipt.name : 'PDF or photo, up to 2 MB. Stored in your encrypted vault.'}</p>
            <ErrorText error={receiptError} />
          </div>}
        </section>
      </div>
    </div>
  </Modal>
}

export function AddAccount({ onClose, onAdd }: { onClose: () => void; onAdd: (account: Account) => Promise<void> }) {
  const [name, setName] = useState('')
  const [bank, setBank] = useState('')
  const [kind, setKind] = useState('Current')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!name.trim() || !bank.trim()) { setError('Enter an account name and bank.'); return }
    setBusy(true); setError('')
    try { await onAdd({ id: crypto.randomUUID(), name: name.trim(), bank: bank.trim(), kind }) }
    catch (cause) { setError(messageOf(cause)) }
    finally { setBusy(false) }
  }
  return <Modal title="Add a bank account" onClose={onClose} busy={busy}><form className="form-stack" onSubmit={submit}>
    <label>Account name<input value={name} onChange={event => setName(event.target.value)} maxLength={65} required /></label>
    <label>Bank<input value={bank} onChange={event => setBank(event.target.value)} maxLength={65} required /></label>
    <label>Account type<select value={kind} onChange={event => setKind(event.target.value)}>{['Current', 'Savings', 'Credit card', 'Other'].map(item => <option key={item}>{item}</option>)}</select></label>
    <ErrorText error={error} /><div className="form-actions"><button type="button" className="quiet" onClick={onClose} disabled={busy}>Cancel</button><button className="primary" data-tone="sky" disabled={busy}>Add account</button></div>
  </form></Modal>
}

export function SetBudget({ ledger, onClose, onSet }: { ledger: Ledger; onClose: () => void; onSet: (category: Category, cents: number) => Promise<void> }) {
  const [category, setCategory] = useState<Category>('Housing')
  const [amount, setAmount] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(event: FormEvent) {
    event.preventDefault()
    const cents = parseAmount(amount)
    if (cents === null || cents <= 0) { setError('Enter a positive amount with up to two decimal places.'); return }
    setBusy(true); setError('')
    try { await onSet(category, cents) } catch (cause) { setError(messageOf(cause)) }
    finally { setBusy(false) }
  }
  return <Modal title="Set a monthly budget" subtitle="Choose a category to add or update its spending limit." onClose={onClose} busy={busy}><form className="form-stack" onSubmit={submit}>
    <label>Category<select value={category} onChange={event => { setCategory(event.target.value as Category); setAmount('') }}>{categories.filter(item => !['Income', 'Other deposits', 'Transfer'].includes(item)).map(item => <option key={item}>{item}</option>)}</select></label>
    <label>Monthly limit ({ledger.currency})<input value={amount} onChange={event => setAmount(event.target.value)} placeholder={(() => {
      const current = ledger.budgets.find(item => item.category === category)
      return current ? (current.cents / 100).toFixed(2) : '0.00'
    })()} inputMode="decimal" required /></label>
    <ErrorText error={error} /><div className="form-actions"><button type="button" className="quiet" onClick={onClose} disabled={busy}>Cancel</button><button className="primary" data-tone="peach" disabled={busy}>Save budget</button></div>
  </form></Modal>
}
