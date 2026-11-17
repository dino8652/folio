import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { totals, reconcile } from '../src/domain/money.ts'
import { validateLedger, loadLedger } from '../src/domain/ledger-schema.ts'
import { commitImport, verifyExtraction, type ImportDraft } from '../src/domain/imports.ts'
import { emptyLedger } from '../src/ledger.ts'
import { SerialQueue } from '../src/data/serial-queue.ts'
import { ApiError, failure, readJson, requireOrigin, trustedOrigins } from '../worker/http.ts'
import { merchantRequest, discoverMerchant } from '../worker/services/merchants.ts'
import { consumeQuota } from '../worker/services/quota.ts'
import { workspaceKey } from '../worker/services/vault-keys.ts'
import { capabilities } from '../worker/services/capabilities.ts'
import type { Env } from '../worker/types.ts'

const now = new Date('2026-11-16T00:00:00Z')
function draft(): ImportDraft {
  return {name: 'statement.csv', hash: 'abc123', type: 'csv', accountId: 'bank', newAccount: {name: 'Everyday', bank: 'Bank'}, rows: [
    {date: '2026-11-01', description: 'Coffee', cents: -10000, category: 'Dining', review: false},
    {date: '2026-11-02', description: 'Deposit', cents: 1, category: 'Other deposits', review: false},
    {date: '2026-11-03', description: 'Own account transfer', cents: -5000, category: 'Transfer', review: false},
  ], selected: [true, true, true], balance: {start: '2026-11-01', end: '2026-11-30', opening: 46950, closing: 31951, currency: 'SGD'} }
}
const ids = {document: 'doc', transactions: ['t1', 't2', 't3']}
function env() {
  const db = new DatabaseSync(':memory:')
  db.exec('CREATE TABLE service_quotas(user_id TEXT, scope TEXT, bucket INTEGER, count INTEGER, PRIMARY KEY(user_id, scope)); CREATE TABLE vault_keys(user_id TEXT PRIMARY KEY, iv TEXT, cipher TEXT);')
  return { BETTER_AUTH_SECRET: 'test-only-32-character-secret-not-a-real-key', FIRECRAWL_API_KEY: 'test-only', DB: {prepare(sql: string) {
    let params: (string | number)[] = []
    return {bind(...values: (string | number)[]) {params = values; return this}, async first() { return db.prepare(sql).get(...params) ?? null }, async run() { return db.prepare(sql).run(...params) }}
  }}} as unknown as Env
}

