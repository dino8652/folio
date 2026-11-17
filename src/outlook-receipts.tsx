import { useEffect, useRef, useState } from 'react'
import { ErrorText } from './ui.tsx'

interface OutlookMessage {
  id: string
  subject?: string
  bodyPreview?: string
  webLink?: string
}
function outlookLink(value?: string) {
  try {
    const url = new URL(value ?? '')
    if (url.protocol === 'https:' && ['outlook.office.com', 'outlook.office365.com', 'outlook.live.com'].includes(url.hostname)) return url.href
  } catch { /* The response does not include a supported Outlook link. */ }
}

export function OutlookReceipts({ merchant, start, end }: { merchant: string; start: string; end: string }) {
  const [token, setToken] = useState('')
  const [results, setResults] = useState<OutlookMessage[]>()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const request = useRef<AbortController | null>(null)
  useEffect(() => () => request.current?.abort(), [])
  async function search() {
    if (!token.trim() || !merchant.trim() || request.current) return
    const controller = new AbortController()
    request.current = controller
    const timeout = setTimeout(() => controller.abort(), 15_000)
    setBusy(true)
    setError('')
    setResults(undefined)
    const bearer = token.trim()
    setToken('')
    try {
      const params = new URLSearchParams({
        $search: `"${merchant.replace(/["\\]/g, ' ')} AND received>=${start} AND received<${end}"`,
        $top: '5',
        $select: 'id,subject,bodyPreview,webLink',
      })
      const response = await fetch('https://graph.microsoft.com/v1.0/me/messages?' + params, {
        headers: { Authorization: 'Bearer ' + bearer },
        credentials: 'omit', redirect: 'error', cache: 'no-store', signal: controller.signal,
      })
      if (!response.ok) throw new Error()
      const data: { value?: OutlookMessage[] } = await response.json()
      setResults(data.value ?? [])
    } catch { setError('Outlook search failed. Check that your delegated Microsoft Graph token is active and has Mail.Read permission.') }
    finally { clearTimeout(timeout); request.current = null; setBusy(false) }
  }

  return <details className="lookup-credential">
    <summary>Search Outlook receipts</summary>
    <label>Microsoft Graph access token<input type="password" autoComplete="off" value={token} disabled={busy} onChange={event => setToken(event.target.value)} /></label>
    <p className="field-hint">Use a delegated Mail.Read token. Microsoft receives the merchant name and date range.</p>
    <button type="button" className="quiet" data-tone="sky" disabled={!token.trim() || !merchant.trim() || busy} onClick={() => void search()}>{busy ? 'Searching Outlook…' : 'Find Outlook receipts'}</button>
    {results && <div className="lookup-results" aria-live="polite">
      {!results.length && <p>No matching Outlook messages.</p>}
      {results.map(message => {
        const link = outlookLink(message.webLink)
        return <article key={message.id}>
          <strong>{message.subject || 'Outlook message'}</strong>
          {message.bodyPreview && <p>{message.bodyPreview}</p>}
          {link && <a href={link} target="_blank" rel="noreferrer">Open in Outlook ↗</a>}
        </article>
      })}
    </div>}
    <ErrorText error={error} />
  </details>
}
