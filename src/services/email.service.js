import nodemailer from 'nodemailer'

/**
 * Servicio de Email
 * Envía notificaciones por correo cuando productos caducam
 */

class EmailService {
  constructor() {
    // Configurar transporte de email
    // Usa variables de entorno para credenciales seguras
    this.transporter = nodemailer.createTransport({
      service: process.env.EMAIL_SERVICE || 'gmail',
      auth: {
        user: process.env.EMAIL_USER || 'noreply@riosdelivery.com',
        pass: process.env.EMAIL_PASSWORD || process.env.EMAIL_APP_PASSWORD
      },
      tls: {
        rejectUnauthorized: false // Permitir certificados autofirmados en desarrollo
      }
    })

    this.senderEmail = process.env.EMAIL_USER || 'noreply@riosdelivery.com'
    this.senderName = 'Ríos Delivery Alertas'

    // Verificar conexión (opcional, log en consola)
    this.verifyConnection()
  }

  async verifyConnection() {
    try {
      await this.transporter.verify()
      console.log('✓ Servicio de email conectado correctamente')
    } catch (error) {
      console.warn('⚠️ Advertencia: No se pudo conectar al servicio de email', {
        service: process.env.EMAIL_SERVICE,
        user: process.env.EMAIL_USER ? '***' : 'no configurado'
      })
    }
  }

