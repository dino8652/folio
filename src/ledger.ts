export const categories = ['Housing', 'Food & groceries', 'Dining', 'Shopping', 'Transport', 'Bills & utilities', 'Entertainment', 'Health', 'Travel', 'Other', 'Income', 'Other deposits', 'Transfer'] as const
export type Category = typeof categories[number]
export type Currency = 'SGD' | 'USD' | 'GBP' | 'EUR' | 'AUD' | 'CAD'
export const currencies: Currency[] = ['SGD', 'USD', 'GBP', 'EUR', 'AUD', 'CAD']

export interface Candidate {
  sourceDescription?: string
  date: string
  description: string
  descriptionDetails?: string
  cents: number
  category: Category
  review: boolean
}

export interface Transaction extends Candidate {
  id: string
  original: string
  accountId: string
  documentId: string
  categoryEdited?: boolean
  receipt?: { name: string; source: string }
}

export interface Account { id: string; name: string; bank: string; kind: string }
export interface StatementBalance { start: string; end: string; opening: number; closing: number; currency: Currency }
export interface Statement { id: string; name: string; accountId: string; importedAt: string; hash: string; type: string; source?: string; balance?: StatementBalance; startingBalance?: number }
export interface Budget { category: Category; cents: number }
export interface Connections {
  email: string
  phone: string
  phoneVerifiedAt?: string
  googleClientId: string
  provider: 'gemini' | 'openai' | 'openrouter' | 'custom'
  model: string
  endpoint: string
  key: string
}
export interface Ledger {
  schemaVersion?: 2
  profileEmail?: string
  connections?: Connections
  currency: Currency
  accounts: Account[]
  transactions: Transaction[]
  documents: Statement[]
  budgets: Budget[]
  retention: number
  lockMinutes: number
}

export function emptyLedger(currency: Currency = 'SGD'): Ledger {
  return { currency, accounts: [], transactions: [], documents: [], budgets: [], retention: 0, lockMinutes: 5 }
}

const rules: [RegExp, Category][] = [
  [/\b(rent|mortgage)\b/i, 'Housing'],
  [/\b(fairprice|cold storage|whole foods|trader joe|grocery|grocer|market|supermarket|aldi|tesco)\b/i, 'Food & groceries'],
  [/\b(cafe|coffee|bakery|bistro|restaurant|dining|kopi|foodpanda|doordash|starbucks|kitchen|eatery)\b/i, 'Dining'],
  [/\b(uber|grab|taxi|metro|transit|simplygo|train|shell|petrol|bus)\b/i, 'Transport'],
  [/\b(netflix|spotify|cinema|steam|hbo|disney|entertainment|gv online|golden village|shaw theatres)\b/i, 'Entertainment'],
  [/\b(utilities|utility|broadband|internet|electric|water bill|power bill|singtel|starhub)\b/i, 'Bills & utilities'],
  [/\b(pharmacy|clinic|hospital|doctor|dental|gym)\b/i, 'Health'],
  [/\b(airlines|airbnb|hotel|travel)\b/i, 'Travel'],
  [/\b(amazon|shopee|uniqlo|ikea|lazada|retail|studio|books)\b/i, 'Shopping'],
]

export function categorize(description: string, cents: number): Category {
  if (/\b(internal transfer|own account transfer|transfer between (?:my |own )?accounts)\b/i.test(description)) return 'Transfer'
  if (cents > 0) {
    return /\b(payroll|salary|wages|freelance income|employment income)\b/i.test(description) ? 'Income' : 'Other deposits'
  }
  return rules.find(([pattern]) => pattern.test(description))?.[1] ?? 'Other'
}

export function correctImportedIncome(ledger: Ledger): Ledger {
  let changed = false
  const transactions = ledger.transactions.map(row => {
    if (row.categoryEdited || !['Income', 'Other'].includes(row.category)) return row
    const category = categorize(row.description + ' ' + row.original, row.cents)
    if (category === row.category) return row
    changed = true
    return { ...row, category }
  })
  return changed ? { ...ledger, transactions } : ledger
}

export function normalize(description: string) {
  return description.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ')
}

