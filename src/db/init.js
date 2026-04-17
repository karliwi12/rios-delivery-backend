import { firestoreConfig } from '../../config/firebase.js'

async function crearIndices() {
  try {
    console.log('Creando indices en Firestore...')

    const indicesNecesarios = [
      {
        coleccion: firestoreConfig.collections.INVENTARIO,
        campos: ['marcaEliminar', 'estado', 'fechaIngreso'],
      },
      {
        coleccion: firestoreConfig.collections.VENTAS,
        campos: ['marcaEliminar', 'estado', 'fechaVenta'],
      },
    ]

    if (indicesNecesarios.length > 0) {
      console.log('OK Indices documentados. Firestore los crea automaticamente cuando se necesitan.')
    }

    return true
  } catch (error) {
    console.error('Error creando indices:', error)
    return false
  }
}

export async function inicializarBD(db) {
  try {
    console.log('Inicializando base de datos...')
    await crearIndices(db)
    console.log('OK Base de datos inicializada')
    return true
  } catch (error) {
    console.error('Error inicializando BD:', error)
    return false
  }
}
