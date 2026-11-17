import type { Connections } from './ledger'

export const aiEndpoints = {
  gemini: 'https://generativelanguage.googleapis.com',
  openai: 'https://api.openai.com/v1/chat/completions',
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
  custom: '',
}

export function aiEndpoint(provider: Connections['provider'], customUrl: string, model: string) {
  const url = new URL(provider === 'custom' ? customUrl.trim() : aiEndpoints[provider])
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.search) {
    throw new Error('Enter an HTTPS endpoint without credentials, query parameters or a fragment.')
  }
  if (provider === 'gemini') url.pathname = '/v1beta/models/' + encodeURIComponent(model.replace(/^models\//, '')) + ':generateContent'
  return url
}

export async function requestAiText(endpoint: URL, settings: Pick<Connections, 'provider' | 'key' | 'model'>, prompt: string, signal: AbortSignal) {
  const { provider, key, model } = settings
  const gemini = provider === 'gemini'
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(gemini ? { 'x-goog-api-key': key } : { Authorization: 'Bearer ' + key }) },
    credentials: 'omit',
    redirect: 'error',
    referrerPolicy: 'no-referrer',
    cache: 'no-store',
    signal,
    body: JSON.stringify(gemini
      ? { contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 1024 } }
      : { model, messages: [{ role: 'user', content: prompt }] }),
  })
  if (!response.ok) {
    if (response.status === 429) throw new Error('The provider quota was reached. Check your project limits and try again.')
    if ([400, 401, 403].includes(response.status)) throw new Error('The provider rejected the request. Check your key, model, and API permissions.')
    throw new Error('The AI provider could not complete this request.')
  }
  const result = await response.json() as {
    choices?: { message?: { content?: string } }[]
    candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[]
  }
  return gemini
    ? result.candidates?.[0]?.content?.parts?.filter(part => !part.thought).map(part => part.text ?? '').join('').trim()
    : result.choices?.[0]?.message?.content?.trim()
}
