# 📦 Base de Datos - Ríos Delivery V2

## 📍 Ubicación de Archivos

```
backend/
├── config/
│   └── firebase.js                ← Configuración de Firebase
├── src/
│   ├── index.js                   ← Servidor Express principal
│   └── db/
│       ├── index.js               ← Índice de servicios
│       ├── init.js                ← Inicialización y validación
│       ├── inventario.service.js  ← Servicio de inventario
│       ├── ventas.service.js      ← Servicio de ventas
│       └── historial.service.js   ← Servicio de historial de ventas
├── .env.example                   ← Variables de entorno
└── DATABASE.md                    ← Este archivo
```

---

## 🔧 Configuración

### 1. Variables de Entorno

Copia `.env.example` a `.env`:
```bash
cp .env.example .env
```

Actualiza los valores con tus credenciales de Firebase.

### 2. Firebase Configuration

El archivo `config/firebase.js` contiene:
- Credenciales de Firebase
- Nombres de colecciones
- Límites de capacidad
- Configuración de frescura
- Estados válidos del sistema

---

## 🗄️ Servicios de Base de Datos

### InventarioService

Gestiona lotes de pescado.

**Métodos:**
- `agregarLote(datosLote)` - Agregar nuevo lote
- `obtenerLotes(filtros)` - Obtener todos los lotes activos
- `obtenerLote(id)` - Obtener un lote específico
- `actualizarLote(id, datos)` - Actualizar cualquier campo
- `obtenerEstadisticas()` - Obtener estadísticas del inventario

**Ejemplo:**
```javascript
const inventarioService = new InventarioService(db)

const nuevoLote = {
  idLote: "#MOJ-2024-001",
  proveedor: "Piscicultura Los Ríos",
  especie: "Mojarra",
  pesoTotal: 25.5,
  tamaño: "Mediano",
  precioCompra: 8500,
  precioVentaSugerido: 12000,
  estado: "Excelente",
  fechaIngreso: "2024-05-24"
}

const resultado = await inventarioService.agregarLote(nuevoLote)
```

### VentasService

Gestiona ventas y sincronización con inventario.

**Métodos:**
- `registrarVenta(datosVenta, inventarioService)` - Registrar venta y actualizar inventario
- `obtenerVentas(filtros)` - Obtener todas las ventas
- `obtenerEstadisticas(fechaInicio, fechaFin)` - Obtener estadísticas de ventas

**Ejemplo:**
```javascript
const ventasService = new VentasService(db)

const venta = {
  idLote: "doc-id-del-lote",
  especie: "Mojarra",
  proveedor: "Piscicultura Los Ríos",
  cantidadVendida: 10,
  precioUnitario: 12000,
  total: 120000,
  metodoPago: "efectivo",
  estado: "completado",
  fechaVenta: "2024-05-24"
}

const resultado = await ventasService.registrarVenta(venta, inventarioService)
```

### HistorialService

Gestiona consultas, reportes y análisis del historial de ventas.

**Métodos:**
- `obtenerHistorial(opciones)` - Obtener historial con filtros (fechaInicio, fechaFin, cliente, especie, idLote, ordenPor)
- `obtenerEstadisticas(fechaInicio, fechaFin)` - Estadísticas generales del período
- `obtenerPorPeriodo(días)` - Ventas de los últimos N días
- `obtenerTendencias(días)` - Tendencias por día (para gráficos)
- `obtenerDetalleVenta(ventaId)` - Información completa de una venta
- `reporteVentasPorCliente()` - Reporte: ventas agrupadas por cliente
- `reporteVentasPorEspecie()` - Reporte: ventas agrupadas por especie
- `exportarJSON(opciones)` - Exportar datos filtrados en formato JSON

**Ejemplo:**
```javascript
const historialService = new HistorialService(db)

// Obtener historial del último mes ordenado por monto descendente
const historial = await historialService.obtenerHistorial({
  fechaInicio: "2024-04-24",
  fechaFin: "2024-05-24",
  ordenPor: "monto_desc"
})

// Obtener estadísticas del trimestre
const stats = await historialService.obtenerEstadisticas(
  "2024-03-01",
  "2024-05-31"
)

// Obtener tendencias de últimos 7 días para gráficos
const tendencias = await historialService.obtenerTendencias(7)

// Generar reporte de ventas por cliente
const reporteCliente = await historialService.reporteVentasPorCliente()
```

---

## 🗂️ Estructura de Colecciones Firestore

### `inventario` Collection

