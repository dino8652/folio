import type { Env } from '../types.ts'
import { ApiError } from '../http.ts'
export async function consumeQuota(env: Env, owner: string, scope: string, limit: number, seconds = 60, now = Date.now()) {
  const bucket = Math.floor(now / (seconds * 1000))
  const row = await env.DB.prepare(`INSERT INTO service_quotas (user_id, scope, bucket, count) VALUES (?, ?, ?, 1)
    ON CONFLICT(user_id, scope) DO UPDATE SET count = CASE WHEN bucket = excluded.bucket THEN count + 1 ELSE 1 END, bucket = excluded.bucket
    RETURNING count`).bind(owner, scope, bucket).first<{count: number}>()
  if (!row || row.count > limit) throw new ApiError(429, 'RATE_LIMITED', 'Too many requests. Please try again shortly.', seconds - Math.floor(now / 1000) % seconds)
}
