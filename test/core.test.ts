import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseAmount, parseDate, parseRows, parsePdfLines, parsePdfPage, reconcilePdfBalance, type PdfBalanceTrace } from '../src/statement.ts'
import { categorize, correctImportedIncome, totals, findDuplicates, recurring, selectPeriod, prune, emptyLedger } from '../src/ledger.ts'
import { createEnvelope, openEnvelope, seal } from '../src/crypto.ts'
import { readCsv, readWorkbook, validateZip } from '../src/readers.ts'
import { readFile } from 'node:fs/promises'
import { fakeZip } from './fixtures.ts'

test('reads exact cents and rejects malformed or over-precise amounts', () => {
  assert.equal(parseAmount('S$1,234.56 DR'), -123456)
  assert.equal(parseAmount('(1,234.5)'), -123450)
  assert.equal(parseAmount('1,23'), null)
  assert.equal(parseAmount('10.005'), null)
})

test('validates calendar dates and respects selected date ordering', () => {
  assert.equal(parseDate('01/02/2026', 'DMY'), '2026-02-01')
  assert.equal(parseDate('01/02/2026', 'MDY'), '2026-01-02')
  assert.equal(parseDate('2026-02-30', 'DMY'), null)
})

test('reads an offset debit/credit table and reports unrecoverable rows', () => {
  const result = parseRows([['Your statement'], ['Date','Details','Debit','Credit','Balance'], ['01/02/2026','Coffee','4.50','','95.50'], ['02/02/2026','Salary','','1000','1095.5'], ['bad','Unparsed','1','','']], 'DMY')
  assert.deepEqual(result.rows.map(row => row.cents), [-450, 100000])
  assert.equal(result.issues.length, 1)
})

test('text PDF candidates are flagged and balance columns are never imported as amounts', () => {
  const result = parsePdfLines(['Date Description Amount Balance', '2026-03-04 Coffee -4.50 95.50', '2026-03-05 No amount'], 'DMY')
  assert.equal(result.rows.length, 0)
  assert.equal(result.issues.length, 2)
  assert.equal(parsePdfLines(['2026-03-04 Coffee -4.50'], 'DMY').rows[0].review, true)
  assert.equal(parsePdfLines(['2026-03-04 Coffee 4.50'], 'DMY').rows.length, 0)
})

test('totals exclude transfers, and date periods include their endpoints', () => {
  const rows = [
    { date: '2026-02-01', cents: 100000, category: 'Income' },
    { date: '2026-02-28', cents: -10330, category: 'Dining' },
    { date: '2026-02-03', cents: -900, category: 'Transfer' },
    { date: '2026-03-01', cents: -300, category: 'Dining' },
  ]
  assert.deepEqual(totals(selectPeriod(rows, '2026-02', 1)), { income: 100000, otherDeposits: 0, moneyIn: 100000, spending: 10330, transfersIn: 0, transfersOut: 900, net: 89670 })
})

test('matches duplicates by account and original description, preserving same-file multiplicity', () => {
  const row = { date: '2026-02-01', cents: -800, description: 'COFFEE SHOP' }
  const old = [{ ...row, description: 'Edited', original: 'coffee shop', accountId: 'a' }]
  assert.deepEqual(findDuplicates(old, [row, row], 'a'), [true, false])
  assert.deepEqual(findDuplicates(old, [row], 'b'), [false])
})

test('recurring charges need three months with similar amounts', () => {
  const train = ['01', '02', '03'].map(month => ({ date: `2026-${month}-15`, description: 'Train', cents: -500, category: 'Transport', accountId: 'a' }))
  assert.equal(recurring(train.slice(0, 2)).length, 0)
  assert.equal(recurring(train)[0].cents, 500)
})

test('retention removes old records with no retained document orphans', () => {
  const data = { ...emptyLedger(), retention: 30, transactions: [
    { id:'old', documentId:'1', date:'2026-01-01' },
    { id:'new', documentId:'2', date:'2026-02-05' },
  ], documents: [{id:'1'},{id:'2'}] }
  assert.deepEqual(prune(data as never, new Date('2026-03-01')).documents.map(doc=>doc.id), ['2'])
})

