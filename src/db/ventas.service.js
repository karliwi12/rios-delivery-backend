import { firestoreConfig } from '../../config/firebase.js'

class VentasService {
  constructor(db) {
    this.db = db
    this.collectionName = firestoreConfig.collections.VENTAS
  }

  async registrarVenta(datosVenta, inventarioService) {
    try {
      const { addDoc, collection, getDoc, doc, updateDoc, Timestamp } = await import('firebase/firestore')

      const loteId = datosVenta.idLote || datosVenta.id
      const loteRef = doc(this.db, firestoreConfig.collections.INVENTARIO, loteId)
      const loteSnap = await getDoc(loteRef)

      if (!loteSnap.exists()) {
        throw new Error('Lote no encontrado en inventario')
      }

      const loteData = loteSnap.data()

      // Verificar que el lote no esté marcado como pérdida
      if (loteData.estado === 'Pérdida' || loteData.marcaPerdida === true) {
        throw new Error('No se puede vender un producto marcado como pérdida')
      }

      // Verificar que el lote no esté en estado DAÑADO
      if (loteData.estado === 'DAÑADO') {
        throw new Error('No se puede vender un producto DAÑADO. El producto debe marcarse como CADUCADO en pérdidas')
      }

      // Verificar que el lote no esté caducado (más de 8 días)
      const MAX_DAYS = 8
      const fechaIngreso = loteData.fechaIngreso ? new Date(loteData.fechaIngreso) : (loteData.fechaEntrada?.toDate?.() || new Date())
      const diasTranscurridos = Math.floor((new Date() - fechaIngreso) / (1000 * 60 * 60 * 24))
      if (diasTranscurridos > MAX_DAYS) {
        throw new Error(`No se puede vender un producto caducado (${diasTranscurridos} días de antigüedad). Máximo permitido: ${MAX_DAYS} días`)
      }

      const cantidadVendida = parseFloat(datosVenta.cantidadVendida)
      const cantidadDisponible = parseFloat(loteData.pesoTotal || 0) - parseFloat(loteData.cantidadVendida || 0)

      if (cantidadVendida > cantidadDisponible) {
        throw new Error(`Cantidad insuficiente. Disponible: ${cantidadDisponible.toFixed(2)} kg`)
      }

      const docRef = await addDoc(collection(this.db, this.collectionName), {
        ...datosVenta,
        fechaVentaTimestamp: Timestamp.now(),
        activo: true,
        marcaEliminar: false,
      })

      const nuevaCantidadVendida = parseFloat(loteData.cantidadVendida || 0) + cantidadVendida
      const cantidadActualDisponible = parseFloat(loteData.pesoTotal || 0) - nuevaCantidadVendida

      if (cantidadActualDisponible <= 0) {
        await updateDoc(loteRef, {
          cantidadVendida: nuevaCantidadVendida,
          estado: 'Agotado',
          marcaEliminar: true,
        })

        console.log('OK Venta registrada y lote eliminado:', docRef.id)
      } else {
        await updateDoc(loteRef, {
          cantidadVendida: nuevaCantidadVendida,
          estado: loteData.estado,
        })

        console.log('OK Venta registrada y inventario sincronizado:', docRef.id)
      }

      return {
        success: true,
        id: docRef.id,
        message: 'Venta registrada exitosamente',
        inventarioActualizado: {
          cantidadVendida: nuevaCantidadVendida,
          cantidadDisponible: cantidadActualDisponible,
          estado: cantidadActualDisponible <= 0 ? 'Agotado' : loteData.estado,
          eliminado: cantidadActualDisponible <= 0,
        },
      }
    } catch (error) {
      console.error('Error al registrar venta:', error)
      return {
        success: false,
        message: error.message,
      }
    }
  }

  async obtenerVentas() {
    try {
      const { getDocs, query, where, collection } = await import('firebase/firestore')

      const q = query(
        collection(this.db, this.collectionName),
        where('marcaEliminar', '==', false),
      )

      const querySnapshot = await getDocs(q)
      const ventas = []

      querySnapshot.forEach((docSnap) => {
        ventas.push({
          id: docSnap.id,
          ...docSnap.data(),
        })
      })

      ventas.sort((a, b) => {
        const fechaA = new Date(a.fechaVenta || 0)
        const fechaB = new Date(b.fechaVenta || 0)
        return fechaB - fechaA
      })

      console.log(`OK ${ventas.length} ventas obtenidas`)
      return ventas
    } catch (error) {
      console.error('Error al obtener ventas:', error)
      return []
    }
  }

  async obtenerEstadisticas(fechaInicio = null, fechaFin = null) {
    try {
      const ventas = await this.obtenerVentas()

      let ventasFiltradas = ventas
      if (fechaInicio || fechaFin) {
        ventasFiltradas = ventas.filter((venta) => {
          const fecha = new Date(venta.fechaVenta)
          if (fechaInicio && fecha < new Date(fechaInicio)) return false
          if (fechaFin && fecha > new Date(fechaFin)) return false
          return true
        })
      }

      const totalVentas = ventasFiltradas.length
      const totalIngreso = ventasFiltradas.reduce((sum, venta) => sum + parseFloat(venta.total || 0), 0)
      const totalKgVendidos = ventasFiltradas.reduce((sum, venta) => sum + parseFloat(venta.cantidadVendida || 0), 0)
      const promedioVenta = totalVentas > 0 ? totalIngreso / totalVentas : 0

      return {
        totalVentas,
        totalIngreso,
        totalKgVendidos,
        promedioVenta,
        ventas: ventasFiltradas,
      }
    } catch (error) {
      console.error('Error al obtener estadisticas:', error)
      return null
    }
  }
}

export default VentasService
