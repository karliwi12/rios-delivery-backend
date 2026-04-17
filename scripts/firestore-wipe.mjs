#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import firestorePkg from '@google-cloud/firestore'

const { v1 } = firestorePkg

const DEFAULT_COLLECTIONS = [
  'inventario',
  'ventas',
  'clientes',
  'alertas',
  'usuarios',
  'reportes',
]

const SCRIPT_PATH = fileURLToPath(import.meta.url)
const SCRIPT_DIR = path.dirname(SCRIPT_PATH)
const BACKEND_DIR = path.resolve(SCRIPT_DIR, '..')
const REPO_DIR = path.resolve(BACKEND_DIR, '..')
const FIREBASERC_PATH = path.join(REPO_DIR, '.firebaserc')
const DOTENV_PATH = path.join(BACKEND_DIR, '.env')

function loadLocalEnvFile() {
  if (!fs.existsSync(DOTENV_PATH)) {
    return
  }

  const raw = fs.readFileSync(DOTENV_PATH, 'utf8')
  const lines = raw.split(/\r?\n/)

  for (const line of lines) {
    const trimmedLine = line.trim()
    if (!trimmedLine || trimmedLine.startsWith('#')) {
      continue
    }

    const separatorIndex = trimmedLine.indexOf('=')
    if (separatorIndex === -1) {
      continue
    }

    const key = trimmedLine.slice(0, separatorIndex).trim()
    const value = trimmedLine.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, '')

    if (key && !process.env[key]) {
      process.env[key] = value
    }
  }
}

function printHelp() {
  console.log(`
Uso:
  node scripts/firestore-wipe.mjs --dry-run
  node scripts/firestore-wipe.mjs --force
  node scripts/firestore-wipe.mjs --verify-only

Opciones:
  --force                       Ejecuta el borrado real.
  --dry-run                     No elimina nada; solo muestra lo que borraría.
  --verify-only                 Solo valida si la base está vacía.
  --only-known                  Borra solo las colecciones conocidas.
  --collections=a,b,c           Sobrescribe la lista base de colecciones.
  --project=PROJECT_ID          Proyecto Firebase/GCP.
  --database=DATABASE_ID        Base Firestore. Por defecto: (default)
  --service-account=RUTA_JSON   Ruta al service account.
  --help                        Muestra esta ayuda.

Variables soportadas:
  FIREBASE_PROJECT_ID
  FIRESTORE_DATABASE_ID
  FIREBASE_SERVICE_ACCOUNT_KEY_PATH
  GOOGLE_APPLICATION_CREDENTIALS
`)
}

function parseArgs(argv) {
  const parsed = {
    force: false,
    dryRun: false,
    verifyOnly: false,
    onlyKnown: false,
    help: false,
    projectId: '',
    databaseId: process.env.FIRESTORE_DATABASE_ID || '(default)',
    serviceAccountPath: process.env.FIREBASE_SERVICE_ACCOUNT_KEY_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS || '',
    collections: [...DEFAULT_COLLECTIONS],
  }

  for (const rawArg of argv) {
    if (rawArg === '--force') {
      parsed.force = true
      continue
    }

    if (rawArg === '--dry-run') {
      parsed.dryRun = true
      continue
    }

    if (rawArg === '--verify-only') {
      parsed.verifyOnly = true
      continue
    }

    if (rawArg === '--only-known') {
      parsed.onlyKnown = true
      continue
    }

    if (rawArg === '--help' || rawArg === '-h') {
      parsed.help = true
      continue
    }

    if (rawArg.startsWith('--project=')) {
      parsed.projectId = rawArg.slice('--project='.length).trim()
      continue
    }

    if (rawArg.startsWith('--database=')) {
      parsed.databaseId = rawArg.slice('--database='.length).trim() || '(default)'
      continue
    }

    if (rawArg.startsWith('--service-account=')) {
      parsed.serviceAccountPath = rawArg.slice('--service-account='.length).trim()
      continue
    }

    if (rawArg.startsWith('--collections=')) {
      const value = rawArg.slice('--collections='.length)
      parsed.collections = value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
      continue
    }

    throw new Error(`Argumento no soportado: ${rawArg}`)
  }

  if (parsed.dryRun && parsed.verifyOnly) {
    throw new Error('No puedes combinar --dry-run con --verify-only.')
  }

  return parsed
}

function resolveServiceAccountPath(maybePath) {
  if (!maybePath) {
    return ''
  }

  if (path.isAbsolute(maybePath)) {
    return maybePath
  }

  return path.resolve(process.cwd(), maybePath)
}

function loadFirebasercProjectId() {
  try {
    const raw = fs.readFileSync(FIREBASERC_PATH, 'utf8')
    const data = JSON.parse(raw)
    return data?.projects?.default || ''
  } catch {
    return ''
  }
}

