type SendFn = (data: string) => Promise<void>

const channels = new Map<string, Set<SendFn>>()
const cleanupTimers = new Map<string, ReturnType<typeof setTimeout>>()
const allClients = new Set<SendFn>()

// Global keep-alive ping
setInterval(() => {
  for (const send of allClients) send(':ping')
}, 30000)

export const addClient = (channelId: string, send: SendFn) => {
  allClients.add(send)

  if (!channels.has(channelId)) channels.set(channelId, new Set())
  channels.get(channelId)!.add(send)

  if (cleanupTimers.has(channelId)) {
    clearTimeout(cleanupTimers.get(channelId)!)
    cleanupTimers.delete(channelId)
  }
}

export const removeClient = (channelId: string, send: SendFn) => {
  allClients.delete(send)
  const listeners = channels.get(channelId)
  listeners?.delete(send)

  if (listeners && listeners.size === 0) {
    const timeout = setTimeout(() => {
      channels.delete(channelId)
      cleanupTimers.delete(channelId)
    }, 10000)

    cleanupTimers.set(channelId, timeout)
  }
}

export const broadcastToChannel = async (channelId: string, message: string): Promise<number> => {
  const listeners = channels.get(channelId)
  if (!listeners || listeners.size === 0) throw new Error('Channel inactive or invalid')

  let delivered = 0
  for (const send of listeners) {
    await send(message)
    delivered++
  }
  return delivered
}
