import { extractStatement } from './statement-pipeline.ts'
import { commitImport } from './domain/imports.ts'
import { useState, type FormEvent } from 'react'
import { ArrowLeft, ArrowRight, CircleAlert, FileCheck2, FileUp, ShieldCheck } from 'lucide-react'
import { inspectFile } from './import-file.ts'
import { PdfLayoutHelp } from './pdf-layout-help'
import { ImportAi } from './import-ai'
import { currencyText, findDuplicates, type Ledger } from './ledger.ts'
import type { DateOrder, PdfAliases } from './statement.ts'
import { ErrorText, messageOf, Modal } from './ui.tsx'

type Update = (transform: (data: Ledger) => Ledger) => Promise<void>

export function ImportDialog({ ledger, update, onClose, onImported }: {
  ledger: Ledger; update: Update; onClose: () => void; onImported: (message: string, month: string) => void
}) {
  const [useAi, setUseAi] = useState(false)
  const [file, setFile] = useState<File>()
  const [account, setAccount] = useState(ledger.accounts[0]?.id ?? 'new')
  const [accountName, setAccountName] = useState('')
  const [bank, setBank] = useState('')
  const [aliases, setAliases] = useState<PdfAliases>({})
  const [order, setOrder] = useState<DateOrder>('DMY')
  const [flip, setFlip] = useState(false)
  const [retain, setRetain] = useState(false)
  const [descriptionEdits, setDescriptionEdits] = useState<Record<number, string>>({})
  const [dragging, setDragging] = useState(false)
  const [result, setResult] = useState<import('./statement.ts').Extraction & {hash:string;type:import('./domain/imports.ts').ImportDraft['type']}>()
  const [duplicates, setDuplicates] = useState<boolean[]>([])
  const [selected, setSelected] = useState<boolean[]>([])
  const [page, setPage] = useState(0)
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const count = selected.filter(Boolean).length
  const existingStatement = result && ledger.documents.find(doc => doc.hash === result.hash && doc.accountId === account)
  const statementBalance = result?.balance?.currency === ledger.currency ? result.balance : undefined
  const reconciled = Boolean(statementBalance && !flip)
  const balanceOnly = Boolean(existingStatement && statementBalance && !existingStatement.balance)


  async function scan(event: FormEvent) {
    event.preventDefault()
    if (!file) { setError('Select a statement to continue.'); return }
    if (account === 'new' && (!accountName.trim() || !bank.trim())) { setError('Enter an account name and bank.'); return }
    setError('')
    setBusy(true)
    try {
      const extraction = useAi ? await extractStatement(file, ledger, order, flip) : await inspectFile(file, order, flip, aliases)
      if (!extraction.rows.length) throw new Error(extraction.issues.length
        ? `No safe candidates found. ${extraction.issues.length} rows could not be read. For PDFs, try mapping the column headings below. You can also use a CSV or Excel export.`
        : extraction.type === 'pdf' ? 'No transactions found. Try mapping the PDF column headings below.'
          : 'No transactions found. Try a CSV with Date, Description, and a signed Amount column.')
      if (extraction.balance && extraction.balance.currency !== ledger.currency) {
        throw new Error(`This statement is in ${extraction.balance.currency} and this vault uses ${ledger.currency}.`)
      }
      const duplicateFlags = findDuplicates(ledger.transactions, extraction.rows, account)
      if (duplicateFlags.every(Boolean) && ledger.documents.some(doc => doc.hash === extraction.hash && doc.accountId === account)) {
        const existing = ledger.documents.find(doc => doc.hash === extraction.hash && doc.accountId === account)
        if (!extraction.balance || extraction.balance.currency !== ledger.currency || existing?.balance) {
          throw new Error('This exact file was already imported into this account.')
        }
      }
      setDuplicates(duplicateFlags)
      const verified = extraction.balance?.currency === ledger.currency && !flip
      setDescriptionEdits({})
      setSelected(extraction.rows.map((row, index) => !duplicateFlags[index] && (!row.review || verified)))
      setPage(0)
      setResult(extraction)
    } catch (cause) { setError(messageOf(cause)) }
    finally { setBusy(false) }
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!result || !file || (!count && !balanceOnly)) return
    setBusy(true)
    setSaving(true)
    setError('')
    try {
      if (balanceOnly && existingStatement && statementBalance) {
        await update(current => {
          if (!current.documents.some(doc => doc.id === existingStatement.id)) throw new Error('This statement was removed. Import it again.')
          return { ...current, documents: current.documents.map(doc => doc.id === existingStatement.id ? { ...doc, balance: statementBalance } : doc) }
        })
        onImported('Statement balance added. Existing transactions were kept.', statementBalance.end.slice(0, 7))
        return
      }
      const documentId = crypto.randomUUID()
      const accountId = account === 'new' ? crypto.randomUUID() : account
      const transactionIds = result.rows.map(() => crypto.randomUUID())
      const source = retain ? bytesToBase64(new Uint8Array(await file.arrayBuffer())) : undefined
      let importedCount = 0, month = ''
      await update(current => {
        const committed = commitImport(current, {
          hash: result.hash, type: result.type, name: file.name, rows: result.rows,
          selected, descriptions: descriptionEdits, accountId,
          newAccount: account === 'new' ? { name: accountName, bank } : undefined,
          source, balance: statementBalance,
        }, { document: documentId, transactions: transactionIds }, new Date())
        importedCount = committed.count; month = committed.month
        return committed.ledger
      })
      onImported(`${importedCount.toLocaleString()} ${importedCount === 1 ? 'transaction' : 'transactions'} imported.`, month)
    } catch (cause) { setError(messageOf(cause)) }
    finally { setBusy(false); setSaving(false) }
  }

  return <Modal title={result ? 'Review transactions' : 'Import a statement'} subtitle={result ? file?.name : useAi ? 'Extracted using your selected AI provider and model.' : 'Your statement is processed in this browser.'} onClose={onClose} busy={busy || saving} wide={!!result}>
    {!result ? <form inert={busy} onSubmit={scan} className="form-stack">
      <label className={`dropzone ${dragging ? 'dragging' : ''}`} onDragOver={event => { event.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); setFile(event.dataTransfer.files[0]); setError('') }}>
        <input type="file" aria-label="Statement file" accept=".pdf,.csv,.tsv,.txt,.xlsx,.png,.jpg,.jpeg,.webp" onChange={event => { setFile(event.target.files?.[0]); setError('') }} />
        {file ? <FileCheck2 size={25} /> : <FileUp size={25} />}<strong>{file?.name ?? 'Choose a statement or drag it here'}</strong><span>PDF, spreadsheet or statement image · AI: up to 12 MB</span>
      </label>
      <label className="check"><input type="checkbox" checked={useAi} onChange={event => setUseAi(event.target.checked)} /> Extract with my AI provider</label>
      {useAi && <p className="field-hint">PDFs and images are sent through Folio to your selected provider using your key. For spreadsheets, AI receives descriptions and, when needed, sample rows for column mapping; amounts are parsed in code. Folio does not retain uploaded files on its server. Your provider’s data policy applies. Custom providers are contacted directly.</p>}
      <label>Bank account<select value={account} onChange={event => setAccount(event.target.value)}>
        {ledger.accounts.map(item => <option value={item.id} key={item.id}>{item.name} · {item.bank}</option>)}<option value="new">Add a bank account</option>
      </select></label>
      {account === 'new' && <div className="form-columns"><label>Account name<input required maxLength={65} value={accountName} onChange={event => setAccountName(event.target.value)} placeholder="Everyday account" /></label><label>Bank<input required maxLength={65} value={bank} onChange={event => setBank(event.target.value)} placeholder="Bank name" /></label></div>}
      <label>Numeric date format<select value={order} onChange={event => setOrder(event.target.value as DateOrder)}><option value="DMY">Day / Month / Year</option><option value="MDY">Month / Day / Year</option></select></label>
      <label className="check"><input type="checkbox" checked={flip} onChange={event => setFlip(event.target.checked)} /> Reverse amount signs (for exports that show purchases as positive)</label>
      <label className="check"><input type="checkbox" checked={retain} onChange={event => setRetain(event.target.checked)} /> Keep an encrypted copy of the original file</label>
      <ErrorText error={error} />
      {file?.name.toLowerCase().endsWith('.pdf') && <PdfLayoutHelp aliases={aliases} onChange={setAliases} connection={ledger.connections} />}
      <div className="form-actions"><span><ShieldCheck size={16} /> {useAi ? 'Your provider · your key' : 'On-device processing'}</span><button type="submit" className="primary" disabled={busy}>{busy ? 'Reading statement…' : 'Review import'} <ArrowRight size={16} /></button></div>
    </form> : <form onSubmit={save} className="form-stack">
      {statementBalance && <div className="inline-note"><div><strong>Statement balance on {statementBalance.end}</strong><p>{currencyText(statementBalance.opening, ledger.currency)} opening · {currencyText(statementBalance.closing, ledger.currency)} closing. These are the bank’s balances for the whole statement.</p></div></div>}
      {balanceOnly && <p className="field-hint">This file is already imported. Save its statement balance without adding any transactions.</p>}
      <div className="review-summary" aria-live="polite"><strong>{count.toLocaleString()} of {result.rows.length.toLocaleString()} selected</strong><span>{duplicates.filter(Boolean).length} possible duplicates · {result.issues.length} unreadable rows</span></div>
      {(result.issues.length > 0 || result.type === 'pdf') && <div className="inline-note"><CircleAlert size={18} /><div>
        {result.type === 'pdf' && <p>{reconciled
          ? 'Extracted amounts reconcile with the statement totals. Rows are selected for import; AI can still misread the source.'
          : 'Amounts could not be verified against a running balance. Select the rows you want to import.'}</p>}
        {result.issues.length > 0 && <p>Unreadable rows were excluded. {result.type === 'pdf' ? 'Extracted lines' : 'Rows'} {result.issues.slice(0, 8).map(issue => issue.line).join(', ')}{result.issues.length > 8 ? ', and more' : ''}.</p>}
      </div></div>}
      {!balanceOnly && !reconciled && result.rows.some((row, index) => row.review && !duplicates[index] && !selected[index]) &&
        <button type="button" className="quiet" onClick={() => setSelected(current => current.map((included, index) => included || !duplicates[index]))}>
          Select all nonduplicate rows
        </button>}
      <div className="table-wrap review-table"><table><thead><tr><th scope="col"><span className="sr-only">Include</span></th><th scope="col">Description</th><th scope="col">Date</th><th scope="col">Category</th><th scope="col">Amount</th></tr></thead><tbody>
        {result.rows.slice(page * 25, page * 25 + 25).map((row, index) => {
          const i = page * 25 + index
          return <tr key={i}><td><input aria-label={`Include ${row.description}, row ${i + 1}`} type="checkbox" disabled={balanceOnly} checked={selected[i]} onChange={event => {
            const next = selected.slice(); next[i] = event.target.checked; setSelected(next)
          }} /></td><td>{descriptionEdits[i] ?? row.description}{row.descriptionDetails && <small className="row-flag">{row.descriptionDetails}</small>}{duplicates[i] && <small className="row-flag">Possible duplicate</small>}</td><td>{row.date}</td><td>{row.category}</td><td className={row.cents > 0 ? 'positive' : ''}>{currencyText(row.cents, ledger.currency)}</td></tr>
        })}
      </tbody></table></div>
      {result.rows.length > 25 && <div className="pagination"><button type="button" className="quiet" disabled={!page} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page + 1} of {Math.ceil(result.rows.length / 25)}</span><button type="button" className="quiet" disabled={(page + 1) * 25 >= result.rows.length} onClick={() => setPage(page + 1)}>Next</button></div>}
      {!balanceOnly && ledger.connections?.key && ledger.connections.model && <ImportAi key={page} connection={ledger.connections}
        rows={result.rows.slice(page * 25, page * 25 + 25).flatMap((row, index) => {
          const id = page * 25 + index
          return selected[id] ? [{ id, text: [row.description, row.descriptionDetails].filter(Boolean).join(' ') }] : []
        })}
        onApply={updates => setDescriptionEdits(current => ({ ...current, ...updates }))} />}
      <p className="field-hint">Import currency: {ledger.currency}. {ledger.connections?.key && ledger.connections.model && !balanceOnly && 'AI cleanup uses selected rows on this page.'}</p>
      <ErrorText error={error} />
      <div className="form-actions"><button type="button" className="quiet" onClick={() => { setResult(undefined); setError('') }} disabled={busy}><ArrowLeft size={16} /> Back</button><button type="submit" className="primary" disabled={(!count && !balanceOnly) || busy}>{busy ? 'Encrypting…' : balanceOnly ? 'Save statement balance' : `Import ${count.toLocaleString()} transactions`}</button></div>
    </form>}
  </Modal>
}

function bytesToBase64(bytes: Uint8Array) {
  const chunks: string[] = []
  for (let index = 0; index < bytes.length; index += 0x4000) chunks.push(String.fromCharCode(...bytes.subarray(index, index + 0x4000)))
  return btoa(chunks.join(''))
}