function loadServiceAccount(serviceAccountPath) {
  if (!serviceAccountPath) {
    return null
  }

  const resolvedPath = resolveServiceAccountPath(serviceAccountPath)
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`No encontré el service account en: ${resolvedPath}`)
  }

  const raw = fs.readFileSync(resolvedPath, 'utf8')
  const json = JSON.parse(raw)

  return {
    path: resolvedPath,
    json,
  }
}

function resolveProjectId(options, serviceAccount) {
  return (
    options.projectId ||
    process.env.FIREBASE_PROJECT_ID ||
    serviceAccount?.json?.project_id ||
    loadFirebasercProjectId()
  )
}

function buildCredentials(serviceAccount) {
  if (serviceAccount?.json) {
    return {
      adminCredential: cert(serviceAccount.json),
      lowLevelOptions: {
        projectId: serviceAccount.json.project_id,
        credentials: {
          client_email: serviceAccount.json.client_email,
          private_key: serviceAccount.json.private_key,
        },
      },
    }
  }

  return {
    adminCredential: applicationDefault(),
    lowLevelOptions: {},
  }
}

function ensureAdminApp(projectId, credential) {
  const existingApp = getApps()[0]
  if (existingApp) {
    return existingApp
  }

  return initializeApp({
    credential,
    projectId,
  })
}

function getDatabaseRoot(projectId, databaseId) {
  return `projects/${projectId}/databases/${databaseId}/documents`
}

function toRelativeDocumentPath(rootPath, fullDocumentName) {
  const prefix = `${rootPath}/`
  if (!fullDocumentName.startsWith(prefix)) {
    throw new Error(`Ruta inesperada recibida desde Firestore: ${fullDocumentName}`)
  }

  return fullDocumentName.slice(prefix.length)
}

async function listNestedCollectionIds(client, parentDocumentPath) {
  const discovered = new Set()
  let pageToken = ''

  do {
    const [collectionIds, , response] = await client.listCollectionIds({
      parent: parentDocumentPath,
      pageSize: 100,
      pageToken: pageToken || undefined,
    })

    collectionIds.forEach((id) => discovered.add(id))
    pageToken = response?.nextPageToken || ''
  } while (pageToken)

  return [...discovered]
}

async function listRootCollectionIds(db) {
  const collections = await db.listCollections()
  return collections.map((collectionRef) => collectionRef.id)
}

async function listCollectionDocumentNames(client, parentPath, collectionId) {
  const documentNames = []
  let pageToken = ''

  do {
    const [documents, , response] = await client.listDocuments({
      parent: parentPath,
      collectionId,
      pageSize: 250,
      pageToken: pageToken || undefined,
      showMissing: true,
    })

    documentNames.push(...documents.map((document) => document.name))
    pageToken = response?.nextPageToken || ''
  } while (pageToken)

  return documentNames
}

function createStats() {
  return {
    deletedDocuments: 0,
    visitedCollections: new Set(),
    startedAt: Date.now(),
  }
}

async function deleteCollectionTree({
  client,
  db,
  writer,
  rootPath,
  parentPath,
  collectionId,
  stats,
  dryRun,
}) {
  const collectionKey = `${parentPath}/${collectionId}`
  if (stats.visitedCollections.has(collectionKey)) {
    return
  }

  stats.visitedCollections.add(collectionKey)

  const documentNames = await listCollectionDocumentNames(client, parentPath, collectionId)
  if (documentNames.length === 0) {
    return
  }

  for (const documentName of documentNames) {
    const childCollectionIds = await listNestedCollectionIds(client, documentName)

    for (const childCollectionId of childCollectionIds) {
      await deleteCollectionTree({
        client,
        db,
        writer,
        rootPath,
        parentPath: documentName,
        collectionId: childCollectionId,
        stats,
        dryRun,
      })
    }

    const relativePath = toRelativeDocumentPath(rootPath, documentName)
    if (!dryRun) {
      writer.delete(db.doc(relativePath))
    }
    stats.deletedDocuments += 1
  }

  if (!dryRun) {
    await writer.flush()
  }
}

async function verifyCollectionsAreEmpty(client, rootPath, collectionIds) {
  const collectionsWithDocuments = {}

  for (const collectionId of collectionIds) {
    const remaining = await listCollectionDocumentNames(client, rootPath, collectionId)
    if (remaining.length > 0) {
      collectionsWithDocuments[collectionId] = remaining.length
    }
  }

  return collectionsWithDocuments
}

