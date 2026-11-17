import type { Env } from '../types.ts'
import { ApiError } from '../http.ts'
export async function sendAccountEmail(env: Env, to: string, url: string, purpose: 'reset' | 'verify') {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) throw new ApiError(503, 'EMAIL_UNAVAILABLE', 'Email delivery has not been configured by Folio yet.')
  const action = purpose === 'reset' ? 'Reset your Folio password' : 'Verify your Folio email'
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.EMAIL_FROM, to: [to], subject: action, text: `${action}:\n\n${url}\n\nIf you did not request this, ignore this email.` }), signal: AbortSignal.timeout(10000),
  })
  if (!response.ok) throw new ApiError(503, 'EMAIL_UNAVAILABLE', 'Folio could not send the email. Please try again later.')
}
