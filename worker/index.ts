import { parseStatement } from './services/statements.ts'
import { makeAuth } from './auth.ts'
import { ApiError, failure, json, method, readJson, requireOrigin, secure } from './http.ts'
import { capabilities } from './services/capabilities.ts'
import { workspaceKey } from './services/vault-keys.ts'
import { discoverMerchant } from './services/merchants.ts'
import { consumeQuota } from './services/quota.ts'
import { verifyPhone } from './services/phone.ts'
import type { Env } from './types.ts'

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  const path = url.pathname.replace(/^\/api\/v2\//, '/api/')
  if (path === '/api/health') {
    method(request, ['GET'])
    await env.DB.prepare('SELECT 1').first()
    return json({ status: 'ok', version: 2 })
  }
  if (path === '/api/account-capabilities') {
    method(request, ['GET'])
    return json(capabilities(env))
  }
  if (!env.BETTER_AUTH_SECRET) throw new ApiError(503, 'ACCOUNT_UNAVAILABLE', 'Folio account services are temporarily unavailable.')
  const auth = makeAuth(env, url.origin)
  if (url.pathname.startsWith('/api/auth/')) {
    if (['/api/auth/request-password-reset', '/api/auth/send-verification-email'].includes(path) && !capabilities(env).passwordReset) {
      throw new ApiError(503, 'EMAIL_UNAVAILABLE', 'Email delivery has not been configured by Folio yet. Your password has not changed.')
    }
    return auth.handler(request)
  }
  const routes = new Map<string, string[]>([
    ['/api/statements/parse', ['POST']], ['/api/session', ['GET']], ['/api/vault-key', ['POST']], ['/api/merchant', ['POST']],
    ['/api/phone/send', ['POST']], ['/api/phone/check', ['POST']],
  ])
  const allowed = routes.get(path)
  if (!allowed) throw new ApiError(404, 'NOT_FOUND', 'This API endpoint does not exist.')
  method(request, allowed)
  if (request.method !== 'GET') requireOrigin(request, env.APP_ORIGIN)
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) throw new ApiError(401, 'SIGN_IN_REQUIRED', 'Your session has ended. Sign in to continue.')
  const user = { id: session.user.id, email: session.user.email, name: session.user.name, twoFactorEnabled: Boolean(session.user.twoFactorEnabled) }
  if (path === '/api/session') {
    const phone = await env.DB.prepare('SELECT phone, verified_at AS verifiedAt FROM verified_phones WHERE user_id = ?').bind(user.id).first()
    return json({ user, expiresAt: session.session.expiresAt, phone, capabilities: capabilities(env) })
  }
  if (path === '/api/vault-key') {
    await consumeQuota(env, user.id, 'workspace-open', 30)
    return json({ key: await workspaceKey(env, user.id), user })
  }
  if (path === '/api/statements/parse') {
    await consumeQuota(env, user.id, 'statement-extraction', 10)
    return json(await parseStatement(await readJson(request, 18 * 1024 * 1024)))
  }
  const body = await readJson(request)
  if (path === '/api/merchant') return json(await discoverMerchant(env, user.id, body))
  return json(await verifyPhone(env, user.id, body, path.endsWith('/send') ? 'send' : 'check'))
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!new URL(request.url).pathname.startsWith('/api/')) return env.ASSETS.fetch(request)
    const requestId = crypto.randomUUID()
    try { return secure(await route(request, env), requestId) }
    catch (error) {
      // No bodies, keys, cookies, email addresses, statement data or upstream errors.
      console.error(JSON.stringify({ requestId, code: error instanceof ApiError ? error.code : 'INTERNAL_ERROR', status: error instanceof ApiError ? error.status : 500 }))
      return secure(failure(error, requestId), requestId)
    }
  },
}
