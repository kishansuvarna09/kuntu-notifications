import { Hono } from 'hono'
import { serveStatic } from 'hono/bun'
import { cors } from 'hono/cors'
import auth from './routes/auth'
import notifications from './routes/notifications'
import broadcast from './routes/broadcast'
import { authMiddleware } from './middleware/auth'
import type { AppVariables } from './types/context'

const app = new Hono<{ Variables: AppVariables }>()

app.use('*', cors())
app.use('/*', serveStatic({ root: './public' }))

app.route('/', auth)
app.use('/notifications/*', authMiddleware)
app.route('/', notifications)
app.route('/', broadcast)

export default app
