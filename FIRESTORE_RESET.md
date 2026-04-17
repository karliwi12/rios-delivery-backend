# Wipe Total de Firestore

Este flujo deja la base de datos Firestore vacía a nivel de datos, incluyendo:

- colecciones principales `inventario`, `ventas`, `clientes`, `alertas`, `usuarios` y `reportes`
- documentos y subcolecciones internas
- documentos faltantes con subcolecciones huérfanas (`showMissing`)
- colecciones raíz adicionales detectadas en tiempo de ejecución, salvo que uses `--only-known`

Importante:

- Este wipe elimina datos, no borra reglas, índices ni usuarios de Firebase Authentication.
- Si quieres eliminar el recurso completo de la base de datos y recrearlo desde cero, usa `gcloud firestore databases delete --database='(default)'` y luego recréala. Eso es más destructivo que vaciar los datos.
- Haz backup antes si existe cualquier posibilidad de necesitar recuperación.

## Requisitos

1. Tener acceso administrativo al proyecto `rios-delivery`.
2. Contar con un `serviceAccountKey.json` o ADC (`GOOGLE_APPLICATION_CREDENTIALS`).
3. Configurar variables en `backend/.env` si no se pasan por CLI:

```env
FIREBASE_PROJECT_ID=rios-delivery
FIRESTORE_DATABASE_ID=(default)
FIREBASE_SERVICE_ACCOUNT_KEY_PATH=./serviceAccountKey.json
```

## Backup recomendado

Firestore recomienda el servicio administrado de exportación/importación con `gcloud`.

Ejemplo:

```bash
gcloud config set project rios-delivery
gcloud firestore export gs://TU_BUCKET/firestore-backup-YYYYMMDD-HHMMSS --database='(default)'
```

## Script Node.js del proyecto

El script está en `backend/scripts/firestore-wipe.mjs`.

### 1. Auditar antes de borrar

```bash
cd backend
npm run firestore:wipe:dry-run
```

También puedes especificar credenciales o base distinta:

```bash
npm run firestore:wipe -- --dry-run --service-account=./serviceAccountKey.json --database='(default)'
```

### 2. Ejecutar el borrado real

```bash
cd backend
npm run firestore:wipe -- --force
```

### 3. Verificación final

```bash
cd backend
npm run firestore:verify-empty
```

Si la verificación es correcta, el script debe reportar que Firestore quedó sin colecciones visibles ni documentos remanentes.

## Alternativa con Firebase CLI

Validado localmente con `firebase 15.14.0`.

### Vaciar toda la base

```bash
firebase firestore:delete --all-collections --database '(default)' --force
```

### Vaciar colecciones puntuales de forma recursiva

```bash
firebase firestore:delete inventario --recursive --database '(default)' --force
firebase firestore:delete ventas --recursive --database '(default)' --force
firebase firestore:delete clientes --recursive --database '(default)' --force
firebase firestore:delete alertas --recursive --database '(default)' --force
firebase firestore:delete usuarios --recursive --database '(default)' --force
firebase firestore:delete reportes --recursive --database '(default)' --force
```

### Ver bases existentes

```bash
firebase firestore:databases:list
firebase firestore:databases:get '(default)'
```

## Limpieza del frontend

Se agregó `frontend/src/utils/resetClientState.js` y un hook global para limpieza post-wipe.

Después de borrar la base, con la aplicación abierta en el navegador, ejecuta:

```js
await window.__RIOS_DELIVERY_RESET_CLIENT_STATE__()
```

Esto:

- termina la instancia de Firestore en el cliente
- intenta limpiar IndexedDB de Firestore
- limpia `localStorage`
- limpia `sessionStorage`
- borra bases IndexedDB conocidas de Firebase Auth/Installations
- reinicia los stores `auth` e `inventario`
- recarga la página

## Auditoría rápida de referencias antiguas

Para revisar referencias persistentes o accesos a IDs antiguos en el código:

```bash
rg -n --glob '!**/node_modules/**' --glob '!**/dist/**' "idLote|loteId|localStorage|sessionStorage|indexedDB|firestore" frontend backend
```

## Notas operativas

- El script prioriza un borrado profundo y seguro, no un borrado manual documento por documento desde la consola.
- Si quedan otras pestañas abiertas usando la app, el borrado del cache de IndexedDB puede quedar bloqueado hasta cerrar esas pestañas.
- Si también quieres eliminar usuarios autenticados de Firebase Auth, eso se maneja aparte; la colección `usuarios` no elimina cuentas de Authentication.