export function findDuplicates(
  existing: { date: string; cents: number; original: string; accountId: string }[],
  incoming: { date: string; cents: number; description: string; sourceDescription?: string }[],
  accountId: string,
) {
  const key = (date: string, cents: number, desc: string) => JSON.stringify([date, cents, normalize(desc)])
  const counts = new Map<string, number>()
  for (const item of existing) {
    if (item.accountId !== accountId) continue
    const id = key(item.date, item.cents, item.original)
    counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  return incoming.map(item => {
    const id = key(item.date, item.cents, item.sourceDescription ?? item.description)
    const count = counts.get(id) ?? 0
    if (count) counts.set(id, count - 1)
    return count > 0
  })
}

export { totals } from './domain/money.ts'

export function monthOffset(month: string, offset: number) {
  const [year, number] = month.split('-').map(Number)
  return new Date(Date.UTC(year, number - 1 + offset, 1)).toISOString().slice(0, 7)
}

export function selectPeriod<T extends {date: string}>(rows: T[], end: string, months: number) {
  const start = monthOffset(end, 1 - months)
  return rows.filter(row => row.date.slice(0, 7) >= start && row.date.slice(0, 7) <= end)
}

export function spendingByCategory(rows: Transaction[]) {
  const sums = new Map<Category, number>()
  for (const row of rows) {
    if (row.cents < 0 && row.category !== 'Transfer') sums.set(row.category, (sums.get(row.category) ?? 0) - row.cents)
  }
  return [...sums].map(([category, cents]) => ({ category, cents })).sort((a, b) => b.cents - a.cents)
}

export function recurring(rows: Pick<Transaction, 'date' | 'description' | 'cents' | 'category' | 'accountId'>[]) {
  const groups = new Map<string, typeof rows>()
  for (const row of rows) {
    if (row.cents >= 0 || row.category === 'Transfer') continue
    const key = JSON.stringify([row.accountId, normalize(row.description)])
    const group = groups.get(key) ?? []
    group.push(row)
    groups.set(key, group)
  }
  return [...groups.values()].flatMap(group => {
    if (group.length < 3) return []
    group.sort((a, b) => b.date.localeCompare(a.date))
    const [latest, previous, older] = group
    const amount = -latest.cents
    const month = latest.date.slice(0, 7)
    const gap = Math.round((Date.parse(latest.date) - Date.parse(previous.date)) / 86_400_000)
    const priorGap = Math.round((Date.parse(previous.date) - Date.parse(older.date)) / 86_400_000)
    if (previous.date.slice(0, 7) !== monthOffset(month, -1) || older.date.slice(0, 7) !== monthOffset(month, -2)
      || gap < 23 || gap > 37 || priorGap < 23 || priorGap > 37
      || [previous, older].some(row => Math.abs(-row.cents - amount) > Math.max(100, amount * .1))) return []
    return [{ name: latest.description, cents: amount, date: latest.date, category: latest.category, accountId: latest.accountId }]
  }).sort((a, b) => b.cents - a.cents)
}

export function unusual(rows: Transaction[], end: string) {
  const baseline = selectPeriod(rows, monthOffset(end, -1), 3)
  const history = new Map<Category, number[]>()
  for (const row of baseline) {
    if (row.cents >= 0 || row.review || row.category === 'Transfer') continue
    const values = history.get(row.category) ?? []
    values.push(-row.cents)
    history.set(row.category, values)
  }
  return selectPeriod(rows, end, 1).flatMap(row => {
    if (row.cents >= 0 || row.review || row.category === 'Transfer') return []
    const values = history.get(row.category)
    if (!values || values.length < 4) return []
    const sorted = [...values].sort((a, b) => a - b)
    const median = (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.floor(sorted.length / 2)]) / 2
    return -row.cents >= 3 * median ? [{ ...row, median }] : []
  }).sort((a, b) => a.cents - b.cents)
}

export function prune(ledger: Ledger, now = new Date()): Ledger {
  if (!ledger.retention) return ledger
  const cutoff = new Date(now.getTime() - ledger.retention * 86_400_000).toISOString().slice(0, 10)
  const expiredDocs = new Set<string>()
  const retainedDocs = new Set<string>()
  const transactions = ledger.transactions.filter(row => {
    const keep = row.date >= cutoff
    const docs = keep ? retainedDocs : expiredDocs
    docs.add(row.documentId)
    return keep
  })
  const documents = ledger.documents.filter(doc => retainedDocs.has(doc.id)).map(doc => (
    doc.source && (doc.importedAt.slice(0, 10) < cutoff || expiredDocs.has(doc.id))
      ? { ...doc, source: undefined } : doc
  ))
  if (transactions.length === ledger.transactions.length && documents.length === ledger.documents.length
    && documents.every((doc, index) => doc === ledger.documents[index])) return ledger
  return { ...ledger, transactions, documents }
}

export function currencyText(cents: number, currency: Currency, digits = 2) {
  return new Intl.NumberFormat('en', { style: 'currency', currency, currencyDisplay: 'narrowSymbol', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(cents / 100)
}

export function dateText(date: string, options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }) {
  return new Intl.DateTimeFormat('en', { ...options, timeZone: 'UTC' }).format(new Date(date.length === 7 ? date + '-01' : date))
}