function formatDurationMs(durationMs) {
  const seconds = Math.round(durationMs / 1000)
  if (seconds < 60) {
    return `${seconds}s`
  }

  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}m ${remainingSeconds}s`
}

async function main() {
  loadLocalEnvFile()

  const options = parseArgs(process.argv.slice(2))

  if (options.help) {
    printHelp()
    return
  }

  const serviceAccount = loadServiceAccount(options.serviceAccountPath)
  const projectId = resolveProjectId(options, serviceAccount)

  if (!projectId) {
    throw new Error(
      'No pude resolver el projectId. Define FIREBASE_PROJECT_ID, usa --project o agrega .firebaserc.'
    )
  }

  if (!options.force && !options.dryRun && !options.verifyOnly) {
    throw new Error(
      'Este comando es destructivo. Usa --dry-run para auditar, --verify-only para validar o --force para borrar.'
    )
  }

  const { adminCredential, lowLevelOptions } = buildCredentials(serviceAccount)
  const app = ensureAdminApp(projectId, adminCredential)
  const db = getFirestore(app, options.databaseId)
  const lowLevelClient = new v1.FirestoreClient({
    projectId,
    ...lowLevelOptions,
  })
  const rootPath = getDatabaseRoot(projectId, options.databaseId)
  const stats = createStats()

  const knownCollections = [...new Set(options.collections)]
  const discoveredRootCollections = await listRootCollectionIds(db)
  const collectionsToDelete = options.onlyKnown
    ? knownCollections
    : [...new Set([...knownCollections, ...discoveredRootCollections])]

  console.log(`Proyecto: ${projectId}`)
  console.log(`Base Firestore: ${options.databaseId}`)
  console.log(`Modo: ${options.verifyOnly ? 'verify-only' : options.dryRun ? 'dry-run' : 'wipe'}`)
  console.log(`Colecciones conocidas: ${knownCollections.join(', ') || '(ninguna)'}`)
  console.log(`Colecciones raíz detectadas: ${discoveredRootCollections.join(', ') || '(ninguna)'}`)
  console.log(`Colecciones objetivo: ${collectionsToDelete.join(', ') || '(ninguna)'}`)
  console.log(
    `Credenciales: ${
      serviceAccount?.path
        ? serviceAccount.path
        : 'ADC / GOOGLE_APPLICATION_CREDENTIALS / gcloud application-default'
    }`
  )

  if (options.verifyOnly) {
    const remainingRootCollections = await listRootCollectionIds(db)
    const collectionsWithDocuments = await verifyCollectionsAreEmpty(
      lowLevelClient,
      rootPath,
      [...new Set([...remainingRootCollections, ...collectionsToDelete])]
    )

    if (remainingRootCollections.length === 0 && Object.keys(collectionsWithDocuments).length === 0) {
      console.log('Verificación OK: Firestore está vacío.')
      return
    }

    console.error('Verificación fallida: aún existen datos o colecciones raíz.')
    console.error('Colecciones raíz restantes:', remainingRootCollections)
    console.error('Colecciones con documentos remanentes:', collectionsWithDocuments)
    process.exitCode = 1
    return
  }

  console.log('Recomendación: exporta un backup antes del wipe si la data todavía puede ser necesaria.')
  console.log(
    `Ejemplo de backup: gcloud firestore export gs://TU_BUCKET/firestore-backup-$(Get-Date -Format yyyyMMdd-HHmmss) --database='${options.databaseId}'`
  )

  const writer = db.bulkWriter()
  writer.onWriteError((error) => {
    console.error(
      `Error borrando ${error.documentRef.path}. Intento ${error.failedAttempts}: ${error.message}`
    )

    return error.failedAttempts < 5
  })

  for (const collectionId of collectionsToDelete) {
    await deleteCollectionTree({
      client: lowLevelClient,
      db,
      writer,
      rootPath,
      parentPath: rootPath,
      collectionId,
      stats,
      dryRun: options.dryRun,
    })
  }

  if (!options.dryRun) {
    await writer.close()
  }

  const elapsed = formatDurationMs(Date.now() - stats.startedAt)
  console.log(
    `${options.dryRun ? 'Dry-run completado' : 'Borrado completado'}: ${stats.deletedDocuments} documento(s), ${stats.visitedCollections.size} colección(es) recorrida(s), duración ${elapsed}.`
  )

  if (options.dryRun) {
    return
  }

  const remainingRootCollections = await listRootCollectionIds(db)
  const collectionsWithDocuments = await verifyCollectionsAreEmpty(
    lowLevelClient,
    rootPath,
    [...new Set([...remainingRootCollections, ...collectionsToDelete])]
  )

  if (remainingRootCollections.length === 0 && Object.keys(collectionsWithDocuments).length === 0) {
    console.log('Verificación final OK: Firestore quedó sin colecciones visibles ni documentos remanentes.')
    return
  }

  console.error('Verificación final fallida.')
  console.error('Colecciones raíz restantes:', remainingRootCollections)
  console.error('Colecciones con documentos remanentes:', collectionsWithDocuments)
  process.exitCode = 1
}

main().catch((error) => {
  console.error('Fallo en el wipe de Firestore:')
  console.error(error.message)
  process.exitCode = 1
})
