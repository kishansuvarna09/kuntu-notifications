import { Hono } from 'hono'
import { broadcastToChannel } from '../utils/pubsub'

const broadcast = new Hono()

broadcast.post('/broadcast/:channelId', async (c) => {
  const channelId = c.req.param('channelId')
  const body = await c.req.json()

  if (typeof body.message !== 'string') {
    return c.json({ error: 'Message must be a string' }, 400)
  }

  try {
    const delivered = await broadcastToChannel(channelId, body.message)
    return c.json({ status: 'ok', delivered })
  } catch (e) {
    return c.json({ error: e.message }, 400)
  }
})

export default broadcast
