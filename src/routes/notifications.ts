import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { addClient, removeClient } from '../utils/pubsub'
import type { AppVariables } from '../types/context'

const notifications = new Hono<{ Variables: AppVariables }>()

notifications.get('/notifications/:channelId', (c) => {
  const channelId = c.req.param('channelId')
  const payload = c.get('jwtPayload')

  return streamSSE(c, async (stream) => {
    const send = async (data: string) => {
      await stream.writeSSE({ event: 'message', data })
    }

    addClient(channelId, send)
    console.log(`[+] ${payload.username} connected to ${channelId}`)

    c.req.raw.signal.addEventListener('abort', () => {
      removeClient(channelId, send)
      console.log(`[-] ${payload.username} disconnected from ${channelId}`)
    })

    await stream.writeSSE({ data: `connected to "${channelId}" as ${payload.username}` })
    await new Promise(() => {})
  })
})

export default notifications
