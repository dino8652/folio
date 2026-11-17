import { FinanceStory } from './finance-story.tsx'
import { ResetPassword } from './reset-password.tsx'
import { StatementBalances } from './statement-balances.tsx'
import { googleClientId } from './account-auth'
import { PasskeySetup } from './passkey-setup.tsx'
import { Onboarding } from './onboarding.tsx'
import { MonthPicker } from './month-picker.tsx'
import { CapSuggestions } from './cap-suggestions.tsx'
import { AiRecap } from './ai-recap.tsx'
import { InteractionControl, SoundControl } from './interaction.tsx'
import { MoneyFlow } from './money-flow.tsx'
import '@fontsource-variable/dm-sans'
import '@fontsource-variable/manrope'
import './styles.css'
import './workspace.css'
import { Kbd } from './unlumen/primitives.tsx'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { createRoot } from 'react-dom/client'
import { ArrowRight, ArrowUpRight, ChartNoAxesColumnIncreasing, ChevronDown, CircleCheck, CircleHelp, Files, Fingerprint, House, Landmark, List, LockKeyhole, Menu, Plus, Search, Settings2, Shield, ShieldCheck, Repeat2, WalletCards, X, ChartPie, FileUp } from 'lucide-react'
import { Count, FlowChart, Metrics, SpendingChart } from './charts.tsx'
import { currencies, currencyText, dateText, monthOffset, recurring, selectPeriod, totals, type Category, type Currency, type Ledger, type Statement, type Transaction } from './ledger.ts'
import { Landing } from './landing.tsx'
import { Accounts, ActivityTable, AddAccount, Budgets, Documents, EditTransaction, Insights, SetBudget, Settings, Transactions } from './pages.tsx'
import { ImportDialog } from './import-dialog.tsx'
import { Empty, ErrorText, messageOf, Modal } from './ui.tsx'
import { useVault } from './use-vault.ts'

const routes = {
  overview: { label: 'Overview', subtitle: 'A clear picture of where your money goes.', icon: House },
  transactions: { label: 'Transactions', subtitle: 'Search and review activity across your bank accounts.', icon: List },
  spending: { label: 'Spending', subtitle: 'See what you spend on and how it changes over time.', icon: ChartPie },
  'cash-flow': { label: 'Cash flow', subtitle: 'Track income, expenses, and what you kept.', icon: ChartNoAxesColumnIncreasing },
  budgets: { label: 'Budgets', subtitle: 'Give your spending categories a monthly limit.', icon: WalletCards },
  subscriptions: { label: 'Subscriptions', subtitle: 'Review payments that look like recurring monthly charges.', icon: Repeat2 },
  accounts: { label: 'Bank accounts', subtitle: 'Organize statement activity by account.', icon: Landmark },
  documents: { label: 'Documents', subtitle: 'Review imported statements and manage saved files.', icon: Files },
  settings: { label: 'Settings & privacy', subtitle: 'Manage how Folio stores and protects your data.', icon: Settings2 },
}

type Page = keyof typeof routes
const groups: { title: string; items: Page[] }[] = [
  { title: 'Workspace', items: ['overview', 'transactions', 'spending', 'cash-flow', 'budgets', 'subscriptions'] },
  { title: 'Manage', items: ['accounts', 'documents', 'settings'] },
]

function route(): Page {
  const current = location.hash.slice(1)
  return Object.hasOwn(routes, current) ? current as Page : 'overview'
}

function Brand() {
  return <div className="brand"><img src="/folio.svg" width="64" height="64" alt="Folio" /></div>
}