test('vault rejects a different password and altered ciphertext; updated records use fresh nonces', async () => {
  const first = await createEnvelope('a sufficiently long passphrase', { value: 'private payload' })
  const save = await seal(first.key, first.record.salt, { value: 'updated' })
  assert.notDeepEqual(first.record.iv, save.iv)
  assert.equal((await openEnvelope<{value:string}>('a sufficiently long passphrase', first.record)).data.value, 'private payload')
  await assert.rejects(openEnvelope('a completely different passphrase', first.record))
  const altered = new Uint8Array(save.cipher.slice(0))
  altered[0] ^= 1
  await assert.rejects(openEnvelope('a sufficiently long passphrase', { ...save, cipher: altered.buffer }))
  assert.throws(() => new TextDecoder('utf-8', {fatal:true}).decode(save.cipher))
})

test('CSV preserves quoted commas and newlines, and flags broken quoting', () => {
  const result = readCsv('Date,Description,Amount\r\n2026-01-03,"Bakery, Inc.\nCard",-6.50')
  assert.equal(result[1][1], 'Bakery, Inc.\nCard')
  assert.throws(() => readCsv('Date,Description,Amount\n"2026-01-03,Bakery,-6.50'))
})

test('Excel reader processes real workbooks and bounds expanded ZIP size', async () => {
  const bytes = await readFile(new URL('./statement.xlsx', import.meta.url))
  const rows = await readWorkbook(Uint8Array.from(bytes).buffer)
  assert.equal(parseRows(rows, 'DMY').rows[0].cents, -1250)
  assert.throws(() => validateZip(fakeZip(60 * 1024 * 1024)))
})

test('a two-factor vault requires both secrets even if the passkey metadata is removed', async () => {
  const password = 'a test passphrase for encryption'
  const data = { test: true }
  const secret = crypto.getRandomValues(new Uint8Array(32))
  const factor = { id: new Uint8Array([1, 2, 3]).buffer, salt: new Uint8Array(32) }
  const { key, record } = await createEnvelope(password, data, { factor, secret })
  const updated = await seal(key, record.salt, data, record.passkey)
  await assert.rejects(openEnvelope(password, updated))
  await assert.rejects(openEnvelope(password, { ...updated, passkey: undefined }))
  await assert.rejects(openEnvelope(password, updated, new Uint8Array(32)))
  await assert.rejects(openEnvelope('incorrect passphrase', updated, secret))
  assert.deepEqual((await openEnvelope(password, updated, secret)).data, data)
})

test('PDF withdrawal and deposit columns determine direction without importing the balance', () => {
  const cell = (x: number, text: string, width = 30) => ({ x, text, width })
  const header = [cell(10, 'Date'), cell(100, 'Transaction Details'), cell(270, 'Withdrawals'), cell(370, 'Deposits'), cell(470, 'Balance')]
  const text = [cell(10, '04 Oct 2026', 65), cell(100, 'Transfer', 45)]
  const result = parsePdfPage([
    header,
    [...text, cell(270, '12.50'), cell(470, '987.50')],
    [...text, cell(370, '100.00'), cell(470, '1,087.50')],
    [...text, cell(470, '1,087.50')],
    [...text, cell(270, '12.50'), cell(370, '100.00'), cell(470, '1,175.00')],
  ], 'DMY')
  assert.deepEqual(result.rows.map(row => [row.cents, row.review]), [[-1250, true], [10000, true]])
  assert.equal(result.issues.length, 2)
})

