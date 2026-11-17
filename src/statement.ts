import { categorize, currencies, type Currency, type StatementBalance, type Candidate } from './ledger.ts'

export type DateOrder = 'DMY' | 'MDY'
type Cell = string | number | boolean | Date | null | undefined
export interface Issue { line: number; message: string }
export interface Extraction { rows: Candidate[]; issues: Issue[]; balance?: StatementBalance }

export function parseAmount(input: unknown): number | null {
  let value = String(input ?? '').trim().replace(/[−–]/g, '-')
  const debit = /\s*DR$/i.test(value)
  const credit = /\s*CR$/i.test(value)
  value = value.replace(/\s*(?:DR|CR)$/i, '').trim()
  const parens = /^\(.*\)$/.test(value)
  if (parens) value = value.slice(1, -1).trim()
  const match = value.match(/^([+-]?)\s*(?:(?:SGD|USD|AUD|CAD|GBP|EUR|US\$|S\$|A\$|C\$|\$|€|£)\s*)?([+-]?)(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?$/i)
  if (!match) return null
  const [, firstSign, secondSign, units, decimals] = match
  if (firstSign && secondSign) return null
  const minus = firstSign === '-' || secondSign === '-'
  const plus = firstSign === '+' || secondSign === '+'
  if (credit && (minus || parens) || plus && (debit || parens)) return null
  const cents = Number(units.replaceAll(',', '')) * 100 + Number((decimals ?? '').padEnd(2, '0'))
  if (!Number.isSafeInteger(cents) || cents > 100_000_000_000) return null
  return cents * (debit || parens || minus ? -1 : 1)
}

const monthNames = 'jan feb mar apr may jun jul aug sep oct nov dec'.split(' ')

export function parseDate(input: Cell, order: DateOrder): string | null {
  let year: number, month: number, day: number
  if (input instanceof Date && Number.isFinite(input.getTime())) {
    return input.toISOString().slice(0, 10)
  }
  const value = String(input ?? '').trim().replace(/^([a-z]{3,9}) +([0-9]{1,2}),? +([0-9]{2}|[0-9]{4})$/i, '$2 $1 $3')
  const iso = value.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:T00:00:00(?:\.000)?Z)?$/)
  const numeric = value.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/)
  const named = value.match(/^(\d{1,2})[\s-]+([a-z]{3,9})[\s,-]+(\d{2}|\d{4})$/i)
  if (iso) {
    year = Number(iso[1]); month = Number(iso[2]); day = Number(iso[3])
  } else if (numeric) {
    year = Number(numeric[3])
    month = Number(numeric[order === 'DMY' ? 2 : 1])
    day = Number(numeric[order === 'DMY' ? 1 : 2])
  } else if (named) {
    year = Number(named[3])
    month = monthNames.indexOf(named[2].slice(0, 3).toLowerCase()) + 1
    day = Number(named[1])
  } else return null
  if (year < 100) year += 2000
  if (year < 1900 || year > 2199 || month < 1 || month > 12 || day < 1 || day > 31) return null
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCDate() === day ? date.toISOString().slice(0, 10) : null
}

const fields = {
  date: ['transactiondate', 'transdate', 'date', 'postingdate', 'posteddate', 'bookingdate', 'valuedate', 'entrydate', 'effectivedate'],
  description: ['description', 'details', 'transactiondescription', 'transactiondetails', 'particulars', 'narrative', 'payee', 'merchant', 'memo', 'name', 'transactionremarks', 'remarks', 'paymentdetails', 'reference'],
  debit: ['debit', 'debitamount', 'withdrawal', 'withdrawals', 'amountout', 'moneyout', 'paidout', 'paymentsout'],
  credit: ['credit', 'creditamount', 'deposit', 'deposits', 'amountin', 'moneyin', 'paidin', 'paymentsin'],
  amount: ['amount', 'transactionamount', 'signedamount', 'netamount'],
  direction: ['type', 'transactiontype', 'direction', 'creditdebit', 'debitcredit', 'drcr', 'crdr'],
}

type Field = keyof typeof fields
const cleanHeader = (value: Cell) => String(value ?? '').trim().toLowerCase().replace(/\b(sgd|usd|aud|gbp|eur|cad)\b/g, '').replace(/[^a-z]/g, '')

