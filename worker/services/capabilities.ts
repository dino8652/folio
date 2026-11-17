import type { Env } from '../types.ts'
export function capabilities(env: Env) {
  const email = Boolean(env.RESEND_API_KEY && env.EMAIL_FROM)
  const google = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)
  const phone = Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_VERIFY_SERVICE_SID)
  return {
    version: 2, emailPassword: true, passwordReset: email, emailVerification: email,
    twoFactor: true, phoneVerification: phone, google,
    googleClientId: google ? env.GOOGLE_CLIENT_ID : '',
    connectors: [
      { id: 'statements', label: 'Bank statements', available: true, detail: 'PDF, CSV and Excel; processed on this device.' },
      { id: 'firecrawl', label: 'Merchant discovery', available: Boolean(env.FIRECRAWL_API_KEY), detail: 'Included with Folio.' },
      { id: 'gmail', label: 'Gmail receipts', available: google, detail: google ? 'Read-only access with your permission.' : 'Folio needs to configure Google OAuth.' },
      { id: 'phone', label: 'Phone verification', available: phone, detail: phone ? 'Verify your mobile number by SMS.' : 'Folio needs to configure SMS delivery.' },
      { id: 'ai', label: 'AI provider', available: true, detail: 'Optional; your own provider and key.' },
    ],
    storage: { financialData: 'encrypted-on-device', aiKeys: 'encrypted-on-device' },
  }
}
