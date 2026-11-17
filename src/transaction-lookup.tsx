import { Mail, MapPin } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { Transaction } from './ledger.ts'
import { loadGoogleOAuth } from './google-oauth.ts'
import { ErrorText } from './ui.tsx'

type WebResult = { title?: string; description?: string; url: string; rawHtml?: string }
type ImageResult = { title?: string; imageUrl: string }
type MerchantPage = { name?: string; address?: string; image?: string; source: string; latitude?: number; longitude?: number; hours?: string; phone?: string }

function readMerchantPage(html: string, source: string): MerchantPage {
  for (const block of html.matchAll(/<script\b[^>]*\btype=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(block[1])
      const candidates = Array.isArray(data) ? data : data?.['@graph'] ?? [data]
      for (const entry of candidates) {
        const address = typeof entry?.address === 'string' ? entry.address : [
          entry?.address?.streetAddress, entry?.address?.addressLocality, entry?.address?.postalCode,
        ].filter((part): part is string => typeof part === 'string').join(', ')
        if (!address) continue
        const raw = Array.isArray(entry.image) ? entry.image[0] : entry.image
        const path = typeof raw === 'string' ? raw : raw?.url
        const image = typeof path === 'string' ? externalLink(new URL(path, source).href) : undefined
        return { source, address, image, latitude: Number(entry.geo?.latitude), longitude: Number(entry.geo?.longitude), hours: typeof entry.openingHours === 'string' ? entry.openingHours : Array.isArray(entry.openingHours) ? entry.openingHours.join(' · ') : undefined, phone: typeof entry.telephone === 'string' ? entry.telephone : undefined, name: typeof entry.name === 'string' ? entry.name : undefined }
      }
    } catch { /* Another structured data block may contain the location. */ }
  }
  return { source }
}

type Receipt = { id: string; snippet?: string; payload?: { headers?: { name: string; value: string }[] } }

function externalLink(value?: string) {
  try { const url = new URL(value ?? ''); return url.protocol === 'https:' && !url.username && !url.password ? url.href : undefined }
  catch { return undefined }
}

