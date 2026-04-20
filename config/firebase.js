/**
 * Firebase configuration shared by backend services.
 */
export const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY || 'AIzaSyB7WkFAIiBDKaDBj3xOV99VYM5ocYi6Wp0',
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || 'rios-delivery-v2.firebaseapp.com',
  projectId: process.env.FIREBASE_PROJECT_ID || 'rios-delivery-v2',
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'rios-delivery-v2.firebasestorage.app',
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '456944424097',
  appId: process.env.FIREBASE_APP_ID || '1:456944424097:web:8387b9247a3ea3f3ba0ce0',
  measurementId: process.env.FIREBASE_MEASUREMENT_ID || 'G-N9PQYHWYWT',
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