export function parseRows(table: Cell[][], order: DateOrder, flip = false): Extraction {
  let at = -1
  let positions: Record<Field, number> | undefined
  for (let i = 0; i < Math.min(table.length, 100); i++) {
    const headers = table[i].map(cleanHeader)
    const columns = Object.fromEntries(Object.entries(fields).map(([key, aliases]) => [key, headers.findIndex(value => aliases.includes(value))])) as Record<Field, number>
    if (columns.date >= 0 && columns.description >= 0 && (columns.amount >= 0 || columns.debit >= 0 || columns.credit >= 0)) {
      at = i
      positions = columns
      break
    }
  }
  if (!positions) throw new Error('No transaction headers found. Use Date, Description and Amount, or separate Debit and Credit columns.')
  if (table.length - at - 1 > 20_000) throw new Error('This statement exceeds 20,000 rows. Split it into smaller files.')
  const c = positions
  const rows: Candidate[] = []
  const issues: Issue[] = []
  for (let i = at + 1; i < table.length; i++) {
    const row = table[i]
    if (!row.some(cell => String(cell ?? '').trim())) continue
    const date = parseDate(row[c.date], order)
    const description = String(row[c.description] ?? '').trim()
    let cents: number | null
    if (c.debit >= 0 || c.credit >= 0) {
      const fieldAmount = (index: number) => String(row[index] ?? '').trim() ? parseAmount(row[index]) : 0
      const debit = fieldAmount(c.debit)
      const credit = fieldAmount(c.credit)
      cents = debit === null || credit === null || (debit !== 0 && credit !== 0) ? null : Math.abs(credit) - Math.abs(debit)
    } else {
      cents = parseAmount(row[c.amount])
      const direction = String(row[c.direction] ?? '').trim().toLowerCase()
      if (cents !== null && /^(debit|dr|withdrawal|out)$/.test(direction)) cents = -Math.abs(cents)
      if (cents !== null && /^(credit|cr|deposit|in)$/.test(direction)) cents = Math.abs(cents)
    }
    if (!date || !description || description.length > 240 || cents === null || cents === 0) {
      issues.push({ line: i + 1, message: 'Missing or invalid date, description, or amount.' })
      continue
    }
    if (flip) cents = -cents
    rows.push({ date, description, cents, category: categorize(description, cents), review: false })
  }
  return { rows, issues }
}

const datePrefix = /^(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.](?:\d{4}|\d{2})|\d{1,2}[\s-]+[A-Za-z]{3,9}[\s,-]+(?:\d{4}|\d{2}))\s+/
const endingAmount = /\s+((?:[+-]\s*)?(?:S\$|US\$|SGD|USD|AUD|CAD|GBP|EUR|\$|€|£)?\s*(?:[+-])?\(?\d[\d,]*\.\d{2}\)?(?:\s*(?:DR|CR))?)$/i

export function parsePdfLines(lines: string[], order: DateOrder, flip = false): Extraction {
  const rows: Candidate[] = []
  const issues: Issue[] = []
  for (const [i, line] of lines.entries()) {
    const match = line.match(datePrefix)
    if (!match) continue
    const date = parseDate(match[1], order)
    const rest = line.slice(match[0].length)
    const amount = rest.match(endingAmount)
    const description = amount ? rest.slice(0, amount.index).trim() : ''
    const signed = amount && /[+\-()]|(?:DR|CR)$/i.test(amount[1])
    const cents = signed ? parseAmount(amount[1]) : null
    if (!date || !description || description.length > 240 || description.match(endingAmount) || !cents) {
      issues.push({ line: i + 1, message: 'Could not confidently identify a signed transaction amount.' })
      continue
    }
    const value = flip ? -cents : cents
    rows.push({ date, description, cents: value, category: categorize(description, value), review: true })
  }
  return { rows, issues }
}

export interface PdfFragment { x: number; width: number; y?: number; text: string }

export function findPdfStatementPeriod(lines: PdfFragment[][], order: DateOrder) {
  const date = String.raw`(?:\d{1,2} +[A-Za-z]{3,9} +\d{4}|[A-Za-z]{3,9} +\d{1,2},? +\d{4}|\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{4})`
  const pattern = new RegExp(String.raw`^(?:Statement period|Period|Date range)\s*:?\s*(${date})\s+(?:to|through|[–—-])\s+(${date})$`, 'i')
  for (const fragments of lines) {
    const match = fragments.map(fragment => fragment.text).join(' ').match(pattern)
    if (!match) continue
    const start = parseDate(match[1], order)
    const end = parseDate(match[2], order)
    if (start && end && start <= end && Number(end.slice(0, 4)) - Number(start.slice(0, 4)) <= 1) return { start, end }
  }
}

