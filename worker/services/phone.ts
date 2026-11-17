import type { Env } from '../types.ts'
import { ApiError, requiredText } from '../http.ts'
import { consumeQuota } from './quota.ts'
import { capabilities } from './capabilities.ts'
export async function verifyPhone(env: Env, owner: string, body: Record<string, unknown>, action: 'send' | 'check') {
  if (!capabilities(env).phoneVerification) throw new ApiError(503, 'SMS_UNAVAILABLE', 'Folio has not configured SMS verification yet.')
  const phone = requiredText(body.phone, 'Phone number', 16)
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) throw new ApiError(400, 'INVALID_PHONE', 'Use an international phone number, for example +65 followed by your number.')
  const code = action === 'check' ? requiredText(body.code, 'Verification code', 10) : undefined
  if (code && !/^\d{4,10}$/.test(code)) throw new ApiError(400, 'INVALID_CODE', 'Enter the verification code from your SMS.')
  await consumeQuota(env, owner, `phone-${action}`, action === 'send' ? 3 : 8, 600)
  const params = new URLSearchParams({ To: phone, ...(code ? { Code: code } : { Channel: 'sms' }) })
  let response: Response
  try {
    response = await fetch(`https://verify.twilio.com/v2/Services/${env.TWILIO_VERIFY_SERVICE_SID}/${code ? 'VerificationCheck' : 'Verifications'}`, {
      method: 'POST', headers: { Authorization: `Basic ${btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params, signal: AbortSignal.timeout(10000),
    })
  } catch { throw new ApiError(503, 'SMS_UNAVAILABLE', 'SMS verification could not connect. Please try again.') }
  if (!response.ok) throw new ApiError(400, 'PHONE_VERIFICATION_FAILED', code ? 'The code is invalid or expired. Request a new code.' : 'The SMS could not be sent. Check your number and try again.')
  const result = await response.json() as { status?: string }
  if (code) {
    if (result.status !== 'approved') throw new ApiError(400, 'INVALID_CODE', 'The code is invalid or expired.')
    const verifiedAt = new Date().toISOString()
    await env.DB.prepare('INSERT INTO verified_phones(user_id, phone, verified_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET phone = excluded.phone, verified_at = excluded.verified_at').bind(owner, phone, verifiedAt).run()
    return { verified: true, phone, verifiedAt }
  }
  return { sent: true }
}
