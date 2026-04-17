import { firestoreConfig } from '../../config/firebase.js'

class HistorialService {
  constructor(db) {
    this.db = db
    this.ventasCollection = firestoreConfig.collections.VENTAS
    this.inventarioCollection = firestoreConfig.collections.INVENTARIO
  }

  async obtenerHistorial(opciones = {}) {
    try {
      const { getDocs, query, where, collection } = await import('firebase/firestore')

      const q = query(
        collection(this.db, this.ventasCollection),
        where('marcaEliminar', '==', false),
      )

      const querySnapshot = await getDocs(q)
      let historial = []

      querySnapshot.forEach((docSnap) => {
        historial.push({
          id: docSnap.id,
          ...docSnap.data(),
        })
      })

      if (opciones.fechaInicio || opciones.fechaFin) {
        historial = this._filtrarPorFecha(historial, opciones.fechaInicio, opciones.fechaFin)
      }

      if (opciones.cliente) {
        historial = historial.filter((venta) =>
          (venta.cliente || venta.nombreCliente || '').toLowerCase().includes(opciones.cliente.toLowerCase()),
        )
      }

      if (opciones.especie) {
        historial = historial.filter((venta) =>
          (venta.especie || '').toLowerCase().includes(opciones.especie.toLowerCase()),
        )
      }

      if (opciones.idLote) {
        historial = historial.filter((venta) =>
          (venta.idLote || venta.numeroLote || '').toLowerCase().includes(opciones.idLote.toLowerCase()),
        )
      }

      historial = this._aplicarOrdenamiento(historial, opciones.ordenPor || 'fecha_desc')

      console.log(`OK Historial: ${historial.length} registros obtenidos`)
      return historial
    } catch (error) {
      console.error('Error al obtener historial:', error)
      return []
    }
  }

  async obtenerEstadisticas(fechaInicio = null, fechaFin = null) {
    try {
      const historial = await this.obtenerHistorial({ fechaInicio, fechaFin })

      if (historial.length === 0) {
        return this._estadisticasVacias()
      }

      const totalVentas = historial.length
      const totalPeso = historial.reduce((sum, venta) => sum + parseFloat(venta.cantidadVendida || 0), 0)
      const totalIngreso = historial.reduce((sum, venta) => {
        const cantidad = parseFloat(venta.cantidadVendida || 0)
        const precio = parseFloat(venta.precioUnitario || venta.precioVenta || 0)
        return sum + (cantidad * precio)
      }, 0)

      const promedioVenta = totalVentas > 0 ? totalIngreso / totalVentas : 0
      const promedioPeso = totalVentas > 0 ? totalPeso / totalVentas : 0
      const precioPromedio = totalPeso > 0 ? totalIngreso / totalPeso : 0

      const ventasPorCliente = this._agruparPor(historial, 'cliente')
      const clienteTop = Object.entries(ventasPorCliente).sort((a, b) => b[1].cantidad - a[1].cantidad)[0]

      const ventasPorEspecie = this._agruparPor(historial, 'especie')
      const especieTop = Object.entries(ventasPorEspecie).sort((a, b) => b[1].peso - a[1].peso)[0]

      return {
        periodo: {
          inicio: fechaInicio || 'Sin especificar',
          fin: fechaFin || 'Sin especificar',
        },
        totales: {
          ventas: totalVentas,
          peso: parseFloat(totalPeso.toFixed(2)),
          ingreso: parseFloat(totalIngreso.toFixed(2)),
        },
        promedios: {
          venta: parseFloat(promedioVenta.toFixed(2)),
          peso: parseFloat(promedioPeso.toFixed(2)),
          precioKg: parseFloat(precioPromedio.toFixed(2)),
        },
        topCliente: clienteTop ? {
          nombre: clienteTop[0] || 'Sin cliente',
          ventas: clienteTop[1].cantidad,
          peso: parseFloat(clienteTop[1].peso.toFixed(2)),
          ingreso: parseFloat(clienteTop[1].ingreso.toFixed(2)),
        } : null,
        topEspecie: especieTop ? {
          nombre: especieTop[0] || 'No especificada',
          cantidadVentas: especieTop[1].cantidad,
          pesoTotal: parseFloat(especieTop[1].peso.toFixed(2)),
          ingresoTotal: parseFloat(especieTop[1].ingreso.toFixed(2)),
        } : null,
      }
    } catch (error) {
      console.error('Error al obtener estadisticas:', error)
      return this._estadisticasVacias()
    }
  }

