import { SignJWT, jwtVerify } from 'jose'
import type { AuthPayload } from '../types/context'

const JWT_SECRET = new TextEncoder().encode('super-secret') // Use env in prod

export const signToken = async (payload: AuthPayload): Promise<string> => {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('2h')
    .sign(JWT_SECRET)
}

export const verifyToken = async (token: string): Promise<AuthPayload> => {
  const { payload } = await jwtVerify(token, JWT_SECRET)
  if (!payload.username) throw new Error('Invalid token payload')
  return payload as AuthPayload
}
