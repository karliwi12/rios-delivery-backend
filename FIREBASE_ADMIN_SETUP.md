# Firebase Admin SDK Setup Guide

## 🔐 Actualización de Seguridad: Firebase Admin SDK

El backend ahora usa **Firebase Admin SDK** en lugar del SDK estándar. Esto proporciona:
- ✅ Autenticación segura con service accounts
- ✅ Manejo seguro de secretos
- ✅ Mejor control de permisos
- ✅ Operaciones administrativas

## 📋 Pasos de Configuración

### Paso 1: Obtener Service Account Key

1. Ve a [Firebase Console](https://console.firebase.google.com/)
2. Selecciona tu proyecto `rios-delivery`
3. Click en ⚙️ **Ajustes** (esquina superior izquierda)
4. Pestaña **Cuentas de Servicio**
5. Click en **Generar Nueva Clave Privada**
6. Se descargará un archivo JSON: `rios-delivery-xxxxx.json`

### Paso 2: Coloca el Archivo en el Proyecto

Copia el archivo JSON descargado a tu carpeta backend:

```bash
cp ~/Downloads/rios-delivery-xxxxx.json ./backend/serviceAccountKey.json
```

### Paso 3: Verifica .env

El archivo `.env` ya tiene la configuración necesaria:

```env
FIREBASE_PROJECT_ID=rios-delivery
FIREBASE_SERVICE_ACCOUNT_PATH=./serviceAccountKey.json
```

### Paso 4: Agrega a .gitignore

**IMPORTANTE**: Nunca commits el `serviceAccountKey.json`:

```bash
echo "serviceAccountKey.json" >> .gitignore
```

## 🚀 Uso

```bash
cd backend
npm run dev
```

El servidor mostrará:
```
✓ Firebase Admin SDK inicializado con service account
```

## 🔄 Alternativa: GOOGLE_APPLICATION_CREDENTIALS

Si prefieres usar variable de entorno:

```bash
export GOOGLE_APPLICATION_CREDENTIALS=/ruta/a/serviceAccountKey.json
npm run dev
```

## 📝 Estructura del Service Account Key

El archivo descargado se ve así (NO compartas esto):

```json
{
  "type": "service_account",
  "project_id": "rios-delivery",
  "private_key_id": "xxxxx",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk-xxxx@rios-delivery.iam.gserviceaccount.com",
  "client_id": "xxxxx",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/..."
}
```

## ✅ Verificar que Funciona

```bash
curl http://localhost:3001/api/health
```

Deberías ver:
```json
{
  "status": "ok",
  "services": {
    "firebase": "connected"
  }
}
```

## 🔒 Mejoras de Seguridad

- ✅ SDK Admin en lugar de claves públicas
- ✅ Service account para autenticación de servidor
- ✅ Mejor manejo de errores
- ✅ Logs detallados de inicialización
- ✅ Soporte para múltiples métodos de autenticación

## 📚 Referencias

- [Firebase Admin SDK Docs](https://firebase.google.com/docs/admin/setup)
- [Service Accounts](https://firebase.google.com/docs/auth/admin/create-custom-tokens)
- [Environment Variables](https://firebase.google.com/docs/app-check/custom-resource)

## ⚠️ Troubleshooting

### Error: "serviceAccountKey.json not found"
```
- Verifica que el archivo esté en ./backend/serviceAccountKey.json
- Revisa que el path en .env sea correcto
```

### Error: "PERMISSION_DENIED"
```
- Regenera el service account key
- Verifica los permisos en Firebase Console
- Reinicia el servidor
```

### Error: "Cannot find module 'firebase-admin'"
```bash
cd backend
npm install firebase-admin@latest
```
