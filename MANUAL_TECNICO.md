# Manual Técnico - Gestor IPS Backend

## Información General

**Proyecto:** Gestor IPS - Backend API
**Servidor:** AWS EC2 Linux (IP: 3.16.114.54)
**Dominio:** https://redcemed.com
**Puerto Backend:** 3000
**Base de Datos:** MongoDB (localhost:27017/GestorIps)
**Gestor de Procesos:** PM2 (Cluster mode, 2 instancias)
**Servidor Web:** Nginx con SSL (Let's Encrypt)

---

## Tabla de Contenido

1. [Arquitectura del Sistema](#arquitectura-del-sistema)
2. [Nuevos Servicios Implementados](#nuevos-servicios-implementados)
3. [Configuración de CORS](#configuración-de-cors)
4. [Modelos de Base de Datos](#modelos-de-base-de-datos)
5. [Despliegue y Gestión con PM2](#despliegue-y-gestión-con-pm2)
6. [Configuración de Nginx](#configuración-de-nginx)
7. [Pruebas con Postman](#pruebas-con-postman)

---

## Arquitectura del Sistema

### Stack Tecnológico
- **Runtime:** Node.js
- **Framework:** Express.js
- **Base de Datos:** MongoDB con Mongoose
- **Autenticación:** JWT (jsonwebtoken)
- **Encriptación:** bcrypt
- **Upload de Archivos:** multer
- **Variables de Entorno:** dotenv

### Estructura de Directorios
```
App Gestor/
├── services/
│   ├── user/
│   │   └── userRoutes.js          # Rutas de usuarios
│   ├── hojaVida/
│   │   └── hojaVidaRoutes.js      # Rutas de hojas de vida
│   ├── server/
│   │   └── models/
│   │       ├── user/user.js        # Modelo Usuario
│   │       ├── hojaVida/hojaVida.js # Modelo Hoja de Vida
│   │       └── permiso/permiso.js   # Modelo Permiso
│   └── webServices/
│       └── class/
│           └── webServerClass.js   # Configuración servidor Express
└── storage/                        # Almacenamiento de PDFs
    ├── biometria/
    ├── psicologia/
    └── notificaciones/
```

---

## Nuevos Servicios Implementados

### 1. Servicios de Usuarios

#### 1.1 Consultar Todos los Usuarios

**Endpoint:** `GET /api/users/consultar`

**Headers:**
```
Authorization: Bearer <JWT_TOKEN>
```

**Descripción:**
- Obtiene todos los usuarios registrados con sus relaciones (Permiso e IPS)
- Ordenados por fecha de creación (más recientes primero)
- Requiere autenticación JWT

**Respuesta Exitosa (200):**
```json
{
  "error": 0,
  "response": {
    "mensaje": "Se encontraron 25 usuarios registrados",
    "total": 25,
    "usuarios": [
      {
        "_id": "507f1f77bcf86cd799439011",
        "Cr_Nombre_Usuario": "admin@redcem.com",
        "Cr_Perfil": "Administrador",
        "Cr_Empresa": "REDCEM",
        "Cr_Estado": "Activo",
        "Cr_Pe_Codigo": {
          "_id": "507f191e810c19729de860ea",
          "Pe_Nombre": "Juan",
          "Pe_Apellido": "Pérez",
          "Pe_Correo": "juan@redcem.com",
          "Pe_Num_Doc": "1234567890"
        },
        "Cr_Ips": {
          "_id": "507f191e810c19729de860eb",
          "NOMBRE_IPS": "IPS Salud Total"
        }
      }
    ]
  }
}
```

**Archivo:** `App Gestor/services/user/userRoutes.js` (líneas 138-178)

---

#### 1.2 Actualizar Usuario

**Endpoint:** `POST /api/users/actualizar`

**Headers:**
```
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

**Body:**
```json
{
  "id": "507f1f77bcf86cd799439011",
  "persona": {
    "Pe_Nombre": "Juan",
    "Pe_Apellido": "Pérez",
    "Pe_Seg_Apellido": "González",
    "Pe_Tip_Doc": "CC",
    "Pe_Num_Doc": "1234567890",
    "Pe_Correo": "juan.perez@example.com",
    "Pe_Cel": "3001234567",
    "Pe_Direccion": "Calle 123 #45-67",
    "Pe_Fecha_Nac": "1990-01-15"
  },
  "credenciales": {
    "Cr_Nombre_Usuario": "jperez",
    "Cr_Password": "nuevaPassword123",
    "Cr_Perfil": "Administrador",
    "Cr_Empresa": "REDCEM",
    "Cr_Estado": "Activo",
    "Cr_Ips": "507f191e810c19729de860eb"
  }
}
```

**Descripción:**
- Actualiza parcialmente un usuario existente (no reemplaza)
- Solo actualiza los campos enviados en el body
- Valida unicidad de username, correo y documento
- Hash automático de password con bcrypt (10 rounds)
- Actualiza tanto credenciales (cl_credencial) como datos personales (cl_permisos)

**Validaciones:**
- Username único (excepto el usuario actual)
- Correo único (excepto el usuario actual)
- Documento único (excepto el usuario actual)
- ID de usuario obligatorio

**Respuesta Exitosa (200):**
```json
{
  "error": 0,
  "response": {
    "mensaje": "Usuario actualizado exitosamente",
    "usuario": {
      "_id": "507f1f77bcf86cd799439011",
      "Cr_Nombre_Usuario": "jperez",
      "Cr_Pe_Codigo": { ... },
      "Cr_Ips": { ... }
    }
  }
}
```

**Errores Posibles:**
- `400`: Falta ID o datos duplicados
- `401`: Token inválido o faltante
- `404`: Usuario no encontrado
- `500`: Error interno del servidor

**Archivo:** `App Gestor/services/user/userRoutes.js` (líneas 181-335)

---

### 2. Servicios de Psicología (Hojas de Vida)

#### 2.1 Subir PDF de Psicología

**Endpoint:** `PUT /api/hojas-vida/upload_psicologia/`

**Headers:**
```
Authorization: Bearer <JWT_TOKEN>
```

**Body (form-data):**
```
id_aspirante: 69d92650dafba38263f9aee0
id_usuario: 507f1f77bcf86cd799439011
pdf: [archivo.pdf]
```

**Descripción:**
- Sube un PDF de evaluación psicológica para un aspirante
- Almacena en `storage/psicologia/`
- Reemplaza PDF anterior si existe (elimina archivo físico antiguo)
- Genera nombre único: `{id_aspirante}_{timestamp}.pdf`
- Límite de tamaño: 40MB
- Solo acepta archivos PDF

**Validaciones:**
- Token JWT válido
- Aspirante debe existir en base de datos
- Archivo PDF obligatorio
- MIME type: `application/pdf`

**Respuesta Exitosa (200):**
```json
{
  "error": 0,
  "response": {
    "mensaje": "PDF de psicología cargado exitosamente",
    "id_aspirante": "69d92650dafba38263f9aee0",
    "psicologia": {
      "ruta": "psicologia/69d92650dafba38263f9aee0_1776315518713.pdf",
      "id_usuario": "507f1f77bcf86cd799439011",
      "fecha": "2026-04-16T12:30:45.123Z"
    }
  }
}
```

**Archivo:** `App Gestor/services/hojaVida/hojaVidaRoutes.js` (líneas 1673-1760)

---

#### 2.2 Descargar PDF de Psicología

**Endpoint:** `GET /api/hojas-vida/psicologia/descargar/:aspiranteId`

**Headers:**
```
Authorization: Bearer <JWT_TOKEN>
```

**Parámetros URL:**
- `aspiranteId`: ID del documento en cl_hoja_vida

**Descripción:**
- Descarga el PDF de psicología del aspirante
- Verifica existencia del archivo en servidor
- Nombre de descarga: `psicologia_{aspiranteId}.pdf`

**Respuesta Exitosa:**
- Content-Type: `application/pdf`
- Content-Disposition: `attachment; filename="psicologia_{id}.pdf"`

**Errores Posibles:**
- `401`: Token inválido
- `404`: Aspirante no encontrado o no tiene PDF cargado
- `404`: Archivo no existe físicamente en servidor

**Ejemplo de Uso:**
```
GET https://redcemed.com/api/hojas-vida/psicologia/descargar/69d92650dafba38263f9aee0
```

**Archivo:** `App Gestor/services/hojaVida/hojaVidaRoutes.js` (líneas 1762-1827)

---

## Configuración de CORS

### Orígenes Permitidos

**Archivo:** `App Gestor/services/webServices/class/webServerClass.js` (líneas 24-33)

```javascript
const corsOptions = {
    origin: [
        'http://localhost:4200',           // Desarrollo local
        'http://3.142.186.227:4200',       // Servidor desarrollo
        'https://redcemed.com',            // Producción HTTPS
        'http://redcemed.com'              // Producción HTTP
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    optionsSuccessStatus: 200
};
```

### Métodos HTTP Permitidos
- GET
- POST
- PUT
- DELETE
- OPTIONS (preflight requests)

### Headers Permitidos
- `Content-Type`: Para envío de JSON
- `Authorization`: Para tokens JWT Bearer

---

## Modelos de Base de Datos

### Modelo: cl_credencial (User)

**Archivo:** `App Gestor/services/server/models/user/user.js`

```javascript
{
  Cr_Nombre_Usuario: String,              // Username único
  Cr_Password: String,                     // Password hasheado (bcrypt)
  Cr_Perfil: String,                       // Rol del usuario
  Cr_Empresa: String,                      // Empresa asociada
  Cr_Estado: String,                       // Estado: Activo/Inactivo
  Cr_Pe_Codigo: ObjectId,                  // Ref -> cl_permisos
  Cr_Ips: ObjectId,                        // Ref -> cl_ips
  timestamps: true                         // createdAt, updatedAt
}
```

---

### Modelo: cl_hoja_vida (HojaVida)

**Archivo:** `App Gestor/services/server/models/hojaVida/hojaVida.js` (líneas 54-58)

**Campos Nuevos Agregados:**

```javascript
{
  // ... campos existentes ...

  RUTA_BIOMETRIA: {
    ruta: String,                          // Ruta relativa del PDF
    id_usuario: ObjectId,                  // Usuario que subió (Ref -> User)
    fecha: Date                            // Fecha de carga
  },

  RUTA_PSICOLOGIA: {                       // NUEVO
    ruta: String,                          // Ruta relativa del PDF
    id_usuario: ObjectId,                  // Usuario que subió (Ref -> User)
    fecha: Date                            // Fecha de carga
  },

  timestamps: true                         // createdAt, updatedAt
}
```

**Colección:** `cl_hoja_vida`

---

### Modelo: cl_permisos (Permiso)

```javascript
{
  Pe_Nombre: String,                       // Nombre
  Pe_Apellido: String,                     // Primer apellido
  Pe_Seg_Apellido: String,                 // Segundo apellido
  Pe_Tip_Doc: String,                      // Tipo documento (CC, TI, etc)
  Pe_Num_Doc: String,                      // Número documento único
  Pe_Correo: String,                       // Correo único
  Pe_Cel: String,                          // Celular
  Pe_Direccion: String,                    // Dirección
  Pe_Fecha_Nac: String,                    // Fecha de nacimiento
  timestamps: true
}
```

---

## Despliegue y Gestión con PM2

### Configuración Actual

**Ubicación del Proyecto:**
```
/home/ubuntu/Produccion-Redcem-back/App Gestor/
```

**Archivo Principal:**
```
app.js
```

**Instancias PM2:**
```bash
pm2 list
```

```
┌────┬────────────────────┬──────────┬──────┬───────────┬──────────┬──────────┐
│ id │ name               │ mode     │ ↺    │ status    │ cpu      │ memory   │
├────┼────────────────────┼──────────┼──────┼───────────┼──────────┼──────────┤
│ 1  │ gestor-ips-api     │ cluster  │ 0    │ online    │ 0%       │ 78.4mb   │
│ 2  │ gestor-ips-api     │ cluster  │ 0    │ online    │ 0%       │ 78.3mb   │
│ 0  │ redcem-bot         │ fork     │ 0    │ online    │ 0%       │ 100.6mb  │
└────┴────────────────────┴──────────┴──────┴───────────┴──────────┴──────────┘
```

---

### Comandos de Despliegue

#### 1. Hacer Pull de Cambios

```bash
cd /home/ubuntu/Produccion-Redcem-back/App\ Gestor/
git pull origin master
```

#### 2. Instalar Dependencias (si hay cambios en package.json)

```bash
npm install
```

#### 3. Reiniciar PM2

**Opción 1: Reinicio con downtime mínimo**
```bash
pm2 restart gestor-ips-api
```

**Opción 2: Recarga sin downtime (recomendado para cluster mode)**
```bash
pm2 reload gestor-ips-api
```

**Opción 3: Reiniciar todo**
```bash
pm2 restart all
```

#### 4. Verificar Estado

```bash
# Ver estado de procesos
pm2 ls

# Ver logs en tiempo real
pm2 logs gestor-ips-api

# Ver logs con límite
pm2 logs gestor-ips-api --lines 50

# Ver solo errores
pm2 logs gestor-ips-api --err
```

#### 5. Guardar Configuración PM2

```bash
# Guardar configuración actual
pm2 save

# Ver configuración guardada
pm2 startup
```

---

### Comandos de Diagnóstico

```bash
# Ver uso de recursos
pm2 monit

# Ver información detallada de un proceso
pm2 show gestor-ips-api

# Ver métricas
pm2 describe 1

# Limpiar logs
pm2 flush
```

---

### Solución de Problemas Comunes

#### Proceso en estado "errored"

```bash
# Ver error específico
pm2 logs gestor-ips-api --err --lines 100

# Detener proceso
pm2 stop gestor-ips-api

# Eliminar proceso
pm2 delete gestor-ips-api

# Reiniciar desde cero
cd /home/ubuntu/Produccion-Redcem-back/App\ Gestor/
pm2 start app.js --name gestor-ips-api -i 2

# Guardar nueva configuración
pm2 save
```

#### Puerto 3000 ocupado

```bash
# Ver qué está usando el puerto
ss -tulpn | grep 3000

# Matar proceso específico
pm2 delete gestor-ips-api
pm2 start app.js --name gestor-ips-api -i 2
```

#### Muchos reinicios automáticos

```bash
# Ver logs para identificar el error
pm2 logs gestor-ips-api --lines 100

# Verificar variables de entorno
cat .env

# Verificar conexión a MongoDB
mongosh
```

---

## Configuración de Nginx

### Archivo de Configuración

**Ubicación:** `/etc/nginx/sites-available/gestor-ips`

**Enlace Simbólico:** `/etc/nginx/sites-enabled/gestor-ips`

```nginx
# Servidor HTTPS con SSL (Producción)
server {
    server_name redcemed.com www.redcemed.com;
    client_max_body_size 300M;
    root /var/www/gestor-ips;
    index index.html;
    access_log /var/log/nginx/gestor-ips-access.log;
    error_log /var/log/nginx/gestor-ips-error.log;

    # Servir frontend Angular
    location / {
        try_files $uri $uri/ /index.html =404;
    }

    # Proxy al backend Node.js (puerto 3000)
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Proxy al bot WhatsApp (puerto 3011)
    location /bot/ {
        proxy_pass http://127.0.0.1:3011/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Denegar acceso a archivos ocultos
    location ~ /\. {
        deny all;
    }

    # Configuración SSL
    listen 443 ssl;
    ssl_certificate /etc/letsencrypt/live/redcemed.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/redcemed.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
}

# Redirección HTTP -> HTTPS
server {
    if ($host = www.redcemed.com) {
        return 301 https://$host$request_uri;
    }
    if ($host = redcemed.com) {
        return 301 https://$host$request_uri;
    }
    listen 80;
    server_name redcemed.com www.redcemed.com;
    return 404;
}

# Acceso directo por IP (desarrollo/debug)
server {
    listen 80;
    server_name 3.16.114.54;
    location /api/ {
        proxy_pass http://127.0.0.1:3000/;
        proxy_http_version 1.1;
        proxy_set_header Host redcemed.com;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

---

### Comandos de Nginx

#### Verificar Configuración

```bash
# Probar sintaxis
sudo nginx -t

# Ver configuración activa
sudo nginx -T
```

#### Recargar/Reiniciar

```bash
# Recargar configuración (sin downtime)
sudo systemctl reload nginx

# Reiniciar servicio
sudo systemctl restart nginx

# Ver estado
sudo systemctl status nginx
```

#### Ver Logs

```bash
# Logs de acceso
sudo tail -f /var/log/nginx/gestor-ips-access.log

# Logs de errores
sudo tail -f /var/log/nginx/gestor-ips-error.log

# Logs generales de Nginx
sudo tail -f /var/log/nginx/error.log
```

---

### Renovación de Certificado SSL

```bash
# Ver certificados actuales
sudo certbot certificates

# Renovar certificados (automático si < 30 días para expirar)
sudo certbot renew

# Renovar forzosamente
sudo certbot renew --force-renewal

# Renovar y recargar Nginx
sudo certbot renew --deploy-hook "systemctl reload nginx"
```

**Certificado Actual:**
- Dominio: `redcemed.com`, `www.redcemed.com`
- Expira: 2026-06-29
- Tipo: Let's Encrypt (ECDSA)

---

## Pruebas con Postman

### Configuración General

**Base URL:** `https://redcemed.com/api`

**Variables de Entorno Sugeridas:**
```
base_url: https://redcemed.com/api
token: <JWT_TOKEN_AQUI>
```

---

### 1. Obtener Token de Autenticación

**Request:**
```
POST https://redcemed.com/api/auth/login
Content-Type: application/json

{
  "username": "admin@redcem.com",
  "password": "tu_password"
}
```

**Response:**
```json
{
  "error": 0,
  "response": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "usuario": { ... }
  }
}
```

**Guardar token para siguientes requests:**
- Copiar el valor de `response.token`
- En Headers agregar: `Authorization: Bearer <token>`

---

### 2. Consultar Todos los Usuarios

**Request:**
```
GET https://redcemed.com/api/users/consultar
Authorization: Bearer {{token}}
```

---

### 3. Actualizar Usuario

**Request:**
```
POST https://redcemed.com/api/users/actualizar
Authorization: Bearer {{token}}
Content-Type: application/json

{
  "id": "69c9e977b45b6d7e0f0f7d94",
  "persona": {
    "Pe_Nombre": "Alejo",
    "Pe_Apellido": "Gonzalez",
    "Pe_Correo": "psicologo@redcem.com"
  },
  "credenciales": {
    "Cr_Estado": "Activo"
  }
}
```

**Nota:** Solo se actualizan los campos enviados.

---

### 4. Subir PDF de Psicología

**Request:**
```
PUT https://redcemed.com/api/hojas-vida/upload_psicologia/
Authorization: Bearer {{token}}
Content-Type: multipart/form-data

Body (form-data):
- id_aspirante: 69d92650dafba38263f9aee0
- id_usuario: 507f1f77bcf86cd799439011
- pdf: [seleccionar archivo .pdf]
```

**Configuración en Postman:**
1. Seleccionar método PUT
2. En Body > form-data
3. Agregar keys: `id_aspirante`, `id_usuario`, `pdf`
4. Para `pdf`: cambiar tipo a "File" y seleccionar archivo

---

### 5. Descargar PDF de Psicología

**Request:**
```
GET https://redcemed.com/api/hojas-vida/psicologia/descargar/69d92650dafba38263f9aee0
Authorization: Bearer {{token}}
```

**Nota:** El archivo se descargará automáticamente.

---

### 6. Cargue Masivo de Hojas de Vida

**Request:**
```
POST https://redcemed.com/api/hojas-vida/crear
Authorization: Bearer {{token}}
Content-Type: application/json

[
  {
    "DOCUMENTO": "1234567890",
    "NOMBRE": "Juan",
    "PRIMER_APELLIDO": "Pérez",
    "CORREO": "juan@example.com",
    "CELULAR": "3001234567"
  },
  {
    "DOCUMENTO": "0987654321",
    "NOMBRE": "María",
    "PRIMER_APELLIDO": "García",
    "CORREO": "maria@example.com",
    "CELULAR": "3009876543"
  }
]
```

---

## Estructura de Respuestas

### Respuesta Exitosa

```json
{
  "error": 0,
  "response": {
    "mensaje": "Operación exitosa",
    "data": { ... }
  }
}
```

### Respuesta con Error

```json
{
  "error": 1,
  "response": {
    "mensaje": "Descripción del error"
  }
}
```

---

## Códigos de Estado HTTP

| Código | Significado | Uso |
|--------|-------------|-----|
| 200 | OK | Operación exitosa |
| 201 | Created | Recurso creado exitosamente |
| 400 | Bad Request | Parámetros faltantes o inválidos |
| 401 | Unauthorized | Token faltante o inválido |
| 404 | Not Found | Recurso no encontrado |
| 409 | Conflict | Conflicto (ej: documento duplicado) |
| 500 | Internal Server Error | Error del servidor |

---

## Variables de Entorno

**Archivo:** `.env` (en raíz del proyecto)

```env
JWT_SECRET=tu_secret_key_aqui
MONGODB_URI=mongodb://localhost:27017/GestorIps
PORT=3000
NODE_ENV=production
```

**Nota:** Este archivo NO se sube a Git por seguridad.

---

## Seguridad

### Autenticación JWT

- Todos los endpoints protegidos requieren token JWT
- Token se envía en header: `Authorization: Bearer <token>`
- Tokens generados en `/api/auth/login`
- Secret almacenado en variable de entorno `JWT_SECRET`

### Encriptación de Passwords

- Algoritmo: bcrypt
- Rounds: 10
- Nunca se almacenan passwords en texto plano

### Validaciones de Datos

- Username único
- Correo único
- Documento único
- Validación de tipos MIME en uploads

### Límites de Seguridad

- Tamaño máximo de archivo: 40MB
- Tipos de archivo permitidos: PDF únicamente
- CORS restrictivo (solo orígenes permitidos)

---

## Logs y Monitoreo

### Logs de PM2

```bash
# Ver todos los logs
pm2 logs

# Logs de un proceso específico
pm2 logs gestor-ips-api

# Solo errores
pm2 logs gestor-ips-api --err

# Limpiar logs antiguos
pm2 flush
```

### Logs de Nginx

```bash
# Access logs
sudo tail -f /var/log/nginx/gestor-ips-access.log

# Error logs
sudo tail -f /var/log/nginx/gestor-ips-error.log
```

### Monitoreo de Sistema

```bash
# Monitoreo en tiempo real con PM2
pm2 monit

# Uso de recursos
pm2 list

# Información detallada
pm2 show gestor-ips-api
```

---

## Mantenimiento

### Backup de Base de Datos

```bash
# Exportar colección específica
mongodump --db GestorIps --collection cl_hoja_vida --out /backup/

# Exportar toda la base de datos
mongodump --db GestorIps --out /backup/

# Restaurar
mongorestore /backup/GestorIps/
```

### Limpieza de Archivos Temporales

```bash
# Limpiar logs de PM2
pm2 flush

# Limpiar logs de Nginx (rotar)
sudo logrotate -f /etc/logrotate.d/nginx
```

---

## Historial de Cambios

### Versión 1.1 - 2026-04-16

**Nuevos Servicios:**
- GET `/api/users/consultar` - Consultar todos los usuarios
- POST `/api/users/actualizar` - Actualizar usuario específico
- PUT `/api/hojas-vida/upload_psicologia/` - Subir PDF de psicología
- GET `/api/hojas-vida/psicologia/descargar/:id` - Descargar PDF de psicología

**Modelos Actualizados:**
- `cl_hoja_vida`: Agregado campo `RUTA_PSICOLOGIA`

**Configuración:**
- CORS actualizado con dominios de producción
- Nginx configurado con SSL Let's Encrypt

---

*Manual Técnico Generado: 2026-04-16*
