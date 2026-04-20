import cors from 'cors'
import express from 'express'
import admin from 'firebase-admin'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'
import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'
import { firebaseConfig } from '../config/firebase.js'

// Cargar variables de entorno
dotenv.config()

import {
  HistorialService,
  InventarioService,
  VentasService,
  inicializarBD,
} from './db/index.js'
import emailService from './services/email.service.js'

const app = express()
const PORT = Number(process.env.PORT || 3001)
const DEFAULT_CLIENT_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5000',
  'http://127.0.0.1:5000',
  'https://rios-delivery-v2.web.app',
  'https://rios-delivery-v2.firebaseapp.com',
]
const CLIENT_ORIGINS = (process.env.CLIENT_ORIGIN || DEFAULT_CLIENT_ORIGINS.join(','))
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

app.use(cors({
  origin(origin, callback) {
    if (!origin || CLIENT_ORIGINS.includes(origin)) {
      callback(null, true)
      return
    }

    callback(new Error(`Origen no permitido por CORS: ${origin}`))
  }
}))
app.use(express.json({ limit: '20mb' }))

const MAX_CERTIFICADO_SIZE_BYTES = 10 * 1024 * 1024
const CERTIFICADO_EXTENSIONS = new Set(['pdf', 'jpg', 'jpeg'])
const CERTIFICADO_MIME_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/jpg'])
const CERTIFICADO_EMPRESA_COLLECTION = 'empresa'
const CERTIFICADO_EMPRESA_DOC_ID = 'rios-delivery-certificado'
const BACKEND_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CERTIFICADOS_EMPRESA_DIR = path.join(BACKEND_ROOT, 'uploads', 'certificados', 'rios-delivery')

const getFileExtension = (fileName = '') => {
  const parts = String(fileName).toLowerCase().split('.')
  return parts.length > 1 ? parts.pop() : ''
}

const cleanStoragePathSegment = (value) => {
  const cleanValue = String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return cleanValue || 'lote'
}

