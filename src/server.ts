import { Hono } from 'hono'
import type { Context } from 'hono'
import { serveStatic } from 'hono/bun'
import { streamSSE } from 'hono/streaming'
import { cors } from 'hono/cors'

const app = new Hono()

// Enable CORS
app.use('*', cors())

// Serve static files
app.use('/*', serveStatic({ root: './public' }))

// In-memory pub/sub by channel
type SendFn = (data: string) => Promise<void>
const channels = new Map<string, Set<SendFn>>()
const cleanupTimers = new Map<string, ReturnType<typeof setTimeout>>()

// Subscribe to a channel
app.get('/notifications/:channelId', (c: Context) => {
  const channelId = c.req.param('channelId')

  return streamSSE(c, async (stream) => {
    const send: SendFn = async (data: string) => {
      try {
        await stream.writeSSE({ event: 'message', data })
      } catch (err) {
        console.error(`[x] Failed to send message: ${err}`)
      }
    };

    // Cancel scheduled cleanup (someone joined again)
    if (cleanupTimers.has(channelId)) {
      clearTimeout(cleanupTimers.get(channelId)!)
      cleanupTimers.delete(channelId)
    }

    if (!channels.has(channelId)) {
      channels.set(channelId, new Set());
    }
    channels.get(channelId)!.add(send);

    console.log(`[+] Client connected to channel: ${channelId}`);

    // Clean up on disconnect
    c.req.raw.signal.addEventListener('abort', () => {
      const listeners = channels.get(channelId)

      if (listeners) {
        listeners.delete(send)
        console.log(`[-] Client disconnected from channel: ${channelId}`)

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
    await stream.writeSSE({ data: `connected to channel "${channelId}"` });

    // Optional ping every 30s
    const pingInterval = setInterval(() => {
      stream.writeSSE({ event: 'ping', data: 'keep-alive' });
    }, 30000);

    c.req.raw.signal.addEventListener('abort', () => {
      clearInterval(pingInterval);
    });

    // 🚨 This keeps the stream open forever
    await new Promise(() => { });
  });
});

// Broadcast message to a specific channel
app.post('/notifications/:channelId', async (c: Context) => {
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
