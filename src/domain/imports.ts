import { categorize, findDuplicates, type Candidate, type Ledger, type StatementBalance } from '../ledger.ts'
import { integerCents, reconcile } from './money.ts'
import { validateLedger, validDate } from './ledger-schema.ts'
export interface ImportDraft {
  hash: string; type: 'pdf' | 'csv' | 'xlsx' | 'png' | 'jpeg' | 'webp'; name: string
  rows: Candidate[]; selected: boolean[]; descriptions?: Record<number, string>
  accountId: string; newAccount?: {name: string; bank: string}; source?: string
  balance?: StatementBalance
}
export function verifyExtraction(rows: Candidate[], balance?: StatementBalance) {
  for (const row of rows) {
    integerCents(row.cents)
    if (!validDate(row.date) || !row.description.trim()) throw new Error('The statement contains an invalid date or description.')
  }
  if (balance && (rows.some(row => row.date < balance.start || row.date > balance.end) || !reconcile(balance.opening, balance.closing, rows).reconciled)) throw new Error('The extracted amounts do not match the statement balance. No transactions have been saved.')
}
// A single atomic command. Re-evaluates duplicates against the current ledger, not
// the preview captured earlier. No network calls, random IDs or writes in this function.
export function commitImport(current: Ledger, draft: ImportDraft, ids: {document: string; transactions: string[]}, now: Date): {ledger: Ledger; count: number; month: string} {
  validateLedger(current)
  verifyExtraction(draft.rows, draft.balance)
  if (draft.selected.length !== draft.rows.length || ids.transactions.length !== draft.rows.length) throw new Error('The import selection is incomplete.')
  if (draft.balance && draft.balance.currency !== current.currency) throw new Error('The statement currency does not match your workspace.')
  if (draft.newAccount) {
    if (current.accounts.some(account => account.id === draft.accountId)) throw new Error('This account already exists. Start the import again.')
    if (!draft.newAccount.name.trim() || !draft.newAccount.bank.trim()) throw new Error('Enter an account name and bank.')
  } else if (!current.accounts.some(account => account.id === draft.accountId)) throw new Error('This account was removed. Choose an account again.')
  if (current.documents.some(doc => doc.accountId === draft.accountId && doc.hash === draft.hash)) throw new Error('This exact file was already imported into this account.')
  const duplicates = findDuplicates(current.transactions, draft.rows, draft.accountId)
  const cutoff = new Date(now.getTime() - current.retention * 86400000).toISOString().slice(0, 10)
  const rows = draft.rows.flatMap((row, i) => {
    if (!draft.selected[i] || duplicates[i]) return []
    if (current.retention && row.date < cutoff) throw new Error('Some selected transactions are outside your retention window. Change retention in Settings before importing them.')
    const description = draft.descriptions?.[i]?.trim() || row.description
    const { descriptionDetails: _details, ...candidate } = row
    return [{ ...candidate, review: draft.balance ? false : candidate.review, description, original: row.sourceDescription ?? row.description,
      category: row.cents < 0 && row.category !== 'Transfer' && draft.descriptions?.[i] ? categorize(description, row.cents) : row.category,
      id: ids.transactions[i], documentId: ids.document, accountId: draft.accountId }]
  })
  if (!rows.length) throw new Error('There are no new transactions to import.')
  if (current.transactions.length + rows.length > 50000) throw new Error('Your vault has reached the 50,000 transaction limit.')
  if (current.documents.reduce((size, doc) => size + (doc.source?.length ?? 0), draft.source?.length ?? 0) > 32 * 1024 * 1024) throw new Error('Original-file storage is full. Disable “Keep original” or remove an older original.')
  const ledger: Ledger = {
    ...current, schemaVersion: 2,
    accounts: draft.newAccount ? [...current.accounts, { id: draft.accountId, name: draft.newAccount.name.trim(), bank: draft.newAccount.bank.trim(), kind: 'Bank account' }] : current.accounts,
    transactions: [...current.transactions, ...rows],
    documents: [...current.documents, { id: ids.document, name: draft.name.slice(0, 180), accountId: draft.accountId, hash: draft.hash, type: draft.type, importedAt: now.toISOString(), source: draft.source, balance: draft.balance }],
  }
  validateLedger(ledger)
  return { ledger, count: rows.length, month: rows.map(row => row.date).sort().at(-1)!.slice(0, 7) }
}