```javascript
{
  // IDs y referencias
  id: "doc-firestore-id",
  idLote: "#MOJ-2024-001",
  
  // Información del producto
  especie: "Mojarra",
  proveedor: "Piscicultura Los Ríos",
  pesoTotal: 25.5,
  cantidadVendida: 10,
  tamaño: "Mediano",
  
  // Precios
  precioCompra: 8500,
  precioVentaSugerido: 12000,
  
  // Estado y fechas
  estado: "Excelente",  // "Excelente", "Moderado", "Crítico", "Agotado"
  fechaIngreso: "2024-05-24",
  fechaEntrada: Timestamp,
  
  // Control
  activo: true,
  marcaEliminar: false  // Soft delete
}
```

### `ventas` Collection

```javascript
{
  // Información de la venta
  id: "doc-firestore-id",
  idLote: "doc-id-del-lote",
  especie: "Mojarra",
  proveedor: "Piscicultura Los Ríos",
  cantidadVendida: 10,
  precioUnitario: 12000,
  total: 120000,
  
  // Cliente (opcional)
  nombreCliente: "Restaurante Mar Azul",
  cedulaNit: "12345678",
  
  // Pago y estado
  metodoPago: "efectivo",  // "efectivo", "transferencia", "credito"
  estado: "completado",    // "pendiente", "completada", "cancelada"
  fechaVenta: "2024-05-24",
  
  // Control
  activo: true,
  marcaEliminar: false
}
```

---

## 🔄 Flujo de Sincronización de Venta

Cuando se registra una venta:

```
1. Validar que el lote exista
2. Validar que haya suficiente cantidad disponible
3. Guardar el documento de venta
4. Actualizar cantidadVendida en el lote
5. Si cantidadDisponible <= 0:
   - Marcar como "Agotado"
   - Marcar marcaEliminar = true
6. Retornar resultado con cambios en inventario
```

---

## 📊 Estadísticas

### Inventario
```javascript
const stats = await inventarioService.obtenerEstadisticas()
// Retorna:
// {
//   totalLotes: 5,
//   totalKg: 125.5,
//   totalDisponible: 95.5,
//   totalVendido: 30,
//   porcentajeOcupacion: 33.5,
//   lotes: [...]
// }
```

### Ventas
```javascript
const stats = await ventasService.obtenerEstadisticas(
  "2024-05-01", // fechaInicio
  "2024-05-31"  // fechaFin
)
// Retorna:
// {
//   totalVentas: 10,
//   totalIngreso: 1500000,
//   totalKgVendidos: 100,
//   promedioVenta: 150000,
//   ventas: [...]
// }
```

---

## 🛡️ Validación

El sistema valida automáticamente:

### Lotes
- ✓ Campo idLote requerido
- ✓ Campo proveedor requerido
- ✓ Campo especie requerido
- ✓ pesoTotal debe ser número positivo
- ✓ Precios deben ser válidos

### Ventas
- ✓ Lote debe existir
- ✓ Cantidad disponible debe ser suficiente
- ✓ Campos requeridos presentes

---

## 🗑️ Soft Delete

El sistema usa soft delete: los documentos no se eliminan, solo se marcan con `marcaEliminar: true`.

**Beneficios:**
- ✓ Auditabilidad completa
- ✓ Recuperación posible
- ✓ Historial intacto

Los servicios filtran automáticamente documentos marcados para eliminar.

---

## 🔗 API Endpoints

### Inventario
- `GET /api/inventario` - Obtener todos los lotes
- `GET /api/inventario/estadisticas` - Estadísticas generales
- `POST /api/inventario/lote` - Agregar nuevo lote

### Ventas
- `GET /api/ventas` - Obtener todas las ventas
- `GET /api/ventas/estadisticas` - Estadísticas por período
- `POST /api/ventas` - Registrar nueva venta

### Historial de Ventas
- `GET /api/historial` - Obtener historial con filtros (query params: fechaInicio, fechaFin, cliente, especie, idLote, ordenPor)
- `GET /api/historial/estadisticas` - Estadísticas generales (query params: fechaInicio, fechaFin)
- `GET /api/historial/tendencias` - Tendencias por día (query param: días=7)
- `GET /api/historial/venta/:ventaId` - Detalle de una venta específica
- `GET /api/historial/reporte/cliente` - Reporte de ventas por cliente
- `GET /api/historial/reporte/especie` - Reporte de ventas por especie
- `GET /api/historial/exportar` - Exportar datos en JSON (query params: fechaInicio, fechaFin, cliente, especie, idLote)

### Health
- `GET /api/health` - Verificar estado del servidor

---

## 📚 Próximas Mejoras

- [ ] Autenticación con Firebase Auth
- [ ] Roles y permisos de usuarios
- [ ] Auditoría detallada de cambios
- [ ] Backup automático
- [ ] Reportes avanzados
- [ ] Notificaciones en tiempo real

---

**Última actualización:** 2024-05-24