export function TransactionLookup({ row, googleClientId }: { row: Transaction; googleClientId?: string }) {
  const [view, setView] = useState<'merchant' | 'receipts'>('merchant')
  const [merchant, setMerchant] = useState(row.description)
  const [city, setCity] = useState('')
  const [matches, setMatches] = useState<{ web?: WebResult[]; images?: ImageResult[] }>()
  const [website, setWebsite] = useState('')
  const [oauth, setOAuth] = useState<Awaited<ReturnType<typeof loadGoogleOAuth>>>()
  const [place, setPlace] = useState<MerchantPage>()
  const [receipts, setReceipts] = useState<Receipt[]>()
  const [busy, setBusy] = useState<'website' | 'gmail'>()
  const [error, setError] = useState('')
  const controller = useRef<AbortController | null>(null)
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; controller.current?.abort() }
  }, [])

  const end = new Date(Date.parse(row.date) + 8 * 86_400_000).toISOString().slice(0, 10)
  const start = new Date(Date.parse(row.date) - 7 * 86_400_000).toISOString().slice(0, 10)
  const gmailQuery = `"${merchant.trim().replace(/["\\{}]/g, ' ')}" after:${start.replaceAll('-', '/')} before:${end.replaceAll('-', '/')}`
  const mapsQuery = [merchant.trim(), city.trim()].filter(Boolean).join(' ')
  const mapsLink = `https://www.openstreetmap.org/search?query=${encodeURIComponent(place?.address ?? mapsQuery)}`

  async function lookup(kind: 'website' | 'gmail', authorizedToken?: string) {
    if (!mounted.current || controller.current || !merchant.trim()) return
    const request = new AbortController()
    controller.current = request
    const timeout = setTimeout(() => request.abort(), 30_000)
    setBusy(kind)
    setError('')
    const requestOptions = { signal: request.signal, cache: 'no-store', referrerPolicy: 'no-referrer', redirect: 'error' } as const
    try {
      if (kind === 'website') {
        setPlace(undefined)
        setMatches(undefined)
        const url = website.trim() ? externalLink(website.trim()) : undefined
        if (website.trim() && !url) throw new Error('Enter a public HTTPS website URL.')
        const response = await fetch('/api/merchant', {
          ...requestOptions, method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(url ? { url } : { query: mapsQuery }),
        })
        if (response.status === 401) throw new Error('Your Folio session has ended. Sign in to look up merchants.')
        if (response.status === 429) throw new Error('Merchant lookup limit reached. Wait a little before trying again.')
        if (!response.ok) throw new Error((await response.json()).error || 'Merchant discovery is unavailable.')
        const result: { success: boolean; data?: { rawHtml?: string; web?: WebResult[]; images?: ImageResult[] } } = await response.json()
        if (!result.success || !result.data) throw new Error('Firecrawl returned no data for this lookup.')
        if (url) setPlace(readMerchantPage(result.data.rawHtml ?? '', url))
        else {
          setMatches(result.data)
          const candidate = result.data.web?.find(item => item.rawHtml && externalLink(item.url))
          if (candidate) setPlace(readMerchantPage(candidate.rawHtml!, candidate.url))
        }
      } else {
        setReceipts(undefined)
        const headers = { Authorization: `Bearer ${authorizedToken ?? ''}` }
        const root = 'https://gmail.googleapis.com/gmail/v1/users/me/messages'
        const response = await fetch(`${root}?maxResults=5&q=${encodeURIComponent(gmailQuery)}`, { ...requestOptions, headers })
        if (!response.ok) throw new Error()
        const data: { messages?: { id: string }[] } = await response.json()
        setReceipts(await Promise.all((data.messages ?? []).map(async ({ id }) => {
          const message = await fetch(`${root}/${encodeURIComponent(id)}?format=metadata&metadataHeaders=Subject&fields=id,snippet,payload(headers)`, { ...requestOptions, headers })
          if (!message.ok) throw new Error()
          return await message.json() as Receipt
        })))
      }
    } catch (cause) {
      setError(request.signal.aborted ? 'The lookup timed out.' : kind === 'website'
        ? cause instanceof Error && cause.name !== 'TypeError' ? cause.message : 'Could not reach Firecrawl. Try again.'
        : 'Gmail lookup failed. Check that your OAuth token is active and has Gmail read-only access.')
    } finally {
      clearTimeout(timeout)
      controller.current = null
      setBusy(undefined)
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => { void lookup('website') }, 200)
    return () => clearTimeout(timer)
  }, [row.id])

  const hasCoordinates = Number.isFinite(place?.latitude) && Number.isFinite(place?.longitude) && Math.abs(place!.latitude!) <= 90 && Math.abs(place!.longitude!) <= 180
  const mapUrl = hasCoordinates ? `https://www.openstreetmap.org/export/embed.html?bbox=${place!.longitude! - .005},${place!.latitude! - .003},${place!.longitude! + .005},${place!.latitude! + .003}&layer=mapnik&marker=${place!.latitude},${place!.longitude}` : undefined
  return <section className="panel transaction-detail-card transaction-lookup" aria-label="Merchant and receipts">
    <div className="transaction-lookup-header">
      <button type="button" className="quiet" data-tone="sky" aria-pressed={view === 'merchant'} disabled={Boolean(busy)} onClick={() => { setView('merchant'); setError('') }}><MapPin size={17} /> Merchant</button>
      <button type="button" className="quiet" data-tone="violet" aria-pressed={view === 'receipts'} disabled={Boolean(busy)} onClick={() => { setView('receipts'); setError('') }}><Mail size={17} /> Receipts</button>
    </div>
    <div className="form-stack">
      <h3>{view === 'merchant' ? 'The story behind the spend' : 'Find a receipt'}</h3>
      {view === 'merchant' && <>
      <details className="merchant-search-options"><summary>Refine search</summary>      <label>Merchant to look up<input value={merchant} maxLength={160} onChange={event => {
        setMerchant(event.target.value); setPlace(undefined); setMatches(undefined); setReceipts(undefined)
      }} disabled={Boolean(busy)} /></label>

      <label>City or neighborhood <span className="field-hint">(optional)</span><input value={city} maxLength={100} disabled={Boolean(busy)} onChange={event => { setCity(event.target.value); setPlace(undefined); setMatches(undefined) }} /></label>
      <a className="quiet" href={mapsLink} target="_blank" rel="noreferrer">Open location search ↗</a>
      <details className="lookup-credential" open={website ? true : undefined}><summary>Search a specific website</summary><label>Merchant website URL (optional)<input type="url" value={website} placeholder="Leave blank to search by merchant name" disabled={Boolean(busy)} onChange={event => { setWebsite(event.target.value); setPlace(undefined); setMatches(undefined) }} /></label></details>

      </details>
      <p className="field-hint">Merchant information loads automatically. Check the address before choosing a branch.</p>
      <button type="button" className="quiet" data-tone="sky" disabled={!merchant.trim() || Boolean(busy)} onClick={() => void lookup('website')}>
        {busy === 'website' ? 'Looking up merchant…' : website.trim() ? 'Scrape merchant website' : 'Find merchant and photos'}
      </button>
      {matches && <div className="lookup-results"><strong>Possible matches from Firecrawl</strong>
        {!matches.web?.length && !matches.images?.length && <p>No results. Try adding a city or entering the merchant website.</p>}
        {matches.web?.slice(0, 4).map((result, index) => {
          const url = externalLink(result.url)
          return url && <article key={index}>
            <a href={url} target="_blank" rel="noreferrer"><strong>{result.title || new URL(url).hostname}</strong> ↗</a>
            {result.description && <p>{result.description.slice(0, 320)}</p>}
            <button type="button" className="quiet" disabled={Boolean(busy)} onClick={() => setWebsite(url)}>Use this website</button>
          </article>
        })}
        {matches.images?.slice(0, 4).map((result, index) => {
          const url = externalLink(result.imageUrl)
          return url && <a key={index} href={url} target="_blank" rel="noreferrer"><img className="merchant-photo" src={url} alt={result.title || 'Merchant search photo'} loading="lazy" referrerPolicy="no-referrer" /></a>
        })}
      </div>}
      {place && <div className="lookup-results"><article>
        <a href={place.source} target="_blank" rel="noreferrer"><strong>{place.name ?? 'Merchant website'}</strong> ↗</a>
        <p>{place.address ?? 'This page did not publish a structured address.'}</p>
        {place.phone && <p>{place.phone}</p>}{place.hours && <p>{place.hours}</p>}
        {mapUrl ? <iframe className="merchant-map" title="Possible merchant location" src={mapUrl} loading="lazy" referrerPolicy="no-referrer" /> : <p className="field-hint">No verified coordinates in this source. Open location search to choose the correct branch.</p>}
        {place.image && <a href={place.image} target="_blank" rel="noreferrer">Open merchant photo ↗</a>}
      </article></div>}
      </>}
      {view === 'receipts' && <>
      <p className="field-hint">Receipt search uses the merchant and dates near the charge. Open the original email to check line items, totals, and attachments.</p>
      <a className="quiet" href={`https://mail.google.com/mail/u/0/#search/${encodeURIComponent(gmailQuery)}`} target="_blank" rel="noreferrer">Search in Gmail ↗</a>
      {googleClientId && <button type="button" className="quiet" data-tone="violet" disabled={Boolean(busy)} onClick={() => {
        setError('')
        if (!oauth) {
          void loadGoogleOAuth().then(setOAuth).catch(() => setError('Google authorization could not load.'))
          return
        }
        try {
          oauth.initTokenClient({
            client_id: googleClientId,
            scope: 'https://www.googleapis.com/auth/gmail.readonly',
            callback: result => {
              if (result.access_token && !result.error) void lookup('gmail', result.access_token)
              else setError('Gmail authorization was not granted.')
            },
            error_callback: () => setError('Google authorization was closed or blocked.'),
          }).requestAccessToken()
        } catch { setError('Check the Google OAuth client ID and authorized origin.') }
      }}>{oauth ? 'Authorize Gmail & find receipts' : 'Load Google authorization'}</button>}
      {!googleClientId && <p className="field-hint">Use the Gmail link above to find private receipts. Merchant information loads automatically without a connection.</p>}
      {receipts && <div className="lookup-results"><strong>Possible receipts</strong>
        {!receipts.length && <p>No matching emails found.</p>}
        {receipts.map(receipt => <article key={receipt.id}>
          <a href={`https://mail.google.com/mail/u/0/#all/${encodeURIComponent(receipt.id)}`} target="_blank" rel="noreferrer"><strong>{receipt.payload?.headers?.find(header => header.name.toLowerCase() === 'subject')?.value ?? 'Open email'}</strong> ↗</a>
          {receipt.snippet && <p>{receipt.snippet}</p>}
        </article>)}
      </div>}
      </>}
      <ErrorText error={error} />
    </div>
  </section>
}
