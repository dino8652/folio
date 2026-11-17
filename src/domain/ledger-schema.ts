import { categories, currencies, type Ledger } from '../ledger.ts'
import { integerCents } from './money.ts'
function object(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} is not a valid record.`)
}
function text(value: unknown, label: string, max = 4096): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`${label} is missing or too long.`)
}
export function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(value)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}
function array(value: unknown, label: string, max: number): asserts value is Record<string, unknown>[] {
  if (!Array.isArray(value) || value.length > max) throw new Error(`${label} exceeds the workspace limit or has an invalid format.`)
  for (const entry of value) object(entry, label)
}
function uniqueIds(rows: Record<string, unknown>[], label: string) {
  const ids = new Set<string>()
  for (const row of rows) { text(row.id, `${label} ID`, 180); if (ids.has(row.id)) throw new Error(`Duplicate ${label} ID.`); ids.add(row.id) }
  return ids
}
// Runs on both reads and writes. Never silently coerce malformed money or discard data.
export function validateLedger(value: unknown): asserts value is Ledger {
  object(value, 'Workspace')
  if (value.schemaVersion !== undefined && value.schemaVersion !== 2) throw new Error('This workspace needs a newer version of Folio.')
  if (!currencies.includes(value.currency as never)) throw new Error('Workspace currency is unsupported.')
  array(value.accounts, 'Accounts', 500); array(value.documents, 'Statements', 10000)
  array(value.transactions, 'Transactions', 50000); array(value.budgets, 'Budgets', categories.length)
  const accounts = uniqueIds(value.accounts, 'account'), documents = uniqueIds(value.documents, 'statement')
  uniqueIds(value.transactions, 'transaction')
  const documentAccounts = new Map(value.documents.map(doc => [doc.id, doc.accountId]))
  for (const account of value.accounts) { text(account.name, 'Account name', 180); text(account.bank, 'Bank name', 180); text(account.kind, 'Account type', 180) }
  for (const doc of value.documents) {
    if (!accounts.has(doc.accountId as string)) throw new Error('A statement has no matching account.')
    text(doc.name, 'Statement name', 180); text(doc.hash, 'Statement fingerprint', 180)
    if (!['pdf', 'csv', 'xlsx', 'png', 'jpeg', 'webp'].includes(doc.type as string)) throw new Error('Unsupported statement type.')
    if (typeof doc.importedAt !== 'string' || !Number.isFinite(Date.parse(doc.importedAt))) throw new Error('Invalid statement import date.')
    if (doc.startingBalance !== undefined) integerCents(doc.startingBalance, 'Starting value')
    if (doc.balance !== undefined) {
      object(doc.balance, 'Statement balance')
      const balance = doc.balance
      integerCents(balance.opening, 'Opening balance'); integerCents(balance.closing, 'Closing balance')
      if (!validDate(balance.start) || !validDate(balance.end) || balance.start > balance.end || balance.currency !== value.currency) throw new Error('Invalid statement period or currency.')
    }
    if (doc.source !== undefined && (typeof doc.source !== 'string' || doc.source.length > 16 * 1024 * 1024)) throw new Error('Statement original is too large or invalid.')
  }
  for (const row of value.transactions) {
    integerCents(row.cents)
    if (!validDate(row.date)) throw new Error('A transaction has an invalid date.')
    text(row.description, 'Transaction description'); text(row.original, 'Original description')
    if (!categories.includes(row.category as never) || typeof row.review !== 'boolean') throw new Error('Invalid transaction classification.')
    if (!accounts.has(row.accountId as string) || !documents.has(row.documentId as string) || documentAccounts.get(row.documentId) !== row.accountId) throw new Error('A transaction has no matching account and statement.')
    if (row.receipt !== undefined) {
      object(row.receipt, 'Receipt'); text(row.receipt.name, 'Receipt name', 250); text(row.receipt.source, 'Receipt file', 3 * 1024 * 1024)
    }
  }
  const budgetCategories = new Set<unknown>()
  for (const budget of value.budgets) {
    integerCents(budget.cents, 'Budget')
    if (budget.cents <= 0 || !categories.includes(budget.category as never) || budgetCategories.has(budget.category)) throw new Error('Invalid or duplicate category budget.')
    budgetCategories.add(budget.category)
  }
  if (![0, 30, 90, 365].includes(value.retention as number) || ![1, 5, 15, 30].includes(value.lockMinutes as number)) throw new Error('Invalid workspace retention or lock settings.')
  if (value.connections !== undefined) {
    object(value.connections, 'Connections')
    const settings = value.connections
    if (!['gemini', 'openai', 'openrouter', 'custom'].includes(settings.provider as string)) throw new Error('Invalid AI provider.')
    for (const field of ['email', 'phone', 'googleClientId', 'model', 'endpoint', 'key']) {
      if (typeof settings[field] !== 'string' || settings[field].length > 8192) throw new Error('Invalid connection settings.')
    }
  }
}
export function loadLedger(value: unknown): Ledger {
  validateLedger(value)
  return { ...value, schemaVersion: 2 }
}
