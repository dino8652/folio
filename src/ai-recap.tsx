import ReactMarkdown from 'react-markdown'
import { ModelDirectory } from './model-directory.tsx'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { currencyText, spendingByCategory, totals, type Connections, type Currency, type Transaction } from './ledger.ts'
import { ErrorText, Modal } from './ui.tsx'

import { aiEndpoint, aiEndpoints as endpoints, requestAiText } from './ai-provider'

export function AiRecap({ rows, currency, period, demo, onClose, connection, onSaveConnection }: {
  rows: Transaction[]; currency: Currency; period: string; demo: boolean; onClose: () => void; connection?: Connections
  onSaveConnection?: (settings: Pick<Connections, 'provider' | 'key' | 'model' | 'endpoint'>) => Promise<void>
}) {
  const [provider, setProvider] = useState<keyof typeof endpoints>(connection?.provider ?? 'gemini')
  const [editing, setEditing] = useState(!connection?.key)
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState(connection?.model && !connection.model.includes('@') ? connection.model : '')
  const [customUrl, setCustomUrl] = useState(connection?.endpoint ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [recap, setRecap] = useState('')
  const request = useRef<AbortController | null>(null)
  useEffect(() => () => request.current?.abort(), [])

  const hasSavedKey = Boolean(connection?.key && connection.provider === provider && (provider !== 'custom' || customUrl === connection.endpoint))
  const { income, otherDeposits, spending, net } = totals(rows)
  const money = (cents: number) => currencyText(cents, currency)
  const summary = [
    `Period: ${period}${demo ? ' (sample data)' : ''}`,
    `Currency: ${currency}`,
    `Earned income: ${money(income)}`,
    `Other deposits: ${money(otherDeposits)}`,
    `Spending: ${money(spending)}`,
    `Net cash flow: ${money(net)}`,
    ...spendingByCategory(rows).map(item => `${item.category}: ${money(item.cents)}`),
  ].join('\n')

  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (request.current) return
    const savedConnection = connection?.provider === provider && (provider !== 'custom' || customUrl === connection.endpoint)
    const key = apiKey.trim() || (savedConnection ? connection.key : '')
    if (!key) { setError('Set up your AI connection once to continue.'); setEditing(true); return }
    if (!model || model.includes('@')) { setError('Choose a model from your provider’s directory. Your saved key will be reused.'); return }

    let endpoint: URL
    try {
      endpoint = aiEndpoint(provider, customUrl, model)
    } catch {
      setError('Enter an HTTPS endpoint without credentials, query parameters or a fragment.')
      return
    }

    const prompt = 'Write a concise spending recap. Summarize cash flow, highlight the largest category, and suggest a specific question to investigate. Use only these totals. Avoid invented causes, prices or predictions.\n\n' + summary

    const controller = new AbortController()
    request.current = controller
    const timeout = setTimeout(() => controller.abort(), 30_000)
    setBusy(true)
    setError('')
    setRecap('')
    try {
      if (onSaveConnection && (!hasSavedKey || key !== connection?.key || model !== connection?.model || customUrl !== connection?.endpoint)) {
        await onSaveConnection({provider,key,model,endpoint:provider === 'custom' ? customUrl.trim() : ''})
      }
      setApiKey(''); setEditing(false)
      const output = await requestAiText(endpoint, { provider, key, model }, prompt, controller.signal)
      if (!output) { setError('The provider returned no recap. Try again.'); return }
      setRecap(output)
      setApiKey(''); setEditing(false)
    } catch (cause) {
      setError(controller.signal.aborted ? 'The recap request timed out or was cancelled.'
        : cause instanceof Error && !(cause instanceof TypeError) ? cause.message
        : 'Could not reach the provider. Check the endpoint and whether it allows browser requests.')
    } finally {
      clearTimeout(timeout)
      request.current = null
      setBusy(false)
    }
  }

  return <Modal title="AI spending recap" subtitle="Uses your saved AI connection. No need to enter your key again." onClose={onClose}>
    <form className="form-stack" onSubmit={generate}>
      <div className="insights-art" aria-hidden="true"><img src="/insights-origami.png" width="88" height="88" alt="" /></div>
      {hasSavedKey && !editing && <div className="ai-connection-summary"><div><strong>{provider === 'gemini' ? 'Gemini' : provider === 'openrouter' ? 'OpenRouter' : provider === 'openai' ? 'OpenAI' : 'Custom provider'} · Connected</strong><p>{model || 'Choose a model below'} · Using your saved key</p></div><button type="button" className="quiet" disabled={busy} onClick={() => setEditing(true)}>Change connection</button></div>}
      {editing && <fieldset className="ai-fields" disabled={busy}>
        <label>Provider<select value={provider} onChange={event => { setProvider(event.target.value as keyof typeof endpoints); setApiKey(''); setModel('') }}>
          <option value="gemini">Google Gemini</option><option value="openai">OpenAI</option><option value="openrouter">OpenRouter</option><option value="custom">Custom OpenAI-compatible</option>
        </select></label>
        {provider === 'custom' && <label>Chat completions endpoint<input type="url" value={customUrl} onChange={event => { setCustomUrl(event.target.value); setModel('') }} autoComplete="off" /></label>}
        <label>{hasSavedKey ? 'Replace API key (optional)' : 'API key'}<input name="folio-provider-secret" type="password" autoComplete="new-password" spellCheck={false} value={apiKey} onChange={event => { setApiKey(event.target.value); setModel('') }} placeholder={hasSavedKey ? 'Leave blank to keep your saved key' : undefined} /></label>
        <p className="field-hint">Saved once in your encrypted vault and shared by all AI features.</p>
      </fieldset>}
      {(editing || !model) && (apiKey || hasSavedKey) && <ModelDirectory provider={provider} apiKey={apiKey || connection!.key} endpoint={customUrl} value={model} onChange={setModel} />}
      <details className="ai-preview"><summary>Financial data shared with the provider</summary><pre>{summary}</pre></details>
      <p className="field-hint">Destination: {provider === 'custom' ? customUrl || 'Enter an endpoint you trust' : endpoints[provider]}</p>
      <p className="field-hint">The request contains the totals shown above. Compare AI output with your ledger.</p>
      <ErrorText error={error} />
      {recap && <div className="recap-output" role="status"><ReactMarkdown skipHtml components={{a: ({children}) => <span>{children}</span>, img: () => null}}>{recap}</ReactMarkdown></div>}
      <div className="form-actions"><button className="primary" data-tone="violet" disabled={busy}>{busy ? 'Generating…' : 'Send and generate'}</button></div>
    </form>
  </Modal>
}
