/**
 * Firebase configuration shared by backend services.
 */
export const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY || 'AIzaSyDKr4fAKrQv4CHNVd-W69IomSjLA7bLQ1w',
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || 'rios-delivery.firebaseapp.com',
  projectId: process.env.FIREBASE_PROJECT_ID || 'rios-delivery',
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'rios-delivery.firebasestorage.app',
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '164287925534',
  appId: process.env.FIREBASE_APP_ID || '1:164287925534:web:8484b4ad962b83f0f58d0f',
  measurementId: process.env.FIREBASE_MEASUREMENT_ID || 'G-14589QHDZG',
}

export const firestoreConfig = {
  collections: {
    INVENTARIO: 'inventario',
    VENTAS: 'ventas',
    CLIENTES: 'clientes',
    USUARIOS: 'usuarios',
    REPORTES: 'reportes',
  },
  CAPACITY: {
    MAX_ARROBAS: 30,
    MAX_KG: 375,
  },
  FRESHNESS: {
    MAX_DAYS: 8,
    CRITICAL_THRESHOLD: 1,
    WARNING_THRESHOLD: 5,
    DIAS_PERDIDA: 10,
  },
  AUDIT: {
    TRACK_CHANGES: true,
    SOFT_DELETE: true,
  },
}

export const ESTADOS = {
  LOTE: {
    EXCELENTE: 'Excelente',
    MODERADO: 'Moderado',
    CRITICO: 'Critico',
    AGOTADO: 'Agotado',
    PERDIDA: 'Pérdida',
  },
  VENTA: {
    PENDIENTE: 'Pendiente',
    COMPLETADA: 'Completada',
    CANCELADA: 'Cancelada',
  },
  USUARIO: {
    ACTIVO: 'Activo',
    INACTIVO: 'Inactivo',
    ELIMINADO: 'Eliminado',
  },
}