  /**
   * Enviar notificación de producto caducado
   * @param {Object} datos
   * @param {string} datos.email - Correo del destinatario
   * @param {string} datos.especie - Especie del producto
   * @param {string} datos.lote - Número de lote
   * @param {string} datos.estado - Estado actual (CADUCADO, CRÍTICO, PREVENTIVO)
   * @param {number} datos.diasRestantes - Días restantes (si aplica)
   * @returns {Promise<Object>} Resultado del envío
   */
  async enviarAlertaCaducidad(datos) {
    const { email, especie, lote, estado, diasRestantes = 0 } = datos

    if (!email) {
      return {
        success: false,
        error: 'Email no proporcionado'
      }
    }

    let asunto = ''
    let textoEstado = ''
    let htmlEstado = ''

    // Configurar mensaje según el estado
    switch (estado) {
      case 'CADUCADO':
        asunto = '🚨 URGENTE: Producto Caducado - Acción Requerida'
        textoEstado = `El producto ha CADUCADO y debe ser removido del inventario inmediatamente.`
        htmlEstado = `<p style="color: #dc2626; font-weight: bold;">⚠️ El producto ha <span style="color: red; text-transform: uppercase;">CADUCADO</span> y debe ser removido del inventario inmediatamente.</p>`
        break
      case 'CRÍTICO':
        asunto = '⏰ CRÍTICO: Producto Próximo a Caducar'
        textoEstado = `El producto está CRÍTICO - solo quedan ${diasRestantes} día${diasRestantes !== 1 ? 's' : ''}.`
        htmlEstado = `<p style="color: #f97316; font-weight: bold;">🔴 El producto está <span style="color: darkorange;">CRÍTICO</span> - solo quedan <strong>${diasRestantes} día${diasRestantes !== 1 ? 's' : ''}</strong>.</p>`
        break
      case 'PREVENTIVO':
        asunto = '📢 Alerta: Producto Próximo a Caducar'
        textoEstado = `El producto está en zona preventiva - quedan ${diasRestantes} días.`
        htmlEstado = `<p style="color: #fbbf24; font-weight: bold;">⚠️ El producto está en zona <span style="color: orange;">preventiva</span> - quedan <strong>${diasRestantes} días</strong>.</p>`
        break
      default:
        return {
          success: false,
          error: 'Estado inválido'
        }
    }

    const textoPlano = `
RÍOS DELIVERY - ALERTA DE FRESCURA

${asunto}

Especie: ${especie}
Lote: ${lote}
Estado: ${estado}
${diasRestantes > 0 ? `Días Restantes: ${diasRestantes}` : ''}

${textoEstado}

Por favor, toma acción inmediata para gestionar este producto.

---
Este es un mensaje automático del sistema de Ríos Delivery.
    `.trim()

    const htmlMessage = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 8px; overflow: hidden; }
    .header { background: linear-gradient(135deg, #134956 0%, #2a8a9f 100%); color: white; padding: 20px; text-align: center; }
    .header h1 { margin: 0; font-size: 24px; }
    .content { padding: 30px; }
    .alert-box { background: #f9fafb; border-left: 4px solid #dc2626; padding: 16px; border-radius: 6px; margin: 20px 0; }
    .details { background: #f3f4f6; padding: 16px; border-radius: 6px; margin: 20px 0; }
    .detail-item { margin: 10px 0; }
    .detail-label { font-weight: bold; color: #666; margin-right: 8px; }
    .detail-value { color: #333; }
    .action-note { background: #fff3cd; border: 1px solid #ffc107; color: #856404; padding: 12px; border-radius: 6px; margin: 20px 0; }
    .footer { background: #f9fafb; padding: 16px; text-align: center; font-size: 12px; color: #666; border-top: 1px solid #eee; }
    .footer p { margin: 5px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🐟 Ríos Delivery</h1>
      <p>Sistema de Alertas de Frescura</p>
    </div>
    <div class="content">
      <h2 style="color: #134956; margin-top: 0;">${asunto}</h2>
      
      <div class="alert-box">
        ${htmlEstado}
      </div>

      <div class="details">
        <div class="detail-item">
          <span class="detail-label">Especie:</span>
          <span class="detail-value">${especie}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Lote:</span>
          <span class="detail-value">${lote}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Estado:</span>
          <span class="detail-value" style="font-weight: bold;">${estado}</span>
        </div>
        ${diasRestantes > 0 ? `
        <div class="detail-item">
          <span class="detail-label">Días Restantes:</span>
          <span class="detail-value">${diasRestantes}</span>
        </div>
        ` : ''}
      </div>

      <div class="action-note">
        <strong>⚠️ Acción Requerida:</strong> Por favor, revisa tu inventario en Ríos Delivery y toma las medidas necesarias.
      </div>

      <p style="text-align: center; margin-top: 30px;">
        <a href="${process.env.CLIENT_ORIGIN || 'http://localhost:5173'}/inventario" 
           style="background: #134956; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; display: inline-block;">
          Ver Inventario
        </a>
      </p>
    </div>
    <div class="footer">
      <p>Este es un mensaje automático del sistema de Ríos Delivery.</p>
      <p>Enviado el ${new Date().toLocaleString('es-ES')}</p>
    </div>
  </div>
</body>
</html>
    `.trim()

    try {
      const info = await this.transporter.sendMail({
        from: `${this.senderName} <${this.senderEmail}>`,
        to: email,
        subject: asunto,
        text: textoPlano,
        html: htmlMessage
      })

      console.log(`✓ Email enviado a ${email}:`, info.messageId)
      return {
        success: true,
        messageId: info.messageId,
        email,
        timestamp: new Date().toISOString()
      }
    } catch (error) {
      console.error(`✗ Error enviando email a ${email}:`, error.message)
      return {
        success: false,
        error: error.message,
        email
      }
    }
  }

  /**
   * Enviar notificación consolidada diaria de lotes sin priorizar en peligro
   * @param {Object} datos
   * @param {string} datos.email - Correo del destinatario
   * @param {Array} datos.lotes - Lista de lotes [{especie, lote, estado, diasRestantes, peso}]
   * @param {string} datos.fecha - Fecha del reporte (YYYY-MM-DD)
   * @returns {Promise<Object>}
   */
  async enviarAlertaConsolidada(datos) {
    const { email, lotes = [], fecha } = datos

    if (!email) {
      return {
        success: false,
        error: 'Email no proporcionado'
      }
    }

    if (!lotes || lotes.length === 0) {
      return {
        success: false,
        error: 'No hay lotes para reportar'
      }
    }

    // Separar por estado
    const caducados = lotes.filter(l => l.estado === 'CADUCADO')
    const criticos = lotes.filter(l => l.estado === 'CRÍTICO')

    const fechaFormato = new Date(fecha).toLocaleDateString('es-ES', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })

    // Generar tabla HTML
    let tableLotes = ''
    lotes.forEach(lote => {
      const colorEstado = lote.estado === 'CADUCADO' ? '#dc2626' : '#f97316'
      const iconoEstado = lote.estado === 'CADUCADO' ? '⚠️' : '🔴'
      tableLotes += `
        <tr>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${lote.especie}</td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${lote.lote}</td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; color: ${colorEstado}; font-weight: bold;">
            ${iconoEstado} ${lote.estado}
          </td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">
            ${lote.diasRestantes > 0 ? lote.diasRestantes + ' días' : '0 días'}
          </td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">
            ${lote.peso ? lote.peso.toFixed(2) + ' kg' : 'N/A'}
          </td>
        </tr>
      `
    })

    const textoPlano = `
RÍOS DELIVERY - REPORTE DIARIO DE ALERTAS DE FRESCURA
Fecha: ${fechaFormato}

RESUMEN:
- Productos CADUCADOS: ${caducados.length}
- Productos CRÍTICOS: ${criticos.length}
- Total de alertas: ${lotes.length}

DETALLES:
${lotes.map(l => `
${l.especie} (Lote ${l.lote})
  Estado: ${l.estado}
  Días restantes: ${l.diasRestantes}
  Peso: ${l.peso} kg
`).join('\n')}

Por favor, revisa estos lotes urgentemente y toma las acciones necesarias.

---
Este es un mensaje automático del sistema de Ríos Delivery.
    `.trim()

    const htmlMessage = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 800px; margin: 0 auto; border: 1px solid #eee; border-radius: 8px; overflow: hidden; }
    .header { background: linear-gradient(135deg, #134956 0%, #2a8a9f 100%); color: white; padding: 24px; text-align: center; }
    .header h1 { margin: 0 0 6px 0; font-size: 28px; }
    .header p { margin: 0; opacity: 0.9; }
    .content { padding: 24px; }
    .summary-box {
      background: #f9fafb;
      border: 2px solid #134956;
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 24px;
    }
    .summary-item { display: inline-block; margin-right: 20px; margin-bottom: 8px; }
    .summary-item strong { color: #134956; }
    .summary-item.danger strong { color: #dc2626; }
    .summary-item.warning strong { color: #f97316; }
    .table-section { margin-bottom: 24px; }
    .table-section h2 { color: #134956; font-size: 18px; margin-top: 0; margin-bottom: 12px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
    table thead { background: #f3f4f6; }
    table th { 
      padding: 12px; 
      text-align: left; 
      font-weight: 600;
      color: #134956;
      border-bottom: 2px solid #e5e7eb;
    }
    table td { font-size: 14px; }
    .alert-box { background: #fef2f2; border-left: 4px solid #dc2626; padding: 16px; border-radius: 6px; margin-bottom: 20px; }
    .alert-box strong { color: #991b1b; }
    .action-box { background: #dbeafe; border: 1px solid #3b82f6; color: #1e40af; padding: 16px; border-radius: 6px; margin: 20px 0; }
    .footer { background: #f9fafb; padding: 16px; text-align: center; font-size: 12px; color: #666; border-top: 1px solid #eee; }
    .footer p { margin: 4px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🐟 Ríos Delivery</h1>
      <p>Reporte Diario de Alertas de Frescura</p>
    </div>
    <div class="content">
      <p style="font-size: 16px; margin-top: 0;">
        Reporte generado: <strong>${fechaFormato}</strong>
      </p>

      <div class="alert-box">
        <strong>⚠️ ATENCIÓN:</strong> Se han detectado ${lotes.length} lote(s) sin priorizar en estado de alerta. Se requiere acción inmediata.
      </div>

      <div class="summary-box">
        <div class="summary-item danger">
          <strong>🚨 Caducados:</strong> ${caducados.length}
        </div>
        <div class="summary-item warning">
          <strong>⏰ Críticos:</strong> ${criticos.length}
        </div>
        <div class="summary-item">
          <strong>📊 Total:</strong> ${lotes.length}
        </div>
      </div>

      <div class="table-section">
        <h2>Lotes Sin Priorizar en Peligro</h2>
        <table>
          <thead>
            <tr>
              <th>Especie</th>
              <th>Lote</th>
              <th>Estado</th>
              <th style="text-align: center;">Días</th>
              <th style="text-align: right;">Peso</th>
            </tr>
          </thead>
          <tbody>
            ${tableLotes}
          </tbody>
        </table>
      </div>

      <div class="action-box">
        <strong>📋 Acciones Recomendadas:</strong>
        <ul style="margin: 8px 0; padding-left: 20px;">
          <li>Revisar el inventario en Ríos Delivery inmediatamente</li>
          <li>Separar productos CADUCADOS para eliminación</li>
          <li>Ajustar precios o acelerar venta de productos CRÍTICOS</li>
          <li>Marcar lotes como priorizados una vez atendidos</li>
        </ul>
      </div>

      <p style="text-align: center; margin-top: 24px; margin-bottom: 24px;">
        <a href="${process.env.CLIENT_ORIGIN || 'http://localhost:5173'}/inventario" 
           style="background: #134956; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
          Ver Inventario Completo
        </a>
      </p>
    </div>
    <div class="footer">
      <p>Este es un mensaje automático enviado una vez al día.</p>
      <p>Ríos Delivery - Sistema de Alertas de Frescura</p>
      <p>Enviado: ${new Date().toLocaleString('es-ES')}</p>
    </div>
  </div>
</body>
</html>
    `.trim()

    try {
      const info = await this.transporter.sendMail({
        from: `${this.senderName} <${this.senderEmail}>`,
        to: email,
        subject: `🚨 Alerta Diaria: ${lotes.length} Lote(s) Sin Priorizar en Peligro - ${fechaFormato}`,
        text: textoPlano,
        html: htmlMessage
      })

      console.log(`✓ Email consolidado enviado a ${email}:`, info.messageId)
      return {
        success: true,
        messageId: info.messageId,
        email,
        lotesReportados: lotes.length,
        timestamp: new Date().toISOString()
      }
    } catch (error) {
      console.error(`✗ Error enviando email consolidado a ${email}:`, error.message)
      return {
        success: false,
        error: error.message,
        email
      }
    }
  }
  async enviarAlerta(email, titulo, mensaje) {
    if (!email) {
      return {
        success: false,
        error: 'Email no proporcionado'
      }
    }

    const htmlMessage = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 8px; overflow: hidden; }
    .header { background: linear-gradient(135deg, #134956 0%, #2a8a9f 100%); color: white; padding: 20px; text-align: center; }
    .content { padding: 30px; }
    .footer { background: #f9fafb; padding: 16px; text-align: center; font-size: 12px; color: #666; border-top: 1px solid #eee; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🐟 Ríos Delivery</h1>
    </div>
    <div class="content">
      <h2 style="color: #134956;">${titulo}</h2>
      <p>${mensaje}</p>
    </div>
    <div class="footer">
      <p>Ríos Delivery - Sistema de Alertas</p>
    </div>
  </div>
</body>
</html>
    `.trim()

    try {
      const info = await this.transporter.sendMail({
        from: `${this.senderName} <${this.senderEmail}>`,
        to: email,
        subject: titulo,
        html: htmlMessage
      })

      return {
        success: true,
        messageId: info.messageId
      }
    } catch (error) {
      console.error('Error enviando alerta:', error.message)
      return {
        success: false,
        error: error.message
      }
    }
  }
}

export default new EmailService()
