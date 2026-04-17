import { onRequest } from 'firebase-functions/v2/https'

import { app, db } from './index.js'
import { inicializarBD } from './db/index.js'

const initPromise = inicializarBD(db).catch((error) => {
  console.error('Error inicializando BD en Firebase Functions:', error)
})

export const api = onRequest(
  {
    region: 'us-central1',
    memory: '512MiB',
    timeoutSeconds: 60,
    maxInstances: 10,
  },
  async (req, res) => {
    await initPromise
    return app(req, res)
  }
)
