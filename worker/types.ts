import type { D1Database } from '@cloudflare/workers-types'
export interface Env {
  DB: D1Database
  ASSETS: { fetch(request: Request): Promise<Response> }
  BETTER_AUTH_SECRET: string
  APP_ORIGIN?: string
  FIRECRAWL_API_KEY?: string
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
  RESEND_API_KEY?: string
  EMAIL_FROM?: string
  TWILIO_ACCOUNT_SID?: string
  TWILIO_AUTH_TOKEN?: string
  TWILIO_VERIFY_SERVICE_SID?: string
}