test('PDF dates without years use the printed period across New Year', () => {
  const cell = (x: number, text: string) => ({ x, text, width: 30 })
  const header = [cell(10, 'Date'), cell(100, 'Description'), cell(270, 'Withdrawals'), cell(370, 'Deposits'), cell(470, 'Balance')]
  const lines = [
    header,
    [cell(10, '31 Dec'), cell(100, 'Coffee'), cell(270, '12.50'), cell(470, '987.50')],
    [cell(10, '01 Jan'), cell(100, 'Transfer'), cell(370, '100.00'), cell(470, '1,087.50')],
    [cell(10, '15 Jan'), cell(100, 'Outside period'), cell(270, '5.00'), cell(470, '1,082.50')],
  ]
  const result = parsePdfPage([[cell(10, 'Period: 28 Dec 2025 to 04 Jan 2026')], ...lines], 'DMY')
  assert.deepEqual(result.rows.map(row => [row.date, row.cents]), [['2025-12-31', -1250], ['2026-01-01', 10000]])
  assert.equal(result.issues.length, 1)
  assert.equal(parsePdfPage(lines, 'DMY').rows.length, 0)
})

test('PDF statement balances are kept only when the printed running balances reconcile', () => {
  const cell = (x: number, text: string) => ({ x, text, width: 30 })
  const period = { start: '2026-10-01', end: '2026-10-31' }
  const trace: PdfBalanceTrace = { entries: [], currencies: new Set() }
  const extraction = parsePdfPage([
    [cell(10, 'Date'), cell(100, 'Description'), cell(270, 'Withdrawals'), cell(370, 'Deposits'), cell(470, 'Balance')],
    [cell(270, 'SGD'), cell(370, 'SGD'), cell(470, 'SGD')],
    [cell(10, '01 Oct'), cell(100, 'BALANCE B/F'), cell(470, '100.00')],
    [cell(10, '04 Oct'), cell(100, 'Coffee'), cell(270, '12.50'), cell(470, '87.50')],
  ], 'DMY', false, period, trace)
  assert.deepEqual(reconcilePdfBalance(period, trace, extraction), { ...period, currency: 'SGD', opening: 10000, closing: 8750 })
  trace.entries[1].balance = 8500
  assert.equal(reconcilePdfBalance(period, trace, extraction), undefined)
})

test('unidentified deposits and transfers never inflate earned income', () => {
  const rows = [
    { description: 'Groceries', cents: -10000 },
    { description: 'Bank credit', cents: 1 },
    { description: 'Own account transfer', cents: 20000 },
  ].map(row => ({ ...row, category: categorize(row.description, row.cents) }))
  assert.deepEqual(totals(rows), { income: 0, otherDeposits: 1, moneyIn: 1, spending: 10000, transfersIn: 20000, transfersOut: 0, net: -9999 })
  assert.equal(categorize('Monthly salary', 10000), 'Income')
  const old = { ...rows[1], original: 'Bank credit', category: 'Income' as const, date: '2026-10-01', review: false, id: '1', accountId: 'a', documentId: 'd' }
  const ledger = { ...emptyLedger(), transactions: [old, { ...old, id: '2', categoryEdited: true }] }
  assert.deepEqual(correctImportedIncome(ledger).transactions.map(row => row.category), ['Other deposits', 'Income'])
})

test('PDF column mappings read custom headings and only infer unsigned amounts when balances agree', () => {
  const cell = (x: number, text: string) => ({ x, text, width: 30 })
  const trace: PdfBalanceTrace = { entries: [], currencies: new Set() }
  const period = { start: '2026-10-01', end: '2026-10-31' }
  const result = parsePdfPage([
    [cell(10, 'Posted'), cell(100, 'Merchant line'), cell(300, 'Change SGD'), cell(470, 'After payment')],
    [cell(10, 'Oct 1, 2026'), cell(100, 'Opening balance'), cell(470, '100.00')],
    [cell(10, 'Oct 2, 2026'), cell(100, 'Groceries'), cell(300, '17.50'), cell(470, '82.50')],
    [cell(10, 'Oct 3, 2026'), cell(100, 'Cafe'), cell(300, '9.00'), cell(470, '75.50')],
  ], 'DMY', false, period, trace, { date: 'Posted', description: 'Merchant line', amount: 'Change', balance: 'After payment' })
  assert.deepEqual(result.rows.map(row => row.cents), [-1750])
  assert.equal(result.issues.length, 1)
  assert.equal(reconcilePdfBalance(period, trace, result), undefined)
})
