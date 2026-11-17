import { createAuthClient } from 'better-auth/react'
import { twoFactorClient } from 'better-auth/client/plugins'
import { api } from './data/api.ts'
export const accountAuth = createAuthClient({ baseURL: location.origin, plugins: [twoFactorClient()] })
export const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ''
export const openAccountWorkspace = () => api<{key: string; user: {id: string; email: string}}>('/api/vault-key', { method: 'POST' })