function VaultForm({ create, busy, onSubmit }: { create: boolean; busy: boolean; onSubmit: (password: string, currency: Currency) => Promise<void> }) {
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [currency, setCurrency] = useState<Currency>('SGD')
  const [error, setError] = useState('')
  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    if (create && password !== confirmation) { setError('The passphrases do not match.'); return }
    try { await onSubmit(password, currency) } catch (cause) { setError(messageOf(cause)) }
  }
  return <form className="form-stack" onSubmit={submit}>
    <label>Passphrase<input type="password" autoFocus autoComplete={create ? 'new-password' : 'current-password'} minLength={create ? 14 : undefined} maxLength={512} required value={password} onChange={event => setPassword(event.target.value)} aria-describedby={create ? 'passphrase-hint' : undefined} /></label>
    {create && <>
      <p className="field-hint" id="passphrase-hint">Use at least 14 characters. Folio can’t recover a forgotten passphrase.</p>
      <label>Confirm passphrase<input type="password" autoComplete="new-password" required value={confirmation} onChange={event => setConfirmation(event.target.value)} maxLength={512} /></label>
      <label>Vault currency<select value={currency} onChange={event => setCurrency(event.target.value as Currency)}>{currencies.map(item => <option key={item}>{item}</option>)}</select></label>
      <p className="field-hint">Use one currency per vault. Folio keeps this vault in the current browser profile.</p>
    </>}
    <ErrorText error={error} />
    <button className="primary auth-action" data-tone="mint" disabled={busy}><LockKeyhole size={17} /> {busy ? (create ? 'Creating vault…' : 'Unlocking…') : (create ? 'Create private vault' : 'Unlock vault')}</button>
  </form>
}

function Hero({ rows, currency, period, demo, focus = 'cash-flow' }: { rows: Transaction[]; currency: Currency; period: string; demo: boolean; focus?: 'cash-flow' | 'spending' }) {
  const { net, moneyIn, spending } = totals(rows)
  const showSpending = focus === 'spending'
  const headline = showSpending ? spending : net
  return <section className="hero" aria-labelledby="net-title">
    <div className="hero-body">
      <h2 id="net-title">{showSpending ? 'Total spent' : 'Net cash flow'}</h2>
      <strong className="hero-value">{rows.length ? <Count key={headline} cents={headline} currency={currency} /> : '—'}</strong>
      <p className="hero-flow-note">{showSpending ? 'Purchases and other expenses. Excludes transfers.' : 'Earned income + other deposits − spending. Excludes transfers.'}</p>
      <div className="hero-foot"><span>{period}</span><span className="hero-divider" /><span>{currency}</span></div>
    </div>
    {!showSpending && <div className="hero-ledger" aria-hidden="true">
      <div className="hero-ledger-label"><span>IN / OUT</span><ArrowUpRight size={22} /></div>
      <div className="balance-track"><i style={{ transform: `scaleX(${moneyIn / Math.max(moneyIn, spending, 1)})` }} /></div>
      <div className="balance-track out"><i style={{ transform: `scaleX(${spending / Math.max(moneyIn, spending, 1)})` }} /></div>
      <span className="hero-ledger-caption">Deposits and spending</span>
    </div>}
    {demo && <span className="hero-sample">Sample data</span>}
  </section>
}

function Confirm({ title, description, label, onClose, onConfirm }: {
  title: string; description: string; label: string; onClose: () => void; onConfirm: () => Promise<void>
}) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  return <Modal title={title} subtitle={description} onClose={onClose} busy={busy}>
    <ErrorText error={error} /><div className="form-actions"><button className="quiet" onClick={onClose} disabled={busy}>Cancel</button><button className="danger-button" disabled={busy} onClick={async () => {
      setBusy(true); setError('')
      try { await onConfirm() } catch (cause) { setError(messageOf(cause)) }
      finally { setBusy(false) }
    }}>{busy ? 'Saving…' : label}</button></div>
  </Modal>
}

type Dialog = 'passkey' | 'setup' | 'caps' | 'ai' | 'vault' | 'import' | 'account' | 'budget' | 'edit' | 'confirm' | 'help'
type Confirmation = { title: string; description: string; label: string; action: () => Promise<void> }
const todayMonth = () => {
  const today = new Date()
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
}

