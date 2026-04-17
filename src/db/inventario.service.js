import { firestoreConfig } from '../../config/firebase.js'

class InventarioService {
  constructor(db) {
    this.db = db
    this.collectionName = firestoreConfig.collections.INVENTARIO
  }

  collection() {
    return this.db.collection(this.collectionName)
  }

  async agregarLote(datosLote) {
    try {
      const docRef = await this.collection().add({
        ...datosLote,
        fechaEntrada: new Date(),
        cantidadVendida: 0,
        activo: true,
        marcaEliminar: false,
      })

      console.log('OK Lote guardado:', docRef.id)
      return {
        success: true,
        id: docRef.id,
        message: 'Lote guardado exitosamente',
      }
    } catch (error) {
      console.error('Error al guardar lote:', error)
      return {
        success: false,
        message: error.message,
      }
    }
  }

  async obtenerLotes() {
    try {
      const querySnapshot = await this.collection()
        .where('marcaEliminar', '==', false)
        .get()
      const lotes = []

      querySnapshot.forEach(docSnap => {
        lotes.push({
          id: docSnap.id,
          ...docSnap.data(),
        })
      })

      lotes.sort((a, b) => {
        const fechaA = new Date(a.fechaIngreso || 0)
        const fechaB = new Date(b.fechaIngreso || 0)
        return fechaB - fechaA
      })

      console.log(`OK ${lotes.length} lotes obtenidos`)
      return lotes
    } catch (error) {
      console.error('Error al obtener lotes:', error)
      return []
    }
  }

  async obtenerLote(id) {
    try {
      const docSnap = await this.collection().doc(id).get()

      if (docSnap.exists) {
        return {
          id: docSnap.id,
          ...docSnap.data(),
        }
      }

      return null
    } catch (error) {
      console.error('Error al obtener lote:', error)
      return null
    }
  }

  async actualizarLote(id, datosActualizar) {
    try {
      await this.collection().doc(id).update(datosActualizar)

      console.log('OK Lote actualizado:', id)
      return { success: true }
    } catch (error) {
      console.error('Error al actualizar lote:', error)
      return { success: false, message: error.message }
    }
  }

  async obtenerEstadisticas() {
    try {
      const lotes = await this.obtenerLotes()

      const totalKg = lotes.reduce((sum, lote) => sum + parseFloat(lote.pesoTotal || 0), 0)
      const totalDisponible = lotes.reduce((sum, lote) => {
        return sum + (parseFloat(lote.pesoTotal || 0) - parseFloat(lote.cantidadVendida || 0))
      }, 0)
      const totalVendido = lotes.reduce((sum, lote) => sum + parseFloat(lote.cantidadVendida || 0), 0)

      return {
        totalLotes: lotes.length,
        totalKg,
        totalDisponible,
        totalVendido,
        porcentajeOcupacion: (totalKg / firestoreConfig.CAPACITY.MAX_KG) * 100,
        lotes,
      }
    } catch (error) {
      console.error('Error al obtener estadisticas:', error)
      return null
    }
  }

  async marcarPerdidas() {
    try {
      const hoy = new Date()
      const diasPerdida = firestoreConfig.FRESHNESS.DIAS_PERDIDA || 10

      // Obtener todos los lotes no eliminados
      const querySnapshot = await this.collection()
        .where('marcaEliminar', '==', false)
        .get()
      let perdidasRegistradas = 0

      // Revisar cada lote
      const updatePromises = []

      querySnapshot.forEach((docSnap) => {
        const lote = docSnap.data()
        
        // No procesar si ya es pérdida o está agotado
        if (lote.estado === 'Pérdida' || lote.estado === 'Agotado') {
          return
        }

        const fechaIngreso = lote.fechaIngreso 
          ? new Date(lote.fechaIngreso) 
          : lote.fechaEntrada?.toDate?.() || new Date()

        // Calcular días transcurridos
        const diasTranscurridos = Math.floor(
          (hoy - fechaIngreso) / (1000 * 60 * 60 * 24)
        )

        // Si pasaron 10 o más días, marcar como pérdida
        if (diasTranscurridos >= diasPerdida) {
          updatePromises.push(
            docSnap.ref.update({
              estado: 'Pérdida',
              marcaPerdida: true,
              fechaPerdida: new Date(),
              diasAlmacenamiento: diasTranscurridos,
              pesoPeridoTotal: lote.pesoTotal || 0,
              motivoPerdida: `Producto alcanzó ${diasTranscurridos} días de antigüedad`,
            })
          )
          perdidasRegistradas++
        }
      })

      // Ejecutar todas las actualizaciones en paralelo
      if (updatePromises.length > 0) {
        await Promise.all(updatePromises)
        console.log(`✓ ${perdidasRegistradas} lotes marcados como pérdida`)
      }

      return {
        success: true,
        perdidasRegistradas,
        message: `${perdidasRegistradas} lote(s) marcado(s) como pérdida`,
      }
    } catch (error) {
      console.error('Error al marcar pérdidas:', error)
      return {
        success: false,
        message: error.message,
      }
    }
  }

  async obtenerPerdidas() {
    try {
      const querySnapshot = await this.collection()
        .where('marcaEliminar', '==', false)
        .where('estado', '==', 'Pérdida')
        .get()
      const perdidas = []

      querySnapshot.forEach((docSnap) => {
        perdidas.push({
          id: docSnap.id,
          ...docSnap.data(),
        })
      })

      perdidas.sort((a, b) => {
        const fechaA = a.fechaPerdida?.toDate?.() || new Date(a.fechaPerdida || 0)
        const fechaB = b.fechaPerdida?.toDate?.() || new Date(b.fechaPerdida || 0)
        return fechaB - fechaA
      })

      console.log(`✓ ${perdidas.length} pérdidas obtenidas`)
      return perdidas
    } catch (error) {
      console.error('Error al obtener pérdidas:', error)
      return []
    }
  }
}

export default InventarioService
