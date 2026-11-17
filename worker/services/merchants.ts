import type { Env } from '../types.ts'
import { ApiError, requiredText } from '../http.ts'
import { consumeQuota } from './quota.ts'
export function merchantRequest(body: Record<string, unknown>) {
  if (body.url !== undefined && body.query !== undefined) throw new ApiError(400, 'INVALID_INPUT', 'Provide either a merchant search or a website.')
  if (body.url !== undefined) {
    let url: URL
    try { url = new URL(requiredText(body.url, 'Website', 2048)) } catch { throw new ApiError(400, 'INVALID_URL', 'Enter a public HTTPS website.') }
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(url.hostname) || /(^|\.)(localhost|local|internal|test|invalid|example|onion)$/i.test(url.hostname)) throw new ApiError(400, 'INVALID_URL', 'Enter a public HTTPS website.')
    url.hash = ''
    return { path: 'scrape', body: { url: url.href, formats: ['rawHtml'], timeout: 20000 } }
  }
  return { path: 'search', body: { query: requiredText(body.query, 'Merchant search', 260), limit: 3, sources: ['web', 'images'], scrapeOptions: { formats: ['rawHtml'] }, timeout: 20000 } }
}
export async function discoverMerchant(env: Env, owner: string, body: Record<string, unknown>, transport: typeof fetch = fetch) {
  const input = merchantRequest(body)
  if (!env.FIRECRAWL_API_KEY) throw new ApiError(503, 'CONNECTOR_UNAVAILABLE', 'Merchant discovery has not been configured by Folio yet.')
  await consumeQuota(env, owner, 'merchant', 10)
  await consumeQuota(env, owner, 'merchant-daily', 100, 86400)
  try {
    const response = await transport(`https://api.firecrawl.dev/v2/${input.path}`, {
      method: 'POST', headers: { Authorization: `Bearer ${env.FIRECRAWL_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(input.body), signal: AbortSignal.timeout(25000), redirect: 'error',
    })
    if (!response.ok) throw new ApiError(502, 'MERCHANT_PROVIDER_ERROR', 'Merchant discovery is temporarily unavailable. Please try again later.')
    const data = await response.json() as {success?: boolean; data?: unknown}
    if (!data.success || !data.data) throw new ApiError(502, 'MERCHANT_PROVIDER_ERROR', 'No merchant information was returned. Try a more specific name or location.')
    return { success: true, data: data.data }
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError(504, 'MERCHANT_TIMEOUT', 'Merchant discovery could not finish. Please try again.')
  }
}
