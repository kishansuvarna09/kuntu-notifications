import { Hono } from 'hono'
import { signToken } from '../utils/jwt'

const auth = new Hono()

auth.post('/login', async (c) => {
  const body = await c.req.json()
  const username = body.username || 'guest'
  const token = await signToken({ username })

  c.header('Set-Cookie', `token=${token}; HttpOnly; Path=/; Max-Age=7200; Secure`)
  return c.json({ message: 'Login successful', username })
})

auth.post('/logout', (c) => {
  c.header('Set-Cookie', `token=; HttpOnly; Path=/; Max-Age=0; Secure`)
  return c.json({ message: 'Logged out' })
})

export default auth