  async obtenerPorPeriodo(dias = 30) {
    try {
      const fechaFin = new Date()
      const fechaInicio = new Date(fechaFin.getTime() - dias * 24 * 60 * 60 * 1000)

      return await this.obtenerHistorial({
        fechaInicio: fechaInicio.toISOString(),
        fechaFin: fechaFin.toISOString(),
      })
    } catch (error) {
      console.error(`Error al obtener ventas de ultimos ${dias} dias:`, error)
      return []
    }
  }

  async obtenerTendencias(dias = 7) {
    try {
      const historial = await this.obtenerPorPeriodo(dias)
      const tendencias = {}

      historial.forEach((venta) => {
        const fecha = new Date(venta.fechaVentaTimestamp || venta.fechaVenta)
        const fechaStr = fecha.toLocaleDateString('es-CO')

        if (!tendencias[fechaStr]) {
          tendencias[fechaStr] = {
            fecha: fechaStr,
            cantidadVentas: 0,
            pesoTotal: 0,
            ingresoTotal: 0,
          }
        }

        tendencias[fechaStr].cantidadVentas += 1
        tendencias[fechaStr].pesoTotal += parseFloat(venta.cantidadVendida || 0)
        tendencias[fechaStr].ingresoTotal +=
          parseFloat(venta.cantidadVendida || 0) * parseFloat(venta.precioUnitario || venta.precioVenta || 0)
      })

      return Object.values(tendencias).sort((a, b) => new Date(a.fecha) - new Date(b.fecha))
    } catch (error) {
      console.error('Error al obtener tendencias:', error)
      return []
    }
  }

  async obtenerDetalleVenta(ventaId) {
    try {
      const { getDoc, doc } = await import('firebase/firestore')

      const ventaDoc = await getDoc(doc(this.db, this.ventasCollection, ventaId))

      if (!ventaDoc.exists()) {
        throw new Error('Venta no encontrada')
      }

      const venta = ventaDoc.data()
      let lotDetails = null

      if (venta.idLote) {
        try {
          const loteDoc = await getDoc(doc(this.db, this.inventarioCollection, venta.idLote))
          if (loteDoc.exists()) {
            lotDetails = loteDoc.data()
          }
        } catch {
          console.warn('No se encontro informacion del lote:', venta.idLote)
        }
      }

      return {
        id: ventaId,
        ...venta,
        lotDetails,
      }
    } catch (error) {
      console.error('Error al obtener detalle de venta:', error)
      return null
    }
  }

  async exportarJSON(opciones = {}) {
    try {
      const historial = await this.obtenerHistorial(opciones)
      const estadisticas = await this.obtenerEstadisticas(opciones.fechaInicio, opciones.fechaFin)

      return {
        exportado: new Date().toISOString(),
        filtros: opciones,
        estadisticas,
        datos: historial,
        totalRegistros: historial.length,
      }
    } catch (error) {
      console.error('Error al exportar JSON:', error)
      return null
    }
  }

  async reporteVentasPorCliente() {
    try {
      const historial = await this.obtenerHistorial()
      const ventasPorCliente = this._agruparPor(historial, 'cliente')

      return Object.entries(ventasPorCliente)
        .map(([cliente, datos]) => ({
          cliente: cliente || 'Sin cliente',
          cantidadVentas: datos.cantidad,
          pesoTotal: parseFloat(datos.peso.toFixed(2)),
          ingresoTotal: parseFloat(datos.ingreso.toFixed(2)),
          precioPromedio: parseFloat((datos.ingreso / datos.cantidad).toFixed(2)),
        }))
        .sort((a, b) => b.ingresoTotal - a.ingresoTotal)
    } catch (error) {
      console.error('Error al generar reporte por cliente:', error)
      return []
    }
  }

