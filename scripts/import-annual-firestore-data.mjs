#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'

const SCRIPT_PATH = fileURLToPath(import.meta.url)
const SCRIPT_DIR = path.dirname(SCRIPT_PATH)
const BACKEND_DIR = path.resolve(SCRIPT_DIR, '..')
const REPO_DIR = path.resolve(BACKEND_DIR, '..')
const DOTENV_PATH = path.join(BACKEND_DIR, '.env')
const DEFAULT_DATA_PATH = path.join(REPO_DIR, 'firestore-test-data', 'rios-delivery-2025-firestore-data.json')

function loadLocalEnvFile() {
  if (!fs.existsSync(DOTENV_PATH)) return

  const raw = fs.readFileSync(DOTENV_PATH, 'utf8')
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const separatorIndex = trimmed.indexOf('=')
    if (separatorIndex === -1) continue

    const key = trimmed.slice(0, separatorIndex).trim()
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, '')

    if (key && !process.env[key]) {
      process.env[key] = value
    }
  }
}

function parseArgs(argv) {
  const options = {
    dataPath: DEFAULT_DATA_PATH,
    projectId: '',
    serviceAccountPath: '',
    dryRun: false,
  }

  for (const arg of argv) {
    if (arg === '--dry-run') {
      options.dryRun = true
      continue
    }

    if (arg.startsWith('--data=')) {
      options.dataPath = arg.slice('--data='.length).trim()
      continue
    }

    if (arg.startsWith('--project=')) {
      options.projectId = arg.slice('--project='.length).trim()
      continue
    }

    if (arg.startsWith('--service-account=')) {
      options.serviceAccountPath = arg.slice('--service-account='.length).trim()
      continue
    }

    throw new Error(`Argumento no soportado: ${arg}`)
  }

  return options
}

function resolvePath(inputPath, baseDir = process.cwd()) {
  if (!inputPath) return ''
  return path.isAbsolute(inputPath) ? inputPath : path.resolve(baseDir, inputPath)
}

function resolveServiceAccountPath(cliPath) {
  const configuredPath = (
    cliPath ||
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH ||
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY_PATH ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    './serviceAccountKey.json'
  )

  return resolvePath(configuredPath, BACKEND_DIR)
}

function readJson(jsonPath) {
  if (!fs.existsSync(jsonPath)) {
    throw new Error(`No existe el archivo: ${jsonPath}`)
  }

  return JSON.parse(fs.readFileSync(jsonPath, 'utf8'))
}

function toFirestoreValue(value) {
  if (Array.isArray(value)) {
    return value.map(toFirestoreValue)
  }

  if (value && typeof value === 'object') {
    if (value.__type === 'timestamp') {
      const parsedDate = new Date(value.value)
      if (Number.isNaN(parsedDate.getTime())) {
        throw new Error(`Timestamp invalido: ${value.value}`)
      }
      return Timestamp.fromDate(parsedDate)
    }

    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, toFirestoreValue(nestedValue)])
    )
  }

  return value
}

async function writeCollection(db, collectionName, docs, dryRun) {
  const entries = Object.entries(docs || {})
  if (entries.length === 0) return 0

  let written = 0
  let batch = db.batch()
  let batchCount = 0

  for (const [docId, rawData] of entries) {
    const ref = db.collection(collectionName).doc(docId)
    const data = toFirestoreValue(rawData)

    if (!dryRun) {
      batch.set(ref, data)
    }

    batchCount += 1
    written += 1

    if (batchCount === 450) {
      if (!dryRun) {
        await batch.commit()
      }
      batch = db.batch()
      batchCount = 0
    }
  }

  if (batchCount > 0 && !dryRun) {
    await batch.commit()
  }

  return written
}

async function main() {
  loadLocalEnvFile()
  const options = parseArgs(process.argv.slice(2))
  const dataPath = resolvePath(options.dataPath, REPO_DIR)
  const serviceAccountPath = resolveServiceAccountPath(options.serviceAccountPath)
  const serviceAccount = readJson(serviceAccountPath)
  const projectId = options.projectId || process.env.FIREBASE_PROJECT_ID || serviceAccount.project_id
  const dataset = readJson(dataPath)

  if (!dataset.inventario || !dataset.ventas) {
    throw new Error('El JSON debe contener las claves inventario y ventas.')
  }

  if (getApps().length === 0) {
    initializeApp({
      credential: cert(serviceAccount),
      projectId,
    })
  }

  const db = getFirestore()
  const inventarioCount = Object.keys(dataset.inventario).length
  const ventasCount = Object.keys(dataset.ventas).length

  console.log(`${options.dryRun ? 'DRY RUN' : 'IMPORT'} project=${projectId}`)
  console.log(`data=${dataPath}`)
  console.log(`inventario=${inventarioCount}`)
  console.log(`ventas=${ventasCount}`)

  const writtenInventario = await writeCollection(db, 'inventario', dataset.inventario, options.dryRun)
  const writtenVentas = await writeCollection(db, 'ventas', dataset.ventas, options.dryRun)

  console.log(`OK inventario escritos=${writtenInventario}`)
  console.log(`OK ventas escritos=${writtenVentas}`)
}

main().catch((error) => {
  console.error(`ERROR ${error.message}`)
  process.exitCode = 1
})