function Workspace({ vault, ledger, demo }: { vault: ReturnType<typeof useVault>; ledger: Ledger; demo: boolean }) {
  const shortcutModifier = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl'
  const [page, setPage] = useState<Page>(route)
  const [dialog, setDialog] = useState<Dialog | undefined>(() => ledger.connections ? undefined : 'setup')
  const [afterAuth, setAfterAuth] = useState<Dialog>()
  const [editing, setEditing] = useState<Transaction>()
  const [confirmation, setConfirmation] = useState<Confirmation>()
  const [notice, setNotice] = useState('')
  const [navOpen, setNavOpen] = useState(false)
  const [chartMode, setChartMode] = useState<'trends' | 'flow'>('trends')
  const [range, setRange] = useState<1 | 3 | 12>(1)
  const [selectedMonth, setSelectedMonth] = useState<string>()
  const [filters, setFilters] = useState({ category: '', account: '', focus: false, from: '', to: '', index: 0 })
  const month = selectedMonth ?? (ledger.transactions.reduce((latest, row) => row.date.slice(0, 7) > latest ? row.date.slice(0, 7) : latest, '') || todayMonth())
  const trendMonths = range === 1 ? 6 : range
  const months = page === 'budgets' ? 1 : range
  const rows = useMemo(() => selectPeriod(ledger.transactions, month, months), [ledger.transactions, month, months])
  const recent = useMemo(() => [...rows].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5), [rows])
  const monthLabel = (key: string) => dateText(key, { month: 'short', year: 'numeric' })
  const period = months === 1 ? dateText(month, { month: 'long', year: 'numeric' }) : `${monthLabel(monthOffset(month, 1 - months))} – ${monthLabel(month)}`
  const datesVisible = ['overview', 'spending', 'cash-flow', 'budgets'].includes(page)
  const close = () => setDialog(undefined)
  const notify = (message: string) => { setNotice(message); close() }

  useEffect(() => {
    const handle = () => { setPage(route()); setNavOpen(false); window.scrollTo(0, 0) }
    window.addEventListener('hashchange', handle)
    return () => window.removeEventListener('hashchange', handle)
  }, [])

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(''), 5_000)
    return () => clearTimeout(timer)
  }, [notice])

  useEffect(() => {
    if (!navOpen) return
    function escape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setNavOpen(false)
        document.getElementById('mobile-menu')?.focus()
      }
    }
    window.addEventListener('keydown', escape)
    return () => window.removeEventListener('keydown', escape)
  }, [navOpen])

  function openPrivate(kind: Dialog) {
    if (demo) { setAfterAuth(kind === 'vault' ? undefined : kind); setDialog('vault') }
    else setDialog(kind)
  }

  function openTransactions(category = '', account = '', focus = false, withinPeriod = false) {
    setFilters(previous => ({ category, account, focus, from: withinPeriod ? monthOffset(month, 1 - months) + '-01' : '', to: withinPeriod ? monthOffset(month, 1) + '-01' : '', index: previous.index + 1 }))
    if (page !== 'transactions') location.hash = 'transactions'
    else window.scrollTo(0, 0)
  }

  useEffect(() => {
    function quickSearch(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k' && !dialog) {
        event.preventDefault()
        setFilters(previous => ({ category: '', account: '', focus: true, from: '', to: '', index: previous.index + 1 }))
        if (route() !== 'transactions') location.hash = 'transactions'
      }
    }
    window.addEventListener('keydown', quickSearch)
    return () => window.removeEventListener('keydown', quickSearch)
  }, [dialog])

  function edit(row: Transaction) {
    setEditing(row)
    setDialog('edit')
  }

  function confirm(input: Confirmation) {
    if (demo) { openPrivate('vault'); return }
    setConfirmation(input)
    setDialog('confirm')
  }

  function removeStatement(doc: Statement, sourceOnly: boolean) {
    confirm({
      title: sourceOnly ? 'Remove original file?' : 'Delete this statement?',
      description: sourceOnly ? `Remove the saved copy of ${doc.name}. Its transactions will stay in your ledger.`
        : `Delete ${doc.name}, any saved original, and all transactions imported from it.`,
      label: sourceOnly ? 'Remove original' : 'Delete statement',
      action: async () => {
        await vault.update(current => ({
          ...current,
          documents: sourceOnly ? current.documents.map(item => item.id === doc.id ? { ...item, source: undefined } : item) : current.documents.filter(item => item.id !== doc.id),
          transactions: sourceOnly ? current.transactions : current.transactions.filter(item => item.documentId !== doc.id),
        }))
        notify(sourceOnly ? 'Original removed.' : 'Statement deleted.')
      },
    })
  }

  const navigation = (mobile = false) => <nav aria-label={mobile ? 'Mobile navigation' : 'Main navigation'}>
    {groups.map(group => <div className="nav-group" key={group.title}><p>{group.title}</p>{group.items.map(item => {
      const entry = routes[item]
      const Icon = entry.icon
      return <a className={page === item ? 'nav-link active' : 'nav-link'} href={`#${item}`} key={item} aria-current={page === item ? 'page' : undefined}
        onClick={() => {
          if (item === 'transactions') setFilters(previous => ({ category: '', account: '', focus: false, from: '', to: '', index: previous.index + 1 }))
          if (mobile) { setNavOpen(false); requestAnimationFrame(() => document.querySelector('main h1')?.scrollIntoView({ block: 'nearest' })) }
        }}><Icon size={18} strokeWidth={1.75} /><span>{entry.label}</span></a>
    })}</div>)}
  </nav>

  return <div className="shell">
    <a className="skip" href="#main-content" onClick={event => { event.preventDefault(); document.getElementById('main-content')?.focus() }}>Skip to content</a>
    <aside className="sidebar">
      <a className="brand-link" href="#overview" aria-label="Folio overview"><Brand /></a>
      {navigation()}
      <div className="sidebar-bottom">
        <button className="quiet side-help" onClick={() => setDialog('help')}><CircleHelp size={18} /> Import help</button>
        <button className="sidebar-vault" onClick={() => demo ? openPrivate('vault') : vault.lock()}><span className="vault-icon"><ShieldCheck size={19} /></span><span><strong>Private vault</strong><small>{demo ? 'Create your vault' : 'Unlocked on this device'}</small></span>{demo ? <ArrowUpRight size={15} /> : <LockKeyhole size={15} />}</button>
      </div>
    </aside>
    <div className="workspace">
      <header className="topbar"><div className="topbar-start"><button id="mobile-menu" className="icon-button mobile-menu" aria-label={navOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={navOpen} aria-controls="mobile-nav" onClick={() => setNavOpen(!navOpen)}>{navOpen ? <X size={23} /> : <Menu size={23} />}</button>
        <a className="mobile-brand" aria-label="Folio overview" href="#overview"><img src="/folio.svg" width="32" height="32" alt="" /></a>
        <p className="breadcrumb"><span>Workspace</span><ChevronDown size={13} /><strong>{routes[page].label}</strong></p>
      </div><div className="top-actions"><SoundControl /><InteractionControl />
        <button className="search-trigger" aria-label="Open transaction search" aria-keyshortcuts="Control+K Meta+K" onClick={() => openTransactions('', '', true)}><Search size={17} /><span>Search transactions</span><Kbd aria-hidden="true">{shortcutModifier} K</Kbd></button>
        <button className="primary top-import" onClick={() => openPrivate('import')}><Plus size={18} /><span>Import statement</span></button>
      </div></header>
      {navOpen && <div className="mobile-drawer" id="mobile-nav">{navigation(true)}<button className="quiet side-help" onClick={() => { setNavOpen(false); setDialog('help') }}><CircleHelp size={18} /> Import help</button></div>}
      <main id="main-content" tabIndex={-1} className="main-content">
        <div className="page-title"><div><span className="page-eyebrow">YOUR MONEY, IN FOCUS</span><h1>{routes[page].label}</h1><p>{routes[page].subtitle}</p></div>
          {datesVisible && <div className="period-controls">
            {page === 'budgets' && <button className="quiet" data-tone="peach" onClick={() => setDialog('caps')}>Suggest spending caps</button>}
            {page === 'spending' && rows.length > 0 && <button className="quiet" data-tone="violet" onClick={() => setDialog('ai')}>AI spending recap</button>}
            {page !== 'budgets' && <div className="range" aria-label="Period length">{([{ key: 1, label: 'Month' }, { key: 3, label: 'Quarter' }, { key: 12, label: 'Year' }] as const).map(option => <button key={option.key} onClick={() => setRange(option.key)} aria-pressed={range === option.key}>{option.label}</button>)}</div>}
            <MonthPicker month={month} today={todayMonth()} onChange={setSelectedMonth} />
          </div>}
        </div>

        {!ledger.connections && <section className="panel onboarding-banner">
          <div><h2>{demo ? 'Set up your private workspace' : 'Finish setting up Folio'}</h2><p>{demo ? 'Create a vault to import your statements and set up security and connections.' : 'Add your profile, verify your mobile number, and connect your services.'}</p></div>
          <button className="primary" data-tone="lime" onClick={() => demo ? openPrivate('vault') : setDialog('setup')}>{demo ? 'Start setup' : 'Continue setup'} <ArrowRight size={16} /></button>
        </section>}

        <div className="page-body" key={page}>
          {page === 'cash-flow' && <FinanceStory ledger={ledger} rows={rows} month={month} onEdit={edit} />}
          {page === 'overview' && <>
            {ledger.transactions.length === 0 && <section className="panel first-import"><span className="row-icon"><FileUp size={23} /></span><div><h2>Bring in your first statement</h2><p>Import a PDF, CSV, or Excel file to start building your financial picture.</p></div><button className="primary" data-tone="lime" onClick={() => openPrivate('import')}>Import statement <ArrowRight size={17} /></button></section>}
            <div className="overview-grid">
              <FinanceStory ledger={ledger} rows={rows} month={month} onEdit={edit} />
              <SpendingChart rows={rows} currency={ledger.currency} onCategory={category => openTransactions(category, '', false, true)} expanded />
              <section className="panel table-panel recent-panel">
                <div className="panel-heading"><div><h2>Recent transactions</h2><p>Latest activity in this period</p></div><button className="quiet" data-tone="sky" onClick={() => openTransactions()}>View all <ArrowRight size={16} /></button></div>
                <ActivityTable rows={recent} ledger={ledger} onEdit={edit} empty="No transactions in this period." />
              </section>
            </div>
          </>}
          {page === 'transactions' && <Transactions key={filters.index} initialCategory={filters.category} initialAccount={filters.account} focusSearch={filters.focus} initialFrom={filters.from} initialTo={filters.to} ledger={ledger} onEdit={edit} />}
          {page === 'spending' && <div className="dashboard-grid analytics-grid"><FinanceStory ledger={ledger} rows={rows} month={month} onEdit={edit} /><SpendingChart rows={rows} currency={ledger.currency} onCategory={category => openTransactions(category, '', false, true)} expanded />
            <Insights ledger={ledger} rows={rows} month={month} onEdit={edit} /></div>}
          {page === 'cash-flow' && <>
            <div className="report-tools"><div className="range" role="group" aria-label="Cash flow visualization">
              <button aria-pressed={chartMode === 'trends'} onClick={() => setChartMode('trends')}>Trend bars</button>
              <button aria-pressed={chartMode === 'flow'} onClick={() => setChartMode('flow')}>Money flow</button>
            </div><button className="quiet" onClick={() => openTransactions('', '', false, true)}>View period transactions <ArrowRight size={16} /></button></div>
            <div className="chart-stage" key={`${chartMode}-${period}`}>{chartMode === 'trends' ? <FlowChart key={period} rows={rows} month={month} months={months} currency={ledger.currency} />
              : <MoneyFlow rows={rows} currency={ledger.currency} onCategory={category => openTransactions(category, '', false, true)} />}</div>
          </>}
          {page === 'budgets' && <Budgets ledger={ledger} rows={rows} month={month} onSet={() => openPrivate('budget')} onRemove={category => confirm({
            title: 'Remove budget?', description: `Remove your monthly limit for ${category}.`, label: 'Remove budget',
            action: async () => { await vault.update(current => ({ ...current, budgets: current.budgets.filter(item => item.category !== category) })); notify('Budget removed.') },
          })} />}
          {page === 'subscriptions' && <Subscriptions ledger={ledger} onSearch={openTransactions} />}
          {page === 'accounts' && <Accounts ledger={ledger} onAdd={() => openPrivate('account')} onSee={account => openTransactions('', account)} />}
          {page === 'documents' && <Documents ledger={ledger} onImport={() => openPrivate('import')} onDelete={doc => removeStatement(doc, false)} onForgetSource={doc => removeStatement(doc, true)} />}
          {page === 'settings' && <button className="quiet setup-entry" data-tone="violet" onClick={() => demo ? openPrivate('vault') : setDialog('setup')}>Profile & connections</button>}
          {page === 'settings' && !demo && <section className="panel onboarding-banner">
            <div><h2>Two-factor unlock</h2><p>{vault.passkeyEnabled ? 'Enabled. Unlock with your passphrase and passkey.' : 'Require a passkey as well as your passphrase.'}</p></div>
            {!vault.passkeyEnabled && <button className="quiet" data-tone="mint" onClick={() => setDialog('passkey')}>Enable two-factor unlock</button>}
          </section>}
          {page === 'settings' && <Settings accountOwned={vault.accountOwned} ledger={ledger} isSample={demo} busy={vault.busy} onAuth={() => openPrivate('vault')} onLock={vault.lock}
            onTimeout={async minutes => { if (demo) openPrivate('vault'); else { await vault.update(current => ({ ...current, lockMinutes: minutes })); notify('Auto-lock updated.') } }}
            onRetention={days => {
              if (days === ledger.retention) return
              confirm({ title: 'Change your retention policy?', description: days ? `Transactions older than ${days} days and their related originals may be permanently removed when you save.` : 'Your records will stay in this browser until you delete them.',
                label: 'Save retention', action: async () => { await vault.update(current => ({ ...current, retention: days })); notify('Retention updated.') } })
            }}
            onErase={() => confirm({ title: 'Delete your private vault?', description: 'This permanently removes the encrypted vault from this browser. It cannot be recovered.',
              label: 'Delete vault', action: async () => { await vault.erase(); location.hash = 'overview'; notify('Vault deleted.') } })} />}
          <div className="workspace-footer"><Shield size={15} /><span>{demo ? 'You’re viewing a sample workspace. Its figures are illustrative.' : 'Your vault is stored in this browser.'}</span></div>
        </div>
      </main>
    </div>
    {notice && <div className="toast" role="status"><CircleCheck size={19} /><span>{notice}</span></div>}
    {dialog === 'caps' && <CapSuggestions ledger={ledger} month={month} demo={demo} onClose={close} onApply={async caps => {
      await vault.update(current => ({
        ...current, budgets: [...current.budgets, ...caps.filter(cap => !current.budgets.some(item => item.category === cap.category))],
      }))
      notify('Spending caps saved.')
    }} />}
    {dialog === 'passkey' && !demo && <PasskeySetup accountOwned={vault.accountOwned} busy={vault.busy} onClose={close} onEnable={async password => {
      await vault.enablePasskey(password)
      notify('Two-factor unlock enabled.')
    }} />}
    {dialog === 'setup' && !demo && <Onboarding email={ledger.profileEmail} current={ledger.connections} onClose={close} passkeyEnabled={vault.passkeyEnabled} onSave={async (connections, addPasskey) => {
      await vault.update(current => ({ ...current, connections }))
      if (addPasskey && !vault.passkeyEnabled) setDialog('passkey')
      else notify('Setup saved.')
    }} />}
    {dialog === 'ai' && <AiRecap connection={ledger.connections} onSaveConnection={settings => vault.update(current => ({
      ...current,
      connections: {
        email: current.profileEmail ?? '', phone: '', googleClientId,
        ...current.connections, ...settings,
      },
    }))} rows={rows} currency={ledger.currency} period={period} demo={demo} onClose={close} />}
    {dialog === 'vault' && <Modal title="Create your private vault" subtitle="Set a passphrase to protect your financial data on this device." onClose={close} busy={vault.busy}>
      <VaultForm create busy={vault.busy} onSubmit={async (password, currency) => {
        await vault.authenticate(password, currency)
        setSelectedMonth(undefined)
        setDialog(afterAuth ?? 'setup')
        setAfterAuth(undefined)
        setNotice('Private vault created.')
      }} /></Modal>}
    {dialog === 'import' && !demo && <ImportDialog ledger={ledger} update={vault.update} onClose={close} onImported={(message, importedMonth) => {
      setSelectedMonth(importedMonth); setRange(1); location.hash = 'overview'; notify(message)
    }} />}
    {dialog === 'edit' && editing && <EditTransaction row={editing} ledger={ledger} update={vault.update} onDone={() => notify('Transaction updated.')} onClose={close} sample={demo} />}
    {dialog === 'account' && !demo && <AddAccount onClose={close} onAdd={async account => {
      await vault.update(current => ({ ...current, accounts: [...current.accounts, account] })); notify('Bank account added.')
    }} />}
    {dialog === 'budget' && !demo && <SetBudget ledger={ledger} onClose={close} onSet={async (category: Category, cents: number) => {
      await vault.update(current => ({ ...current, budgets: [...current.budgets.filter(item => item.category !== category), { category, cents }] })); notify('Monthly budget saved.')
    }} />}
    {dialog === 'confirm' && confirmation && !demo && <Confirm {...confirmation} onClose={close} onConfirm={confirmation.action} />}
    {dialog === 'help' && <Modal title="Import help" subtitle="Choose the format that gives Folio the clearest transaction records." onClose={close}>
      <div className="help-list"><div><strong>CSV and Excel</strong><p>Use Date, Description, and Amount headers, or separate Debit and Credit columns. For Excel, put the transactions on the first sheet of an .xlsx workbook.</p></div>
        <div><strong>PDF statements</strong><p>Use an unlocked, text-based PDF with signed amounts. Review all candidates against the original. For scans, export a CSV from your bank.</p></div>
        <div><strong>Multiple accounts</strong><p>Import one statement per file. Choose the correct account and confirm that every selected amount uses your vault currency.</p></div></div>
    </Modal>}
  </div>
}