function parsePdfColumnDate(value: string, order: DateOrder, period?: { start: string; end: string }) {
  const full = parseDate(value, order)
  if (full || !period || !/^\d{1,2} +[A-Za-z]{3,9}$/.test(value)) return full
  const years = new Set([period.start.slice(0, 4), period.end.slice(0, 4)])
  const dates = [...years].map(year => parseDate(`${value} ${year}`, order))
    .filter(date => date && date >= period.start && date <= period.end)
  return dates.length === 1 ? dates[0] : null
}

type BalanceEntry = { date: string; balance: number; cents?: number }
export interface PdfBalanceTrace { entries: BalanceEntry[]; currencies: Set<Currency> }

export function reconcilePdfBalance(period: ReturnType<typeof findPdfStatementPeriod>, trace: PdfBalanceTrace, extraction: Extraction): StatementBalance | undefined {
  const { entries } = trace
  const opening = entries[0]
  if (!period || !opening || opening.cents !== undefined || opening.date !== period.start ||
    trace.currencies.size !== 1 || extraction.issues.length || entries.length !== extraction.rows.length + 1 || entries.length < 2) return
  let previous = opening
  for (const entry of entries.slice(1)) {
    if (entry.cents === undefined || entry.date < previous.date || entry.date > period.end || previous.balance + entry.cents !== entry.balance) return
    previous = entry
  }
  const [currency] = trace.currencies
  return { ...period, currency, opening: opening.balance, closing: previous.balance }
}

const pdfColumns = { ...fields, balance: ['balance', 'runningbalance', 'accountbalance', 'ledgerbalance'] }
export type PdfColumn = keyof typeof pdfColumns
export const pdfColumnNames = Object.keys(pdfColumns) as PdfColumn[]
export type PdfAliases = Partial<Record<PdfColumn, string>>


function readPdfHeader(fragments: PdfFragment[], aliases?: PdfAliases) {
  const columns: { key: PdfColumn; center: number }[] = []
  for (let start = 0; start < fragments.length; start++) {
    // Some PDFs store headings such as "Transaction Date" as separate words.
    for (let width = Math.min(3, fragments.length - start); width >= 1; width--) {
      const words = fragments.slice(start, start + width)
      const label = cleanHeader(words.map(word => word.text).join(' '))
      const key = pdfColumnNames.find(name => label && cleanHeader(aliases?.[name]) === label)
        ?? pdfColumnNames.find(name => pdfColumns[name].includes(label))
      if (!key) continue
      if (columns.some(column => column.key === key)) return
      const first = words[0]
      const last = words[words.length - 1]
      columns.push({ key, center: (first.x + last.x + last.width) / 2 })
      start += width - 1
      break
    }
  }
  const keys = new Set(columns.map(column => column.key))
  if (keys.has('date') && keys.has('description') &&
    (keys.has('amount') || keys.has('debit') || keys.has('credit'))) return columns
}

function pdfMovement(cells: Record<PdfColumn, string[]>, split: boolean, balance: number | null, previous: number | undefined) {
  if (split) {
    const debit = cells.debit.length ? parseAmount(cells.debit.join(' ')) : 0
    const credit = cells.credit.length ? parseAmount(cells.credit.join(' ')) : 0
    return debit === null || credit === null || Boolean(debit) === Boolean(credit) ? null : Math.abs(credit) - Math.abs(debit)
  }
  const raw = cells.amount.join(' ')
  const amount = parseAmount(raw)
  if (!amount) return null
  const direction = cells.direction.join(' ').toLowerCase()
  const explicitlySigned = /[+\-−–()]|(?:DR|CR)$/i.test(raw)
  if (/^(debit|dr|withdrawal|out)$/.test(direction)) return explicitlySigned && amount > 0 ? null : -Math.abs(amount)
  if (/^(credit|cr|deposit|in)$/.test(direction)) return amount < 0 ? null : amount
  if (direction) return null
  if (explicitlySigned) return amount
  if (balance === null || previous === undefined) return null
  const movement = balance - previous
  return Math.abs(movement) === amount ? movement : null
}