test('money distinguishes spending, earned income, deposits and transfers without losing cents', () => {
  const rows = draft().rows
  assert.deepEqual(totals(rows), {income: 0, otherDeposits: 1, moneyIn: 1, spending: 10000, transfersIn: 0, transfersOut: 5000, net: -9999})
  assert.equal(reconcile(46950, 31951, rows).reconciled, true)
  assert.equal(reconcile(46950, 31950, rows).difference, -1)
  assert.throws(() => totals([{cents: 0.1, category: 'Other'}]), /whole cents/)
  assert.throws(() => totals([{cents: NaN, category: 'Other'}]), /whole cents/)
})
test('imports validate all money before committing and reject mismatched balances', () => {
  const data = draft()
  data.rows.forEach(row => row.review = true)
  const committed = commitImport(emptyLedger(), data, ids, now)
  assert.equal(committed.count, 3)
  assert.ok(committed.ledger.transactions.every(row => !row.review))
  data.balance!.closing++
  assert.throws(() => verifyExtraction(data.rows, data.balance), /do not match/)
  assert.equal(emptyLedger().transactions.length, 0)
})
test('repeat and overlapping imports are idempotent at commit time', () => {
  const first = commitImport(emptyLedger(), draft(), ids, now).ledger
  const replay = {...draft(), newAccount: undefined}
  assert.throws(() => commitImport(first, replay, ids, now), /already imported/)
  const second = {...replay, hash: 'different', rows: [...replay.rows, {date: '2026-11-04', description: 'Lunch', cents: -200, category: 'Dining' as const, review: false}], selected: [true,true,true,true], balance: undefined}
  const result = commitImport(first, second, {document: 'doc2', transactions: ['a','b','c','d']}, now)
  assert.equal(result.count, 1); assert.equal(result.ledger.transactions.length, 4)
  assert.equal(first.transactions.length, 3)
})
test('same-file repeated purchases remain distinct while historical duplicates are excluded', () => {
  const data = draft(); data.balance = undefined; data.rows = [data.rows[0], {...data.rows[0]}]; data.selected = [true,true]
  const first = commitImport(emptyLedger(), data, {document: 'doc', transactions: ['a','b']}, now)
  assert.equal(first.count, 2)
})
test('legacy ledger migration preserves keys and rejects orphaned or invalid financial data', () => {
  const ledger = commitImport(emptyLedger(), draft(), ids, now).ledger
  assert.equal(loadLedger({...ledger, schemaVersion: undefined}).schemaVersion, 2)
  assert.throws(() => validateLedger({...ledger, accounts: []}), /matching account/)
  assert.throws(() => validateLedger({...ledger, transactions: [{...ledger.transactions[0], cents: 1.25}]}), /whole cents/)
  assert.throws(() => validateLedger({...ledger, transactions: [{...ledger.transactions[0], date: '2026-02-30'}]}), /invalid date/)
  assert.throws(() => validateLedger({...ledger, schemaVersion: 99}), /newer version/)
})
test('an account deleted after preview and retention conflicts prevent the whole import', () => {
  assert.throws(() => commitImport(emptyLedger(), {...draft(), newAccount: undefined}, ids, now), /account was removed/)
  assert.throws(() => commitImport({...emptyLedger(), retention: 30}, draft(), ids, new Date('2027-01-01')), /retention window/)
})
test('queued writes run in order and a failure does not poison later writes', async () => {
  const queue = new SerialQueue(), calls: number[] = []
  const results = await Promise.allSettled([
    queue.run(async () => { await new Promise(resolve => setTimeout(resolve, 10)); calls.push(1) }),
    queue.run(async () => { calls.push(2); throw new Error('intentional') }),
    queue.run(async () => { calls.push(3) }),
  ])
  assert.deepEqual(calls, [1,2,3]); assert.equal(results[1].status, 'rejected'); assert.equal(results[2].status, 'fulfilled')
})
test('API parsing bounds bytes, rejects arrays and malformed requests and redacts unexpected errors', async () => {
  const request = (body: string, contentType = 'application/json') => new Request('https://folio.test/api', {method: 'POST', headers: {'Content-Type': contentType}, body})
  assert.deepEqual(await readJson(request('{"query":"cafe"}')), {query: 'cafe'})
  await assert.rejects(readJson(request('[]')), /JSON object/)
  await assert.rejects(readJson(request('{')), /JSON object/)
  await assert.rejects(readJson(request('x', 'text/plain')), /as JSON/)
  await assert.rejects(readJson(request('{"query":"' + 'x'.repeat(5000) + '"}')), /too large/)
  const response = failure(new Error('SECRET MUST NOT LEAK'), 'request-id')
  assert.equal(response.status, 500); assert.ok(!(await response.text()).includes('SECRET'))
})
test('production never trusts development origins, invalid origins cannot mutate data', () => {
  assert.deepEqual(trustedOrigins('https://folio.test'), ['https://folio.test'])
  assert.throws(() => requireOrigin(new Request('https://folio.test/api', {headers: {origin: 'http://127.0.0.1:4174'}})), /must come from Folio/)
  requireOrigin(new Request('https://folio.test/api', {headers: {origin: 'https://folio.test'}}))
})
test('merchant requests reject private URLs, credentials and ambiguous inputs', () => {
  for (const url of ['http://site.com','https://127.0.0.1','https://[::1]','https://a.internal','https://a.test','https://user:pass@site.com','https://site.com:1234']) assert.throws(() => merchantRequest({url}), ApiError)
  assert.throws(() => merchantRequest({url: 'https://site.com', query: 'Cafe'}), /either/)
  assert.equal(merchantRequest({query: 'Cafe Singapore'}).path, 'search')
})
test('quotas are atomic, scoped per owner, expire and supply retry timing', async () => {
  const config = env()
  await Promise.all([consumeQuota(config, 'a', 'test', 2, 60, 1000), consumeQuota(config, 'a', 'test', 2, 60, 1000)])
  await assert.rejects(consumeQuota(config, 'a', 'test', 2, 60, 1000), (error: unknown) => error instanceof ApiError && error.status === 429 && error.retryAfter === 59)
  await consumeQuota(config, 'b', 'test', 2, 60, 1000)
  await consumeQuota(config, 'a', 'test', 2, 60, 61000)
})
test('vault keys remain stable across concurrent opens and distinct between users', async () => {
  const config = env()
  const keys = await Promise.all([workspaceKey(config, 'a'), workspaceKey(config, 'a')])
  assert.equal(keys[0], keys[1]); assert.notEqual(keys[0], await workspaceKey(config, 'b'))
  await assert.rejects(workspaceKey({...config, BETTER_AUTH_SECRET: 'wrong-secret'}, 'a'), /saved data has not been changed/)
})
test('merchant proxy sends only query to fixed Firecrawl endpoint and never leaks upstream errors', async () => {
  const config = env()
  const result = await discoverMerchant(config, 'a', {query: 'Cafe'}, async (url, init) => {
    assert.equal(url, 'https://api.firecrawl.dev/v2/search')
    assert.equal(JSON.parse(init!.body as string).query, 'Cafe')
    return Response.json({success: true, data: {web: []}})
  })
  assert.deepEqual(result, {success: true, data: {web: []}})
  await assert.rejects(discoverMerchant(config, 'a', {query: 'Cafe'}, async () => new Response('secret', {status: 401})), /temporarily unavailable/)
})
test('capabilities reflect actual app configuration without exposing secrets', () => {
  const caps = capabilities(env())
  assert.equal(caps.google, false); assert.equal(caps.phoneVerification, false); assert.equal(caps.passwordReset, false)
  assert.equal(caps.twoFactor, true)
  assert.ok(!JSON.stringify(caps).includes('test-only'))
})
