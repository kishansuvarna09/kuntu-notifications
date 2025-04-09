import { Hono } from 'hono'
import type { Context } from 'hono'
import { serveStatic } from 'hono/bun'
import { streamSSE } from 'hono/streaming'
import { cors } from 'hono/cors'
import { SignJWT, jwtVerify } from 'jose'
import type { JWTPayload } from 'jose'


type Variables = {
  jwtPayload: JWTPayload
}

const app = new Hono<{ Variables: Variables }>()

// Enable CORS
app.use('*', cors())

// Serve static files
app.use('/*', serveStatic({ root: './public' }))

// In-memory pub/sub by channel
type SendFn = (data: string) => Promise<void>
const channels = new Map<string, Set<SendFn>>()
const cleanupTimers = new Map<string, ReturnType<typeof setTimeout>>()

const JWT_SECRET = new TextEncoder().encode('super-secret') // Use env in prod

// === LOGIN ===
app.post('/login', async (c) => {
  const body = await c.req.json()
  const username = body.username || 'guest'

  const token = await new SignJWT({ username })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('2h')
    .sign(JWT_SECRET)

  c.header('Set-Cookie', `token=${token}; HttpOnly; Path=/; Max-Age=7200; Secure`)

  return c.json({ message: 'Login successful', username })
})

app.post('/logout', (c) => {
  // Clear the token cookie by setting it to expire
  c.header('Set-Cookie', `token=; HttpOnly; Path=/; Max-Age=0; Secure`)
  return c.json({ message: 'Logged out' })
})

// === JWT Middleware ===
app.use('/notifications/*', async (c, next) => {
  const cookie = c.req.header('Cookie') || ''
  const token = cookie.split(';').find(p => p.trim().startsWith('token='))?.split('=')[1]

  if (!token) return c.json({ error: 'Unauthorized: No token' }, 401)

  try {
    const { payload } = await jwtVerify(token, JWT_SECRET)
    c.set('jwtPayload', payload as { username: string })
    await next()
  } catch {
    return c.json({ error: 'Invalid or expired token' }, 401)
  }
})

// Subscribe to a channel
app.get('/notifications/:channelId', (c: Context) => {
  const channelId = c.req.param('channelId')
  const payload = c.get('jwtPayload')
  console.log('payload', payload);


  return streamSSE(c, async (stream) => {
    const send: SendFn = async (data: string) => {
      try {
        await stream.writeSSE({ event: 'message', data })
      } catch (err) {
        console.error(`[x] Failed to send message: ${err}`)
      }
    };

    if (!channels.has(channelId)) {
      channels.set(channelId, new Set());
    }
    channels.get(channelId)!.add(send);

    // Cancel scheduled cleanup (someone joined again)
    if (cleanupTimers.has(channelId)) {
      clearTimeout(cleanupTimers.get(channelId)!)
      cleanupTimers.delete(channelId)
    }

    console.log(`[+] ${payload.username} connected to ${channelId}`)

    // Clean up on disconnect
    c.req.raw.signal.addEventListener('abort', () => {
      const listeners = channels.get(channelId)

      if (listeners) {
        listeners.delete(send)
        console.log(`[-] ${payload.username} disconnected from ${channelId}`)

        if (listeners.size === 0) {
          console.log(`[⏳] Scheduling cleanup of channel "${channelId}" in 10s`)
          const timeout = setTimeout(() => {
            channels.delete(channelId)
            cleanupTimers.delete(channelId)
            console.log(`[🧹] Cleaned up empty channel: ${channelId}`)
          }, 10_000)

          cleanupTimers.set(channelId, timeout)
        }
      }
    });

    // Initial welcome message
    await stream.writeSSE({ data: `connected to "${channelId}" as ${payload.username}` })

    // Optional ping every 30s
    const pingInterval = setInterval(() => {
      console.log('ping', channelId);
      stream.writeSSE({ event: 'ping', data: 'keep-alive' });
    }, 30000);

    c.req.raw.signal.addEventListener('abort', () => {
      console.log('ping:clear', channelId);
      clearInterval(pingInterval);
    });

    // 🚨 This keeps the stream open forever
    await new Promise(() => { });
  });
});

// Broadcast message to a specific channel
app.post('/broadcast/:channelId', async (c: Context) => {
  const channelId = c.req.param('channelId')
  const body = await c.req.json()
  const message = body.message

  if (typeof message !== 'string') {
    return c.json({ error: 'Message must be a string' }, 400)
  }

  const listeners = channels.get(channelId)
  if (!listeners || listeners.size === 0) {
    console.log(`[!] No active listeners on channel: ${channelId}`)
    return c.json({ status: 'ok', delivered: 0 })
  }

  let delivered = 0
  for (const send of listeners) {
    try {
      console.log('message', message);

      await send(message)
      delivered++
    } catch (err) {
      console.error(`Error delivering to client on ${channelId}:`, err)
    }
  }

  console.log(`[📢] Broadcasted to ${delivered} clients on channel "${channelId}"`)
  return c.json({ status: 'ok', delivered })
})

export default app