  async reporteVentasPorEspecie() {
    try {
      const historial = await this.obtenerHistorial()
      const ventasPorEspecie = this._agruparPor(historial, 'especie')

      return Object.entries(ventasPorEspecie)
        .map(([especie, datos]) => {
          const precioPromedio = datos.peso > 0 ? datos.ingreso / datos.peso : 0

          return {
            especie: especie || 'No especificada',
            cantidadVentas: datos.cantidad,
            pesoTotal: parseFloat(datos.peso.toFixed(2)),
            ingresoTotal: parseFloat(datos.ingreso.toFixed(2)),
            precioPromedio: parseFloat(precioPromedio.toFixed(2)),
          }
        })
        .sort((a, b) => b.ingresoTotal - a.ingresoTotal)
    } catch (error) {
      console.error('Error al generar reporte por especie:', error)
      return []
    }
  }

  _filtrarPorFecha(ventas, fechaInicio, fechaFin) {
    return ventas.filter((venta) => {
      const fecha = new Date(venta.fechaVentaTimestamp || venta.fechaVenta || 0)
      if (fechaInicio && fecha < new Date(fechaInicio)) return false
      if (fechaFin && fecha > new Date(fechaFin)) return false
      return true
    })
  }

  _aplicarOrdenamiento(ventas, ordenPor) {
    const copia = [...ventas]

    switch (ordenPor) {
      case 'fecha_asc':
        return copia.sort((a, b) => new Date(a.fechaVentaTimestamp || a.fechaVenta) - new Date(b.fechaVentaTimestamp || b.fechaVenta))
      case 'fecha_desc':
        return copia.sort((a, b) => new Date(b.fechaVentaTimestamp || b.fechaVenta) - new Date(a.fechaVentaTimestamp || a.fechaVenta))
      case 'monto_desc':
        return copia.sort((a, b) => {
          const montoA = parseFloat(a.cantidadVendida || 0) * parseFloat(a.precioUnitario || a.precioVenta || 0)
          const montoB = parseFloat(b.cantidadVendida || 0) * parseFloat(b.precioUnitario || b.precioVenta || 0)
          return montoB - montoA
        })
      case 'monto_asc':
        return copia.sort((a, b) => {
          const montoA = parseFloat(a.cantidadVendida || 0) * parseFloat(a.precioUnitario || a.precioVenta || 0)
          const montoB = parseFloat(b.cantidadVendida || 0) * parseFloat(b.precioUnitario || b.precioVenta || 0)
          return montoA - montoB
        })
      case 'peso_desc':
        return copia.sort((a, b) => parseFloat(b.cantidadVendida || 0) - parseFloat(a.cantidadVendida || 0))
      case 'peso_asc':
        return copia.sort((a, b) => parseFloat(a.cantidadVendida || 0) - parseFloat(b.cantidadVendida || 0))
      default:
        return copia.sort((a, b) => new Date(b.fechaVentaTimestamp || b.fechaVenta) - new Date(a.fechaVentaTimestamp || a.fechaVenta))
    }
  }

  _agruparPor(ventas, campo) {
    const agrupado = {}

    ventas.forEach((venta) => {
      const valor = venta[campo] || 'Sin especificar'

      if (!agrupado[valor]) {
        agrupado[valor] = {
          cantidad: 0,
          peso: 0,
          ingreso: 0,
        }
      }

      agrupado[valor].cantidad += 1
      agrupado[valor].peso += parseFloat(venta.cantidadVendida || 0)
      agrupado[valor].ingreso +=
        parseFloat(venta.cantidadVendida || 0) * parseFloat(venta.precioUnitario || venta.precioVenta || 0)
    })

    return agrupado
  }

  _estadisticasVacias() {
    return {
      periodo: {
        inicio: 'Sin especificar',
        fin: 'Sin especificar',
      },
      totales: {
        ventas: 0,
        peso: 0,
        ingreso: 0,
      },
      promedios: {
        venta: 0,
        peso: 0,
        precioKg: 0,
      },
      topCliente: null,
      topEspecie: null,
    }
  }
}

export default HistorialService
