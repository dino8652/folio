import { useEffect, useState } from 'react'
import type { Connections } from './ledger'
import { ErrorText } from './ui'

const directories = {
  gemini: 'https://generativelanguage.googleapis.com/v1beta/models',
  openai: 'https://api.openai.com/v1/models',
  openrouter: 'https://openrouter.ai/api/v1/models?input_modalities=text&output_modalities=text',
}
type Model = { id: string; label: string }

export function customDirectory(endpoint: string) {
  const url = new URL(endpoint.trim())
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !url.pathname.endsWith('/chat/completions')) {
    throw new Error('Enter an HTTPS endpoint ending in /chat/completions, without credentials or query parameters.')
  }
  url.pathname = url.pathname.replace(/\/chat\/completions$/, '/models')
  return url.href
}

async function loadModels(provider: Connections['provider'], key: string, endpoint: string, signal: AbortSignal) {
  const gemini = provider === 'gemini'
  const url = new URL(provider === 'custom' ? customDirectory(endpoint) : directories[provider])
  const headers = gemini ? { 'x-goog-api-key': key } : new Headers({ Authorization: `Bearer ${key}` })
  const models = new Map<string, Model>()
  const seen = new Set<string>()
  while (true) {
    const response = await fetch(url, { headers, signal, redirect: 'error', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer' })
    if (response.status === 401 || response.status === 403) throw new Error('The provider rejected your key. Go back and check it.')
    if (!response.ok) throw new Error('The provider’s directory is unavailable. Try again or check your connection settings.')
    const page = await response.json()
    const entries = gemini ? page.models : page.data
    if (Array.isArray(entries)) for (const entry of entries) {
      if (gemini && !Array.isArray(entry?.supportedGenerationMethods)) continue
      if (gemini && !entry.supportedGenerationMethods.includes('generateContent')) continue
      const id = gemini ? entry?.name?.replace?.(/^models\//, '') : entry?.id
      if (typeof id !== 'string' || !id) continue
      const name = gemini ? entry.displayName : entry.name
      models.set(id, { id, label: typeof name === 'string' && name !== id ? `${name} · ${id}` : id })
    }
    const token = page.nextPageToken
    if (!gemini || typeof token !== 'string' || !token || seen.has(token)) break
    seen.add(token)
    url.searchParams.set('pageToken', token)
  }
  if (!models.size) throw new Error('The provider returned no models. Check your key and try again.')
  return [...models.values()].sort((a, b) => a.label.localeCompare(b.label))
}

export function ModelDirectory({ provider, apiKey, endpoint, value, onChange }: {
  provider: Connections['provider']; apiKey: string; endpoint: string; value: string; onChange: (model: string) => void
}) {
  const [models, setModels] = useState<Model[]>([])
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(20000)])
    void loadModels(provider, apiKey, endpoint, signal).then(setModels).catch(cause => {
      if (!controller.signal.aborted) setError(cause instanceof TypeError
        ? 'Could not connect to the model directory. Check whether the provider allows browser requests.'
        : signal.aborted ? 'The model directory timed out. Try again.' : cause instanceof Error ? cause.message : 'Could not load models.')
    })
    return () => controller.abort()
  }, [provider, apiKey, endpoint, attempt])

  const selected = models.some(model => model.id === value) ? value : ''
  return <>
    <label>Model<select aria-label="Model" name="directory-model" value={selected} disabled={!models.length} onChange={event => onChange(event.target.value)}>
      <option value="" disabled>{error ? 'Directory unavailable' : models.length ? 'Choose a model' : 'Loading models…'}</option>
      {models.map(model => <option key={model.id} value={model.id}>{model.label}</option>)}
    </select></label>
    {!models.length && !error && <p className="field-hint" role="status">Fetching models from your provider.</p>}
    <ErrorText error={error} />
    {error && <button type="button" className="quiet" onClick={() => { setError(''); setAttempt(count => count + 1) }}>Retry directory</button>}
  </>
}
