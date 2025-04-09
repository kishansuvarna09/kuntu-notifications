import { serve } from 'bun'
import app from './src/app'

serve({
  fetch: app.fetch,
  port: 3000,
  idleTimeout: 120, // supports long-lived SSE
})