function Subscriptions({ ledger, onSearch }: { ledger: Ledger; onSearch: (category: string, account: string) => void }) {
  const candidates = recurring(ledger.transactions.filter(row => !row.review))
  return <section className="panel section-panel"><div className="panel-heading"><div><h2>Recurring payments</h2><p>Matched by account, description, and similar amounts across three consecutive months.</p></div><span className="panel-glyph"><Repeat2 size={19} /></span></div>
    {candidates.length ? <div className="data-list">{candidates.map(item => <article className="data-row" key={JSON.stringify([item.accountId, item.name])}>
      <span className="row-icon"><Repeat2 size={20} /></span><div><strong>{item.name}</strong><p>Last seen {dateText(item.date)} · {item.category}</p></div><strong>{currencyText(item.cents, ledger.currency)}</strong>
      <button className="quiet" onClick={() => onSearch(item.category, item.accountId)}>View activity <ArrowRight size={15} /></button>
    </article>)}</div> : <Empty>Import at least three consecutive months of activity to check for monthly recurring payments.</Empty>}
  </section>
}

function App() {
  const vault = useVault()
  if (location.pathname === '/reset-password') return <ResetPassword token={new URLSearchParams(location.search).get('token') ?? ''} />
  if (vault.status === 'loading') return <main className="lock-screen"><div className="lock-card panel" aria-busy="true"><Brand /><p>Opening Folio…</p></div></main>
  if (vault.status === 'unavailable') return <main className="lock-screen"><div className="lock-card panel"><Brand /><h1>Vault unavailable</h1>
    <p>{vault.error || 'Your workspace could not be opened. Your saved data has not been changed.'}</p>
    <button className="quiet" onClick={() => location.reload()}>Try again</button></div></main>
  if (!vault.ledger) return <Landing legacy={vault.legacyAvailable} exists={vault.status === 'locked'} auth={<VaultForm create={false} busy={vault.busy} onSubmit={vault.authenticate} />} onAuthenticated={async (password, uid, email) => { await vault.authenticate(password, 'SGD', uid, email) }} />
  return <Workspace key={vault.workspaceId} vault={vault} ledger={vault.ledger} demo={false} />
}

createRoot(document.getElementById('root')!).render(<App />)
