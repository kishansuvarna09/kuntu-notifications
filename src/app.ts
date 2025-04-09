import { serve } from 'bun'
import app from './server'

serve({
  fetch: app.fetch,
  port: 3000,
  idleTimeout: 60, // ⏱️ keep SSE alive for 60 seconds (or more)
})