const getCertificadoDownloadUrl = ({ bucketName, filePath, token }) => {
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(filePath)}?alt=media&token=${token}`
}

const getCertificadoLocalUrl = (fileName) => {
  return `/api/certificados/empresa/archivo/${encodeURIComponent(fileName)}`
}

const isMissingStorageBucketError = (error) => {
  const details = `${error?.message || ''} ${error?.response?.body || ''} ${JSON.stringify(error?.errors || [])}`
  return (error?.code === 404 || error?.response?.statusCode === 404) && /bucket|specified bucket|not exist/i.test(details)
}

const normalizeServiceAccount = (serviceAccount) => {
  if (!serviceAccount) return null

  return {
    ...serviceAccount,
    private_key: typeof serviceAccount.private_key === 'string'
      ? serviceAccount.private_key.replace(/\\n/g, '\n')
      : serviceAccount.private_key,
  }
}

const parseServiceAccountJson = (rawValue, source) => {
  if (!rawValue) return null

  try {

    return normalizeServiceAccount(JSON.parse(rawValue))
  } catch (error) {
    throw new Error(`No se pudo leer ${source} como JSON válido: ${error.message}`)
  }
}

const resolveServiceAccountPath = (serviceAccountPath) => {
  if (!serviceAccountPath) return null
  if (path.isAbsolute(serviceAccountPath)) return serviceAccountPath

  const cwdPath = path.resolve(process.cwd(), serviceAccountPath)
  if (fs.existsSync(cwdPath)) return cwdPath

  return path.resolve(BACKEND_ROOT, serviceAccountPath)
}

const getServiceAccountCredentials = () => {
  const renderCredentials = parseServiceAccountJson(
    process.env.FIREBASE_SERVICE_ACCOUNT,
    'FIREBASE_SERVICE_ACCOUNT'
  )
  if (renderCredentials) {
    console.log('Firebase Admin SDK usara FIREBASE_SERVICE_ACCOUNT')
    return renderCredentials
  }

  const jsonCredentials = parseServiceAccountJson(
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
    'FIREBASE_SERVICE_ACCOUNT_JSON'
  )
  if (jsonCredentials) {
    console.log('Firebase Admin SDK usará FIREBASE_SERVICE_ACCOUNT_JSON')
    return jsonCredentials
  }

  const googleJsonCredentials = parseServiceAccountJson(
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON,
    'GOOGLE_SERVICE_ACCOUNT_JSON'
  )
  if (googleJsonCredentials) {
    console.log('Firebase Admin SDK usara GOOGLE_SERVICE_ACCOUNT_JSON')
    return googleJsonCredentials
  }

  if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
    const decoded = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8')
    console.log('Firebase Admin SDK usará FIREBASE_SERVICE_ACCOUNT_BASE64')
    return parseServiceAccountJson(decoded, 'FIREBASE_SERVICE_ACCOUNT_BASE64')
  }

  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH
    || process.env.FIREBASE_SERVICE_ACCOUNT_KEY_PATH
    || process.env.GOOGLE_APPLICATION_CREDENTIALS

  const resolvedPath = resolveServiceAccountPath(serviceAccountPath)
  if (!resolvedPath) return null

  console.log(`Buscando service account en: ${resolvedPath}`)
  if (!fs.existsSync(resolvedPath)) {
    console.warn(`Service account no encontrado en: ${resolvedPath}`)
    return null
  }

  return normalizeServiceAccount(JSON.parse(fs.readFileSync(resolvedPath, 'utf8')))
}

const guardarCertificadoEmpresaLocal = async ({ nombre, tipo, buffer, fileName, lote = {} }) => {
  await fs.promises.mkdir(CERTIFICADOS_EMPRESA_DIR, { recursive: true })

  const filePath = path.join(CERTIFICADOS_EMPRESA_DIR, fileName)
  await fs.promises.writeFile(filePath, buffer)

  return {
    nombre,
    tipo: tipo || 'application/octet-stream',
    tamano: buffer.length,
    ruta: `uploads/certificados/rios-delivery/${fileName}`,
    archivoLocal: fileName,
    empresa: 'Rios Delivery',
    alcance: 'empresa',
    almacenamiento: 'local',
    loteReferencia: String(lote.idLote || ''),
    fechaRegistro: String(lote.fecha || lote.fechaIngreso || ''),
    url: getCertificadoLocalUrl(fileName),
    subidoEn: new Date().toISOString(),
  }
}

const eliminarArchivoCertificadoEmpresa = async (certificado) => {
  if (!certificado) return

  if (certificado.almacenamiento === 'local' && certificado.archivoLocal) {
    const baseDir = path.resolve(CERTIFICADOS_EMPRESA_DIR)
    const filePath = path.resolve(baseDir, path.basename(certificado.archivoLocal))
    const allowedPrefix = `${baseDir}${path.sep}`.toLowerCase()

    if (filePath.toLowerCase().startsWith(allowedPrefix) && fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath)
    }

    return
  }

  if (certificado.almacenamiento === 'firebase-storage' && certificado.ruta) {
    try {
      await admin.storage().bucket().file(certificado.ruta).delete({ ignoreNotFound: true })
    } catch (error) {
      console.warn('No se pudo eliminar el archivo en Firebase Storage:', error.message)
    }
  }
}

const guardarArchivoCertificadoEmpresa = async ({ nombre, tipo, dataBase64, lote = {} }) => {
  if (!nombre || !dataBase64) {
    const error = new Error('El archivo del certificado es requerido')
    error.statusCode = 400
    throw error
  }

  const extension = getFileExtension(nombre)
  const hasValidExtension = CERTIFICADO_EXTENSIONS.has(extension)
  const hasValidMimeType = CERTIFICADO_MIME_TYPES.has(tipo)

  if (!hasValidExtension && !hasValidMimeType) {
    const error = new Error('Solo se permite guardar certificados en PDF o JPG')
    error.statusCode = 400
    throw error
  }

  const buffer = Buffer.from(dataBase64, 'base64')
  if (buffer.length > MAX_CERTIFICADO_SIZE_BYTES) {
    const error = new Error('El certificado no puede superar 10 MB')
    error.statusCode = 400
    throw error
  }

  const bucket = admin.storage().bucket()
  const fileName = `${Date.now()}-${randomUUID().slice(0, 8)}-${cleanStoragePathSegment(nombre)}`
  const filePath = `certificados/rios-delivery/${fileName}`
  const token = randomUUID()
  const file = bucket.file(filePath)

  try {
    await file.save(buffer, {
      resumable: false,
      metadata: {
        contentType: tipo || 'application/octet-stream',
        metadata: {
          firebaseStorageDownloadTokens: token,
          empresa: 'Rios Delivery',
          alcance: 'empresa',
          loteReferencia: String(lote.idLote || ''),
          fechaRegistro: String(lote.fecha || lote.fechaIngreso || ''),
        },
      },
    })

    return {
      nombre,
      tipo: tipo || 'application/octet-stream',
      tamano: buffer.length,
      ruta: filePath,
      empresa: 'Rios Delivery',
      alcance: 'empresa',
      almacenamiento: 'firebase-storage',
      loteReferencia: String(lote.idLote || ''),
      fechaRegistro: String(lote.fecha || lote.fechaIngreso || ''),
      url: getCertificadoDownloadUrl({
        bucketName: bucket.name,
        filePath,
        token,
      }),
      subidoEn: new Date().toISOString(),
    }
  } catch (error) {
    if (!isMissingStorageBucketError(error)) {
      throw error
    }

    console.warn('Bucket de Firebase Storage no disponible. Guardando certificado en almacenamiento local.')
    return guardarCertificadoEmpresaLocal({ nombre, tipo, buffer, fileName, lote })
  }
}

// Initialize Firebase Admin SDK
let db

function initializeFirebaseAdmin() {
  try {
    if (admin.apps && admin.apps.length > 0) {
      console.log('✓ Firebase Admin SDK ya estaba inicializado')
      return admin.firestore()
    }

    const serviceAccount = getServiceAccountCredentials()
    if (!serviceAccount) {
      throw new Error('No se encontro una credencial Firebase Admin. Define FIREBASE_SERVICE_ACCOUNT, FIREBASE_SERVICE_ACCOUNT_PATH, FIREBASE_SERVICE_ACCOUNT_JSON o GOOGLE_SERVICE_ACCOUNT_JSON.')
    }

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id || firebaseConfig.projectId,
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || firebaseConfig.storageBucket,
    })

    console.log(`Firebase Admin inicializado en proyecto ${serviceAccount.project_id || firebaseConfig.projectId}`)
    return admin.firestore()
  } catch (error) {
    console.error('✗ Error inicializando Firebase Admin SDK:', error.message)
    throw error
  }
}

// Inicializar Firebase
const firebaseDb = initializeFirebaseAdmin()

const inventarioService = new InventarioService(firebaseDb)
const ventasService = new VentasService(firebaseDb)
const historialService = new HistorialService(firebaseDb)

app.get('/', (_req, res) => {
  res.send('Backend funcionando')
})

app.get('/api/inventario', async (req, res) => {
  try {
    const lotes = await inventarioService.obtenerLotes()
    res.json({ success: true, data: lotes })
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
})

app.get('/api/inventario/estadisticas', async (req, res) => {
  try {
    const stats = await inventarioService.obtenerEstadisticas()
    res.json({ success: true, data: stats })
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
})

app.post('/api/inventario/lote', async (req, res) => {
  try {
    const resultado = await inventarioService.agregarLote(req.body)
    res.json(resultado)
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
})

app.get('/api/certificados/empresa/archivo/:fileName', (req, res) => {
  const baseDir = path.resolve(CERTIFICADOS_EMPRESA_DIR)
  const fileName = path.basename(req.params.fileName || '')
  const filePath = path.resolve(baseDir, fileName)
  const allowedPrefix = `${baseDir}${path.sep}`.toLowerCase()

  if (!fileName || !filePath.toLowerCase().startsWith(allowedPrefix)) {
    return res.status(400).json({
      success: false,
      message: 'Nombre de archivo invalido',
    })
  }

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({
      success: false,
      message: 'No se encontro el certificado guardado',
    })
  }

  return res.sendFile(filePath)
})

app.get('/api/certificados/empresa', async (_req, res) => {
  try {
    const docSnap = await firebaseDb
      .collection(CERTIFICADO_EMPRESA_COLLECTION)
      .doc(CERTIFICADO_EMPRESA_DOC_ID)
      .get()

    if (!docSnap.exists) {
      return res.json({ success: true, certificado: null })
    }

    return res.json({
      success: true,
      certificado: docSnap.data()?.certificado || null,
    })
  } catch (error) {
    console.error('Error al obtener certificado de empresa:', error)
    return res.status(500).json({
      success: false,
      message: error.message || 'No se pudo obtener el certificado de empresa',
    })
  }
})

app.post('/api/certificados/empresa', async (req, res) => {
  try {
    const docRef = firebaseDb
      .collection(CERTIFICADO_EMPRESA_COLLECTION)
      .doc(CERTIFICADO_EMPRESA_DOC_ID)
    const docAnterior = await docRef.get()
    const certificadoAnterior = docAnterior.data()?.certificado || null
    const certificado = await guardarArchivoCertificadoEmpresa(req.body || {})

    await docRef.set({
      certificado,
      actualizadoEn: new Date(),
    })

    if (certificadoAnterior?.ruta !== certificado.ruta) {
      try {
        await eliminarArchivoCertificadoEmpresa(certificadoAnterior)
      } catch (error) {
        console.warn('No se pudo eliminar el certificado anterior:', error.message)
      }
    }

    return res.json({ success: true, certificado })
  } catch (error) {
    console.error('Error al guardar certificado de empresa:', error)
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'No se pudo guardar el certificado de empresa',
    })
  }
})

app.delete('/api/certificados/empresa', async (_req, res) => {
  try {
    const docRef = firebaseDb
      .collection(CERTIFICADO_EMPRESA_COLLECTION)
      .doc(CERTIFICADO_EMPRESA_DOC_ID)
    const docSnap = await docRef.get()
    const certificado = docSnap.data()?.certificado || null

    await eliminarArchivoCertificadoEmpresa(certificado)
    await docRef.set({
      certificado: null,
      actualizadoEn: new Date(),
      eliminadoEn: new Date(),
    })

    return res.json({ success: true, certificado: null })
  } catch (error) {
    console.error('Error al quitar certificado de empresa:', error)
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'No se pudo quitar el certificado de empresa',
    })
  }
})

app.post('/api/certificados/lote', async (req, res) => {
  try {
    const certificado = await guardarArchivoCertificadoEmpresa(req.body || {})
    return res.json({ success: true, certificado })
  } catch (error) {
    console.error('Error al guardar certificado:', error)
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'No se pudo guardar el certificado',
    })
  }
})

app.get('/api/ventas', async (req, res) => {
  try {
    const ventas = await ventasService.obtenerVentas()
    res.json({ success: true, data: ventas })
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
})

app.get('/api/ventas/estadisticas', async (req, res) => {
  try {
    const { fechaInicio, fechaFin } = req.query
    const stats = await ventasService.obtenerEstadisticas(fechaInicio, fechaFin)
    res.json({ success: true, data: stats })
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
})

app.post('/api/ventas', async (req, res) => {
  try {
    const resultado = await ventasService.registrarVenta(req.body, inventarioService)
    res.json(resultado)
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
})

app.get('/api/historial', async (req, res) => {
  try {
    const opciones = {
      fechaInicio: req.query.fechaInicio,
      fechaFin: req.query.fechaFin,
      cliente: req.query.cliente,
      especie: req.query.especie,
      idLote: req.query.idLote,
      ordenPor: req.query.ordenPor || 'fecha_desc',
    }

    const historial = await historialService.obtenerHistorial(opciones)
    res.json({ success: true, data: historial })
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
})

app.get('/api/historial/estadisticas', async (req, res) => {
  try {
    const { fechaInicio, fechaFin } = req.query
    const stats = await historialService.obtenerEstadisticas(fechaInicio, fechaFin)
    res.json({ success: true, data: stats })
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
})

app.get('/api/historial/tendencias', async (req, res) => {
  try {
    const dias = Number(req.query.dias ?? 7)
    const tendencias = await historialService.obtenerTendencias(dias)
    res.json({ success: true, data: tendencias })
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
})

app.get('/api/historial/venta/:ventaId', async (req, res) => {
  try {
    const detalle = await historialService.obtenerDetalleVenta(req.params.ventaId)
    if (!detalle) {
      return res.status(404).json({ success: false, error: 'Venta no encontrada' })
    }

    return res.json({ success: true, data: detalle })
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message })
  }
})

app.get('/api/historial/reporte/cliente', async (req, res) => {
  try {
    const reporte = await historialService.reporteVentasPorCliente()
    res.json({ success: true, data: reporte })
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
})

app.get('/api/historial/reporte/especie', async (req, res) => {
  try {
    const reporte = await historialService.reporteVentasPorEspecie()
    res.json({ success: true, data: reporte })
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
})

app.get('/api/historial/exportar', async (req, res) => {
  try {
    const opciones = {
      fechaInicio: req.query.fechaInicio,
      fechaFin: req.query.fechaFin,
      cliente: req.query.cliente,
      especie: req.query.especie,
      idLote: req.query.idLote,
    }

    const datos = await historialService.exportarJSON(opciones)
    if (!datos) {
      return res.status(500).json({ success: false, error: 'Error al exportar datos' })
    }

    return res.json({ success: true, data: datos })
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message })
  }
})

// Endpoint para enviar notificación de caducidad por email
app.post('/api/notificaciones/caducidad', async (req, res) => {
  try {
    const { email, especie, lote, estado, diasRestantes } = req.body

    if (!email) {
      return res.status(400).json({ 
        success: false, 
        error: 'Email es requerido' 
      })
    }

    const resultado = await emailService.enviarAlertaCaducidad({
      email,
      especie,
      lote,
      estado,
      diasRestantes
    })

    return res.json(resultado)
  } catch (error) {
    return res.status(500).json({ 
      success: false, 
      error: error.message 
    })
  }
})

// Endpoint para enviar notificación consolidada diaria
app.post('/api/notificaciones/caducidad-consolidada', async (req, res) => {
  try {
    const { email, lotes, fecha } = req.body

    if (!email) {
      return res.status(400).json({ 
        success: false, 
        error: 'Email es requerido' 
      })
    }

    if (!lotes || lotes.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Debe haber al menos un lote para reportar' 
      })
    }

    const resultado = await emailService.enviarAlertaConsolidada({
      email,
      lotes,
      fecha
    })

    return res.json(resultado)
  } catch (error) {
    return res.status(500).json({ 
      success: false, 
      error: error.message 
    })
  }
})

// Endpoint de prueba para enviar email
app.post('/api/notificaciones/prueba', async (req, res) => {
  try {
    const { email } = req.body

    if (!email) {
      return res.status(400).json({ 
        success: false, 
        error: 'Email es requerido' 
      })
    }

    // Enviar email de prueba consolidado
    const lotesDePrueba = [
      {
        especie: 'Mojarra Roja',
        lote: 'LOT-2026-001',
        estado: 'CADUCADO',
        diasRestantes: -1,
        peso: 25.5
      },
      {
        especie: 'Tilapia',
        lote: 'LOT-2026-002',
        estado: 'CRÍTICO',
        diasRestantes: 1,
        peso: 18.3
      }
    ]

    const resultado = await emailService.enviarAlertaConsolidada({
      email,
      lotes: lotesDePrueba,
      fecha: new Date().toISOString().split('T')[0]
    })

    return res.json(resultado)
  } catch (error) {
    return res.status(500).json({ 
      success: false, 
      error: error.message 
    })
  }
})

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {
      inventario: 'ready',
      ventas: 'ready',
      historial: 'ready',
      firebase: 'connected',
    },
  })
})

async function iniciar() {
  try {
    console.log('Inicializando Rios Delivery Backend...')

    const bdOk = await inicializarBD(firebaseDb)
    if (!bdOk) {
      console.warn('La inicializacion de BD termino con advertencias')
    }

    return await new Promise((resolve, reject) => {
      const server = app.listen(PORT, () => {
        console.log(`Servidor ejecutandose en puerto ${PORT}`)
        console.log(`CORS habilitado para ${CLIENT_ORIGINS.join(', ')}`)
        resolve(server)
      })

      server.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
          console.error(`No se pudo iniciar: el puerto ${PORT} ya esta en uso.`)
          console.error('Cierra el proceso anterior o cambia PORT antes de ejecutar npm run dev.')
        }

        reject(error)
      })
    })
  } catch (error) {
    console.error('Error al iniciar:', error)
    process.exit(1)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  iniciar()
}

export { app, firebaseDb as db, historialService, iniciar, inventarioService, ventasService }
