import { expect, test, type Page } from '@playwright/test'
import { fileURLToPath } from 'node:url'

// Each browser represents a distinct client. Cloudflare supplies this header in
// production; isolated loopback tests supply synthetic addresses to avoid sharing
// one auth rate-limit bucket across unrelated test accounts.
test.beforeEach(async ({context}) => {
  const suffix = crypto.getRandomValues(new Uint8Array(2))
  await context.setExtraHTTPHeaders({'CF-Connecting-IP': `198.18.${suffix[0]}.${suffix[1]}`})
})

const password = 'sample secure test phrase'
const accountEmails = new WeakMap<Page, string>()
const csv = Buffer.from('Date,Description,Amount\n2026-11-01,Monthly salary,1000\n2026-11-06,Coffee House,-15.20\n2026-11-10,Unusual test description,-90')

async function createVault(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Make it yours', exact: true }).click()
  const email = `folio-test-${crypto.randomUUID()}@example.com`
  accountEmails.set(page, email)
  await page.getByLabel('Email address').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Set up Folio' })).toBeVisible()
  for (let step = 0; step < 3; step++) await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.getByRole('button', { name: 'Open my workspace' }).click()
  await page.getByRole('button', { name: 'Import statement', exact: true }).first().click()
  await expect(page.getByRole('dialog', { name: 'Import a statement' })).toBeVisible()
}

async function openScan(page: Page, file: string | { name: string; mimeType: string; buffer: Buffer }, createAccount = false) {
  await page.getByLabel('Statement file').setInputFiles(file)
  if (createAccount) {
    await page.getByLabel('Account name', { exact: true }).fill('Test current')
    await page.getByLabel('Bank', { exact: true }).fill('Test Bank')
  }
  await page.getByRole('button', { name: 'Review import' }).click()
}

async function commit(page: Page, count: number) {
  await page.getByRole('button', { name: `Import ${count} transactions`, exact: true }).click()
  await expect(page.getByRole('status')).toHaveText(`${count} ${count === 1 ? 'transaction' : 'transactions'} imported.`)
}

test('landing is responsive and contains no sample transactions', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  for (const [width, height] of [[375, 812], [812, 375], [768, 1024], [1024, 768], [1440, 900]]) {
    await page.setViewportSize({ width, height })
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Your money. More meaning.' })).toBeVisible()
    await expect(page.getByText('Sample data', { exact: true })).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
})

