import { test, expect } from '@playwright/test'
import { createHmac } from 'node:crypto'
// Each browser represents a distinct client. Cloudflare supplies this header in
// production; isolated loopback tests supply synthetic addresses to avoid sharing
// one auth rate-limit bucket across unrelated test accounts.
test.beforeEach(async ({context}) => {
  const suffix = crypto.getRandomValues(new Uint8Array(2))
  await context.setExtraHTTPHeaders({'CF-Connecting-IP': `198.18.${suffix[0]}.${suffix[1]}`})
})

const origin = 'http://127.0.0.1:4173'
const headers = {Origin: origin}
const password = 'a local test password for folio'
function totp(secret: string) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const bits = [...secret.toUpperCase().replace(/=+$/, '')].map(c => alphabet.indexOf(c).toString(2).padStart(5,'0')).join('')
  const key = Buffer.from(bits.match(/.{8}/g)!.map(byte => parseInt(byte,2)))
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)))
  const digest = createHmac('sha1', key).update(counter).digest(), offset = digest.at(-1)! & 15
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).toString().padStart(6,'0')
}

test('Worker API boundaries, session ownership and persistent workspace key', async ({playwright}) => {
  const client = await playwright.request.newContext({baseURL: origin, extraHTTPHeaders: headers})
  const health = await client.get('/api/health')
  expect(await health.json()).toEqual({status: 'ok', version: 2})
  expect(health.headers()['cache-control']).toBe('no-store')
  expect(health.headers()['x-request-id']).toBeTruthy()
  expect((await client.post('/api/vault-key')).status()).toBe(401)
  const signup = await client.post('/api/auth/sign-up/email', {data: {email: `backend-${crypto.randomUUID()}@example.com`, password, name: 'Backend test'}})
  expect(signup.ok()).toBe(true)
  const first = await client.post('/api/vault-key'), second = await client.post('/api/v2/vault-key')
  expect(first.ok()).toBe(true); expect(second.ok()).toBe(true)
  const a = await first.json(), b = await second.json()
  expect(a.key).toBe(b.key)
  expect((await client.get('/api/session')).ok()).toBe(true)
  expect((await client.get('/api/missing')).status()).toBe(404)
  expect((await client.get('/api/vault-key')).status()).toBe(405)
  expect((await client.post('/api/vault-key', {headers: {Origin: 'https://attacker.invalid'}})).status()).toBe(403)
  expect((await client.post('/api/merchant', {data: {query: ''}})).status()).toBe(400)
  const malformed = await client.post('/api/merchant', {headers: {'Content-Type': 'application/json'}, data: '{'})
  expect(malformed.status()).toBe(400)
  const other = await playwright.request.newContext({baseURL: origin, extraHTTPHeaders: headers})
  expect((await other.post('/api/vault-key', {data: {userId: a.user.id}})).status()).toBe(401)
  await other.dispose(); await client.dispose()
})

test('authenticator setup, verified sign-in, recovery and disabling work through the real Worker', async ({page}) => {
  const email = `two-factor-${crypto.randomUUID()}@example.com`
  await page.goto('/')
  await page.getByRole('button', {name: 'Make it yours', exact: true}).click()
  await page.getByLabel('Email address').fill(email)
  await page.getByLabel('Password', {exact: true}).fill(password)
  await page.getByRole('button', {name: 'Create account', exact: true}).click()
  await expect(page.getByRole('dialog', {name: 'Set up Folio'})).toBeVisible()
  for (let i=0;i<3;i++) await page.getByRole('button', {name: 'Continue', exact: true}).click()
  await page.getByRole('button', {name: 'Open my workspace'}).click()
  await page.getByRole('link', {name: 'Settings & privacy'}).click()
  await page.getByRole('button', {name: 'Set up 2FA'}).click()
  await page.getByLabel('Current password').fill(password)
  await page.getByRole('button', {name: 'Set up authenticator', exact: true}).click()
  const secret = await page.locator('.settings-grid code').innerText()
  const backupCode = (await page.locator('.settings-grid pre').innerText()).split('\n')[0]
  await page.getByLabel('Authenticator code', {exact: true}).fill(totp(secret))
  await page.getByRole('button', {name: 'Verify and enable'}).click()
  await expect(page.getByText('Authenticator verification is enabled for future sign-ins.')).toBeVisible()
  await page.getByRole('button', {name: 'Lock now'}).click()
  await page.getByRole('button', {name: 'Sign in', exact: false}).click()
  await page.getByLabel('Email address').fill(email)
  await page.getByLabel('Password', {exact: true}).fill(password)
  await page.locator('.account-form').getByRole('button', {name: 'Sign in', exact: true}).click()
  await expect(page.getByText('Verify it’s you')).toBeVisible()
  expect((await page.request.post('/api/vault-key', {headers})).status()).toBe(401)
  await page.getByRole('button', {name: 'Use a recovery code'}).click()
  await page.getByLabel('Recovery code', {exact: true}).fill(backupCode)
  await page.getByRole('button', {name: 'Verify and sign in'}).click()
  await expect(page.getByRole('heading', {name: 'Settings & privacy', exact: true})).toBeVisible()
  await page.getByRole('button', {name: 'Manage 2FA'}).click()
  await page.getByLabel('Current password').fill(password)
  await page.getByRole('button', {name: 'Disable authenticator'}).click()
  await expect(page.getByText('Authenticator verification is disabled.')).toBeVisible()
})

test('a service outage is actionable and does not masquerade as a signed-out account', async ({page}) => {
  await page.route('**/api/vault-key', route => route.fulfill({status: 503, json: {message: 'Workspace service is temporarily unavailable.', code: 'TEMPORARY'}}))
  await page.goto('/')
  await expect(page.getByRole('heading', {name: 'Vault unavailable'})).toBeVisible()
  await expect(page.getByText('Workspace service is temporarily unavailable.')).toBeVisible()
  await expect(page.getByRole('button', {name: 'Try again'})).toBeVisible()
  await expect(page.getByRole('button', {name: 'Make it yours'})).toHaveCount(0)
})