export function parsePdfPage(lines: PdfFragment[][], order: DateOrder, flip = false, period = findPdfStatementPeriod(lines, order), trace?: PdfBalanceTrace, aliases?: PdfAliases): Extraction {
  const rows: Candidate[] = []
  const issues: Issue[] = []
  let columns: ReturnType<typeof readPdfHeader>
  let previousBalance = trace?.entries.at(-1)?.balance
  let continuation: { row: Candidate; y: number; count: number } | undefined

  for (const [index, fragments] of lines.entries()) {
    const line = fragments.map(item => item.text).join(' ')
    const header = readPdfHeader(fragments, aliases)
    if (header) {
      continuation = undefined
      columns = header
      const units = new Set(line.toUpperCase().match(/\b(?:SGD|USD|AUD|CAD|GBP|EUR)\b/g) as Currency[] | null)
      if (units.size === 1 && trace) trace.currencies.add([...units][0])
      continue
    }
    if (!columns) {
      const parsed = parsePdfLines([line], order, flip)
      rows.push(...parsed.rows)
      issues.push(...parsed.issues.map(issue => ({ ...issue, line: index + 1 })))
      continue
    }
    const cells: Record<PdfColumn, string[]> = { date: [], description: [], debit: [], credit: [], amount: [], direction: [], balance: [] }
    for (const fragment of fragments) {
      const center = fragment.x + fragment.width / 2
      // Description text can span most of its column. Classify it by its start.
      const address = parseAmount(fragment.text) !== null ? center : fragment.x
      const column = columns.find((current, i) => {
        const next = columns?.[i + 1]
        return !next || address < (current.center + next.center) / 2
      })
      if (column) cells[column.key].push(fragment.text)
    }
    const unit = cells.balance.join(' ') as Currency
    if (trace && !cells.date.length && !cells.description.length && currencies.includes(unit)) trace.currencies.add(unit)
    const dateCell = cells.date.join(' ')
    const description = cells.description.join(' ')
    const y = fragments[0]?.y
    if (!dateCell) {
      if (continuation && y !== undefined && continuation.y - y > 0 && continuation.y - y <= 13 &&
        continuation.count < 3 && description && !cells.debit.length && !cells.credit.length && !cells.amount.length && !cells.direction.length && !cells.balance.length) {
        const details = continuation.row.descriptionDetails ?? ''
        continuation.row.descriptionDetails = [details, description].filter(Boolean).join(' ').slice(0, 240)
        continuation.y = y
        continuation.count++
      } else continuation = undefined
      continue
    }
    continuation = undefined
    const date = parsePdfColumnDate(dateCell, order, period)
    if (!date && !datePrefix.test(line) && !/^\d{1,2} +[A-Za-z]{3,9}$/.test(dateCell)) continue
    const balance = parseAmount(cells.balance.join(' '))
    const hasBalanceColumn = columns.some(column => column.key === 'balance')
    if (/^(?:opening balance|balance (?:brought forward|b\/f))$/i.test(description)) {
      if (date && balance !== null && !parseAmount(cells.debit.join(' ')) && !parseAmount(cells.credit.join(' ')) && !parseAmount(cells.amount.join(' '))) {
        trace?.entries.push({ date, balance })
        previousBalance = balance
      }
      continue
    }
    if (/^(?:closing balance|balance (?:carried forward|c\/f))$/i.test(description)) continue
    const split = columns.some(column => column.key === 'debit' || column.key === 'credit')
    const movement = pdfMovement(cells, split, balance, previousBalance)
    if (!date || !description || description.length > 240 || movement === null || (hasBalanceColumn && balance === null)) {
      previousBalance = undefined
      issues.push({ line: index + 1, message: 'Could not determine the date, transaction amount, or direction.' })
      continue
    }
    if (balance !== null) {
      if (previousBalance !== undefined && previousBalance + movement !== balance) {
        issues.push({ line: index + 1, message: 'This transaction does not match the change in the running balance.' })
        previousBalance = balance
        continue
      }
      trace?.entries.push({ date, balance, cents: movement })
      previousBalance = balance
    }
    const cents = flip ? -movement : movement
    const row = { date, description, cents, category: categorize(description, cents), review: true }
    rows.push(row)
    if (y !== undefined) continuation = { row, y, count: 0 }
  }
  return { rows, issues }
}
