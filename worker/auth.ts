import { betterAuth } from 'better-auth'
import { twoFactor } from 'better-auth/plugins'
import type { Env } from './types.ts'
import { trustedOrigins } from './http.ts'
import { sendAccountEmail } from './services/email.ts'
export type AuthEnv = Env
export function authOptions(env: Env, origin: string) {
  const emailReady = Boolean(env.RESEND_API_KEY && env.EMAIL_FROM)
  return {
    appName: 'Folio', database: env.DB, secret: env.BETTER_AUTH_SECRET,
    baseURL: env.APP_ORIGIN || origin, trustedOrigins: trustedOrigins(origin, env.APP_ORIGIN),
    emailAndPassword: {
      enabled: true, minPasswordLength: 12, maxPasswordLength: 128, revokeSessionsOnPasswordReset: true,
      ...(emailReady ? { sendResetPassword: async ({ user, url }: {user: {email: string}; url: string}) => sendAccountEmail(env, user.email, url, 'reset') } : {}),
    },
    ...(emailReady ? { emailVerification: { sendVerificationEmail: async ({user, url}: {user: {email: string}; url: string}) => sendAccountEmail(env, user.email, url, 'verify') } } : {}),
    socialProviders: env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET ? { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } } : {},
    advanced: { ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] } },
    session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
    rateLimit: { enabled: true, storage: 'database' as const, window: 60, max: 30 },
    plugins: [twoFactor({ issuer: 'Folio' })] as [ReturnType<typeof twoFactor>],
  }
}
export const makeAuth = (env: Env, origin: string) => betterAuth(authOptions(env, origin))