test('CSV import, duplicate review, editing, budgets, encryption, lock and deletion', async ({ page, browser }) => {
  const errors: string[] = []
  const outbound: string[] = []
  await page.route('**/api/merchant', route => route.fulfill({ json: { success: true, data: { web: [], images: [] } } }))
  page.on('pageerror', error => errors.push(error.message))
  page.on('request', request => { if (/^https?:/.test(request.url()) && !request.url().startsWith('http://127.0.0.1:4173/')) outbound.push(request.url()) })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await createVault(page)
  await page.getByRole('checkbox', { name: 'Keep an encrypted copy of the original file' }).check()
  await openScan(page, { name: 'statement.csv', mimeType: 'text/csv', buffer: csv }, true)
  await expect(page.getByRole('dialog', { name: 'Review transactions' })).toBeVisible()
  await expect(page.getByText('3 of 3 selected')).toBeVisible()
  await commit(page, 3)
  await expect(page.locator('.hero-value .sr-only')).toHaveText('$105.20')
  await page.getByRole('button', { name: 'Show money in and out' }).click()
  await expect(page.locator('.finance-details dl > div').filter({hasText: 'Net change'})).toContainText('$894.80')
  const record = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('folio-private-vault', 1)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    return new Promise<{ keys: string[]; contents: string }>((resolve, reject) => {
      const request = db.transaction('vault').objectStore('vault').getAll()
      request.onsuccess = () => { resolve({ keys: Object.keys(request.result[0]).sort(), contents: new TextDecoder().decode(request.result[0].cipher) }); db.close() }
      request.onerror = () => reject(request.error)
    })
  })
  expect(record.keys).toEqual(['cipher', 'iv', 'revision', 'salt', 'version'])
  expect(record.contents).not.toContain('Unusual test description')

  await page.getByRole('button', { name: 'Import statement', exact: true }).first().click()
  await openScan(page, { name: 'repeat.csv', mimeType: 'text/csv', buffer: csv })
  await expect(page.getByRole('alert')).toHaveText('This exact file was already imported into this account.')
  await openScan(page, { name: 'overlap.csv', mimeType: 'text/csv', buffer: Buffer.from('Date,Description,Amount\n2026-11-06,Coffee House,-15.20\n2026-11-11,Second bakery,-12.80') })
  await expect(page.getByText('1 of 2 selected')).toBeVisible()
  await expect(page.getByRole('checkbox', { name: /Include Coffee House/ })).not.toBeChecked()
  await commit(page, 1)

  await page.getByRole('button', { name: 'Coffee House' }).click()
  await page.getByLabel('Description', { exact: true }).fill('Morning coffee')
  await page.getByRole('combobox', { name: 'Category', exact: true }).selectOption('Other')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByRole('button', { name: 'Morning coffee' })).toBeVisible()

  await page.getByRole('link', { name: 'Budgets', exact: true }).click()
  await page.getByRole('button', { name: 'Set budget' }).click()
  await page.getByRole('combobox', { name: 'Category', exact: true }).selectOption('Other')
  await page.getByLabel('Monthly limit (SGD)').fill('200.00')
  await page.getByRole('button', { name: 'Save budget' }).click()
  await expect(page.getByText('$94.80 left')).toBeVisible()

  await page.getByRole('link', { name: 'Documents', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Download statement.csv' })).toBeVisible()
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download statement.csv' }).click()])
  expect(download.suggestedFilename()).toBe('statement.csv')

  const other = await browser.newContext()
  const separate = await other.newPage()
  await separate.goto('/#transactions')
  await expect(separate.getByRole('button', { name: 'Make it yours' })).toBeVisible()
  await expect(separate.getByText('Morning coffee', { exact: true })).toHaveCount(0)
  await other.close()

  await page.getByRole('button', { name: /Private vault Unlocked/ }).click()
  await page.getByRole('button', { name: 'Sign in', exact: false }).click()
  await expect(page.getByRole('heading', { name: 'Sign in to Folio' })).toBeVisible()
  await page.getByLabel('Email address').fill(accountEmails.get(page)!)
  await page.getByLabel('Password', { exact: true }).fill('wrong password')
  await page.locator('.account-form').getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveText('Invalid email or password')
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.locator('.account-form').getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByText('Original kept', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Remove original' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Remove original' }).click()
  await expect(page.getByRole('button', { name: 'Download statement.csv' })).toHaveCount(0)
  await page.getByRole('link', { name: 'Settings & privacy' }).click()
  await page.getByRole('button', { name: 'Delete vault' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Delete vault' }).click()
  await expect(page.getByRole('button', { name: 'Make it yours' })).toBeVisible()
  expect(errors).toEqual([])
  expect(outbound).toEqual([])
})

test('Excel and text PDF import use local readers and require uncertain PDF rows to be selected', async ({ page }) => {
  await createVault(page)
  await openScan(page, fileURLToPath(new URL('./statement.xlsx', import.meta.url)), true)
  await expect(page.getByText('1 of 1 selected')).toBeVisible()
  await commit(page, 1)
  await page.getByRole('button', { name: 'Import statement', exact: true }).first().click()
  await openScan(page, fileURLToPath(new URL('./statement.pdf', import.meta.url)))
  await expect(page.getByText('0 of 1 selected')).toBeVisible()
  await expect(page.getByText('Amounts could not be verified against a running balance.', { exact: false })).toBeVisible()
  await page.getByRole('checkbox', { name: /Include Cloud Coffee/ }).check()
  await commit(page, 1)
  await expect(page.getByText('Review extraction', { exact: true })).toBeVisible()
})

test('a stale tab cannot overwrite a newer vault revision and locks when another tab deletes it', async ({ page, context }) => {
  await createVault(page)
  await page.getByRole('button', { name: 'Close dialog' }).click()
  await page.getByRole('link', { name: 'Budgets', exact: true }).click()
  const stale = await context.newPage()
  await stale.goto('/#budgets')
  await expect(stale.getByRole('heading', { name: 'Budgets', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Set budget' }).click()
  await page.getByLabel('Monthly limit (SGD)').fill('900')
  await page.getByRole('button', { name: 'Save budget' }).click()
  await expect(page.getByText('$900.00 left')).toBeVisible()

  await stale.getByRole('button', { name: 'Set budget' }).click()
  await stale.getByLabel('Monthly limit (SGD)').fill('1')
  await stale.getByRole('button', { name: 'Save budget' }).click()
  await expect(stale.getByRole('alert')).toHaveText('The vault changed in another tab. Lock and unlock it to refresh.')
  await expect(page.getByText('$900.00 left')).toBeVisible()

  await page.getByRole('link', { name: 'Settings & privacy' }).click()
  await page.getByRole('button', { name: 'Delete vault' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Delete vault' }).click()
  await expect(stale.getByRole('alert')).toHaveCount(0)
  await expect(stale.getByText('$900.00 left')).toHaveCount(0)
  await expect(stale.getByRole('button', { name: 'Make it yours' })).toBeVisible()
})

test('merchant discovery loads automatically and maps source coordinates', async ({ page }) => {
  await page.route('**/api/merchant', route => route.fulfill({ json: { success: true, data: { web: [{title: 'Coffee House', url: 'https://example.com', rawHtml: '<script type="application/ld+json">{"name":"Coffee House","address":"10 Test Road","geo":{"latitude":1.3,"longitude":103.8}}</script>'}], images: [] } } }))
  await createVault(page)
  await openScan(page, { name: 'statement.csv', mimeType: 'text/csv', buffer: csv }, true)
  await commit(page, 3)
  await page.getByRole('button', { name: 'Coffee House', exact: true }).click()
  await expect(page.getByText('10 Test Road', { exact: true })).toBeVisible()
  await expect(page.locator('iframe[title="Possible merchant location"]')).toHaveAttribute('src', /openstreetmap/)
  await expect(page.getByLabel('Firecrawl API key')).toHaveCount(0)
})

test('reload restores the workspace and reuses an encrypted AI key', async ({ page }) => {
  const requests: string[] = []
  await page.route('https://generativelanguage.googleapis.com/**', async route => {
    if (route.request().method() === 'GET') return route.fulfill({json:{models:[{name:'models/test-selected',supportedGenerationMethods:['generateContent']}]}})
    requests.push(route.request().headers()['x-goog-api-key'])
    await route.fulfill({ json: { candidates: [{ content: { parts: [{ text: 'Your spending recap.' }] } }] } })
  })
  await createVault(page)
  await openScan(page, { name: 'statement.csv', mimeType: 'text/csv', buffer: csv }, true)
  await commit(page, 3)
  await page.getByRole('link', { name: 'Spending', exact: true }).click()
  const openRecap = page.getByRole('button', { name: 'AI spending recap' })
  await openRecap.click()
  await page.getByLabel('API key', { exact: true }).fill('test-recap-key')
  await page.getByLabel('Model', {exact:true}).selectOption('test-selected')
  await page.getByRole('button', { name: 'Send and generate' }).click()
  await expect(page.getByText('Your spending recap.', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Send and generate' })).toBeEnabled()
  await page.reload()
  await expect(openRecap).toBeVisible()
  await openRecap.click()
  await expect(page.getByLabel('API key', { exact: true })).toHaveCount(0)
  await expect(page.getByText('test-selected · Using your saved key')).toBeVisible()
  await page.getByRole('button', { name: 'Send and generate' }).click()
  await expect(page.getByText('Your spending recap.', { exact: true })).toBeVisible()
  expect(requests).toEqual(['test-recap-key', 'test-recap-key'])
})

test('AI import cleanup sends previewed text only after approval and applies just the description', async ({ page }) => {
  const payloads: string[] = []
  await page.route('https://generativelanguage.googleapis.com/**', async route => {
    if (route.request().method() === 'GET') return route.fulfill({json:{models:[{name:'models/test-selected',supportedGenerationMethods:['generateContent']}]}})
    const prompt = route.request().postDataJSON().contents[0].parts[0].text as string
    payloads.push(prompt)
    let text = 'Sample recap.'
    if (prompt.startsWith('Clean up')) text = '[{"id":0,"text":"Coffee House","cents":1}]'
    if (prompt.startsWith('Map bank')) text = '{"date":"Posted On","description":"Narrative","amount":"Change"}'
    await route.fulfill({ json: { candidates: [{ content: { parts: [{ text }] } }] } })
  })
  await createVault(page)
  await openScan(page, { name: 'statement.csv', mimeType: 'text/csv', buffer: csv }, true)
  await commit(page, 3)
  await page.getByRole('link', { name: 'Spending', exact: true }).click()
  await page.getByRole('button', { name: 'AI spending recap' }).click()
  await page.getByLabel('API key', { exact: true }).fill('test-recap-key')
  await page.getByLabel('Model', {exact:true}).selectOption('test-selected')
  await page.getByRole('button', { name: 'Send and generate' }).click()
  await expect(page.getByRole('button', { name: 'Send and generate' })).toBeEnabled()
  await page.getByRole('button', { name: 'Close dialog' }).click()
  await page.getByRole('button', { name: 'Import statement', exact: true }).first().click()
  const statement = Buffer.from('Date,Description,Amount\n2026-11-12,Coffee House POS 1234-5678-9012,-17.20')
  await openScan(page, { name: 'second.csv', mimeType: 'text/csv', buffer: statement })
  await page.getByRole('button', { name: 'Fix selected descriptions with AI' }).click()
  await expect(page.getByText('0. Coffee House POS', { exact: true })).toBeVisible()
  expect(payloads.length).toBe(1)
  await page.getByRole('button', { name: 'Send selected descriptions' }).click()
  await page.getByRole('button', { name: 'Apply selected edits' }).click()
  expect(JSON.parse(payloads[1].split('\n').at(-1)!)).toEqual([{ id: 0, text: 'Coffee House POS' }])
  const row = page.getByRole('row').filter({ hasText: 'Coffee House' })
  await expect(row).toContainText('2026-11-12')
  await expect(row).toContainText('17.20')
  await expect(row).not.toContainText('POS')
  await commit(page, 1)
  await page.getByRole('button', { name: 'Import statement', exact: true }).first().click()
  await page.getByLabel('Statement file').setInputFiles(fileURLToPath(new URL('./statement.pdf', import.meta.url)))
  await page.getByText('Help Folio read unfamiliar PDF columns').click()
  await page.getByLabel('Get AI suggestions for column headings').fill('Posted On | Narrative | Change')
  await page.getByRole('button', { name: 'Send headings to AI' }).click()
  await page.getByRole('button', { name: 'Use suggested column names' }).click()
  expect(JSON.parse(payloads[2].split('\n').at(-1)!)).toEqual(['Posted On', 'Narrative', 'Change'])
  await expect(page.getByLabel('Transaction date', { exact: true })).toHaveValue('Posted On')
})

test('BYOK pipeline enriches CSV without changing dates or cents and imports a reconciled PDF', async ({page}) => {
  await page.route('https://generativelanguage.googleapis.com/**', route => route.fulfill({json:route.request().method() === 'GET' ? {models:[{name:'models/test-selected',supportedGenerationMethods:['generateContent']}]} : {candidates:[{content:{parts:[{text:'Ready.'}]}}]}}))
  await createVault(page)
  await openScan(page,{name:'first.csv',mimeType:'text/csv',buffer:csv},true)
  await commit(page,3)
  await page.getByRole('link',{name:'Spending',exact:true}).click()
  await page.getByRole('button',{name:'AI spending recap'}).click()
  await page.getByLabel('API key',{exact:true}).fill('test-pipeline-key')
  await page.getByLabel('Model', {exact:true}).selectOption('test-selected')
  await page.getByRole('button',{name:'Send and generate'}).click()
  await expect(page.getByText('Ready.',{exact:true})).toBeVisible()
  await page.getByRole('button',{name:'Close dialog'}).click()
  const payloads: Record<string,any>[]=[]
  await page.route('**/api/statements/parse',async route=>{
    const body=route.request().postDataJSON();payloads.push(body)
    expect(body.key).toBe('test-pipeline-key');expect(body.model).toBeTruthy();expect(body.provider).toBe('gemini')
    await route.fulfill({json:body.task==='enrich'?{text:JSON.stringify({rows:[{idx:0,merchant:'Friendly Cafe',category:'Dining',amount:999999,date:'1900-01-01'}]})}:{rows:[{date:'2026-10-02',description:'PDF Cafe',cents:-10000,category:'Dining',review:false}],issues:[],balance:{start:'2026-10-01',end:'2026-10-31',opening:46950,closing:36950,currency:'SGD'}}})
  })
  await page.getByRole('button',{name:'Import statement',exact:true}).first().click()
  await page.getByRole('checkbox',{name:'Extract with my AI provider'}).check()
  await openScan(page,{name:'enriched.csv',mimeType:'text/csv',buffer:Buffer.from('Date,Description,Amount\n2026-11-12,RAW CAFE,-12.34')})
  const review=page.getByRole('dialog',{name:'Review transactions'})
  await expect(review.getByText('2026-11-12',{exact:true})).toBeVisible()
  await expect(review.getByText('-$12.34',{exact:true})).toBeVisible()
  await commit(page,1)
  expect(payloads[0].prompt).not.toContain('12.34')
  await page.getByRole('button',{name:'Import statement',exact:true}).first().click()
  await page.getByRole('checkbox',{name:'Extract with my AI provider'}).check()
  await openScan(page,fileURLToPath(new URL('./statement.pdf',import.meta.url)))
  await expect(page.getByText('1 of 1 selected')).toBeVisible()
  expect(payloads[1].mimeType).toBe('application/pdf');expect(payloads[1].base64Data).toBeTruthy()
  await commit(page,1)
  await expect(page.getByText('$369.50',{exact:true})).toBeVisible()
})

test('finance category graph and expense alignment work on desktop and mobile without credential prompts', async ({page})=>{
  await page.route('**/api/merchant',route=>route.fulfill({json:{success:true,data:{web:[],images:[]}}}))
  await createVault(page)
  await openScan(page,{name:'layout.csv',mimeType:'text/csv',buffer:csv},true)
  await commit(page,3)
  await expect(page.locator('.sector-track')).toHaveCount(2)
  for(const width of [1440,390]) {
    await page.setViewportSize({width,height:1000})
    const heading=await page.locator('.finance-purchases h2').boundingBox()
    const purchase=await page.locator('.purchase-line>span').first().boundingBox()
    expect(Math.abs(heading!.x-purchase!.x)).toBeLessThan(2)
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
    await page.screenshot({path:`/tmp/folio-finance-${width}.png`,fullPage:true})
  }
  await page.getByRole('button',{name:'Coffee House',exact:true}).click()
  await expect(page.getByRole('textbox',{name:/key|token/i})).toHaveCount(0)
  await page.getByRole('button',{name:'Receipts',exact:true}).click()
  await expect(page.getByRole('textbox',{name:/key|token/i})).toHaveCount(0)
})
