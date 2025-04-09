import type { MiddlewareHandler } from 'hono'
import { verifyToken } from '../utils/jwt'

export const authMiddleware: MiddlewareHandler = async (c, next) => {
  const cookie = c.req.header('Cookie') || ''
  const token = cookie.split(';').find(p => p.trim().startsWith('token='))?.split('=')[1]

  if (!token) return c.json({ error: 'Unauthorized: No token' }, 401)

  try {
    const payload = await verifyToken(token)
    c.set('jwtPayload', payload)
    await next()
  } catch {
    return c.json({ error: 'Invalid or expired token' }, 401)
  }
}
