const express = require('express');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const Escalamiento = require('../server/models/escalamientos/escalamientos');
const User = require('../server/models/user/user');

// Configuración de multer para imágenes
const storage = multer.memoryStorage();
const uploadImagen = multer({
    storage,
    fileFilter: (req, file, cb) => {
        const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png'];
        if (!allowedMimes.includes(file.mimetype)) {
            return cb(new Error('Solo se permiten archivos JPG y PNG'));
        }
        cb(null, true);
    },
    limits: { fileSize: 5 * 1024 * 1024 } // 5 MB máximo
});

const router = express.Router();

/**
 * POST /api/mesa-ayuda/escalar
 * Escala un caso de mesa de ayuda con evidencia opcional
 */
router.post('/escalar', (req, res) => {
    uploadImagen.single('evidencia')(req, res, async (err) => {
        // Manejo de errores de Multer
        if (err) {
            if (err instanceof multer.MulterError) {
                if (err.code === 'LIMIT_FILE_SIZE') {
                    return res.status(400).json({
                        error: 1,
                        response: {
                            mensaje: 'La imagen excede el tamaño máximo permitido de 5 MB',
                            codigo: 'LIMIT_FILE_SIZE'
                        }
                    });
                }
                return res.status(400).json({
                    error: 1,
                    response: {
                        mensaje: `Error al subir archivo: ${err.message}`,
                        codigo: err.code
                    }
                });
            }

            if (err.message === 'Solo se permiten archivos JPG y PNG') {
                return res.status(400).json({
                    error: 1,
                    response: { mensaje: 'Solo se permiten archivos JPG y PNG' }
                });
            }

            return res.status(500).json({
                error: 1,
                response: { mensaje: 'Error al procesar el archivo', detalle: err.message }
            });
        }

        try {
            // Validar token
            const authHeader = req.headers['authorization'];
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                return res.status(401).json({
                    error: 1,
                    response: { mensaje: 'Token requerido' }
                });
            }

            const token = authHeader.substring(7);
            let payload;

            try {
                payload = jwt.verify(token, process.env.JWT_SECRET);
            } catch (e) {
                return res.status(401).json({
                    error: 1,
                    response: { mensaje: 'Token inválido o expirado' }
                });
            }

            // Obtener parámetros del FormData
            const { descripcion, prioridad, usuario_id } = req.body;

            // Validar campos obligatorios
            if (!descripcion || !prioridad || !usuario_id) {
                return res.status(400).json({
                    error: 1,
                    response: { mensaje: 'Los campos descripcion, prioridad y usuario_id son obligatorios' }
                });
            }

            // Validar descripcion
            const descripcionTrim = descripcion.trim();
            if (descripcionTrim.length < 100 || descripcionTrim.length > 5000) {
                return res.status(400).json({
                    error: 1,
                    response: { mensaje: 'La descripción debe tener entre 100 y 5000 caracteres' }
                });
            }

            // Validar prioridad
            const prioridadesValidas = ['ALTO', 'MEDIO', 'BAJO'];
            if (!prioridadesValidas.includes(prioridad)) {
                return res.status(400).json({
                    error: 1,
                    response: { mensaje: 'La prioridad debe ser: ALTO, MEDIO o BAJO' }
                });
            }

            // Validar formato de usuario_id
            if (usuario_id.length !== 24) {
                return res.status(400).json({
                    error: 1,
                    response: { mensaje: 'Formato de usuario_id inválido' }
                });
            }

            // Verificar que el usuario existe
            const usuario = await User.findById(usuario_id);
            if (!usuario) {
                return res.status(404).json({
                    error: 1,
                    response: { mensaje: 'Usuario no encontrado' }
                });
            }

            // Preparar objeto de escalamiento
            const escalamientoData = {
                descripcion: descripcionTrim,
                prioridad,
                usuario_id
            };

            // Guardar imagen si se envió
            if (req.file) {
                console.log('[POST /escalar] 📸 Procesando imagen...');
                console.log('[POST /escalar] - Tamaño:', req.file.size, 'bytes');
                console.log('[POST /escalar] - Tipo:', req.file.mimetype);
                console.log('[POST /escalar] - Nombre original:', req.file.originalname);

                try {
                    const timestamp = Date.now();
                    const extension = req.file.mimetype === 'image/png' ? 'png' : 'jpg';
                    const nombreArchivo = `${usuario_id}_${timestamp}.${extension}`;
                    const rutaRelativa = `escalamientos/${nombreArchivo}`;
                    const rutaAbsoluta = path.join(__dirname, '../../storage', rutaRelativa);

                    console.log('[POST /escalar] 📁 Ruta absoluta:', rutaAbsoluta);

                    // Crear directorio si no existe
                    const dir = path.dirname(rutaAbsoluta);
                    if (!fs.existsSync(dir)) {
                        console.log('[POST /escalar] 📂 Creando directorio:', dir);
                        fs.mkdirSync(dir, { recursive: true });
                        console.log('[POST /escalar] ✅ Directorio creado exitosamente');
                    } else {
                        console.log('[POST /escalar] ✅ Directorio ya existe');
                    }

                    // Guardar archivo
                    console.log('[POST /escalar] 💾 Guardando archivo...');
                    fs.writeFileSync(rutaAbsoluta, req.file.buffer);
                    console.log('[POST /escalar] ✅ Archivo guardado exitosamente');

                    // Verificar que el archivo existe
                    if (fs.existsSync(rutaAbsoluta)) {
                        const stats = fs.statSync(rutaAbsoluta);
                        console.log('[POST /escalar] ✅ Verificación: Archivo existe');
                        console.log('[POST /escalar] - Tamaño en disco:', stats.size, 'bytes');
                    } else {
                        console.error('[POST /escalar] ❌ ERROR: El archivo NO se guardó correctamente');
                        throw new Error('No se pudo verificar el guardado del archivo');
                    }

                    // Agregar información de evidencia
                    escalamientoData.evidencia = {
                        ruta: rutaRelativa,
                        nombre_original: req.file.originalname,
                        fecha_subida: new Date()
                    };

                    console.log('[POST /escalar] ✅ Imagen procesada correctamente');

                } catch (fileError) {
                    console.error('[POST /escalar] ❌ Error al guardar imagen:', fileError);
                    return res.status(500).json({
                        error: 1,
                        response: {
                            mensaje: 'Error al guardar la imagen en el servidor',
                            detalle: fileError.message
                        }
                    });
                }
            } else {
                console.log('[POST /escalar] ℹ️ No se envió imagen de evidencia');
            }

            // Crear el escalamiento
            console.log('[POST /escalar] 💾 Guardando en base de datos...');
            const nuevoEscalamiento = await Escalamiento.create(escalamientoData);
            console.log('[POST /escalar] ✅ Escalamiento creado:', nuevoEscalamiento._id);

            return res.status(201).json({
                error: 0,
                response: {
                    mensaje: 'Caso escalado exitosamente',
                    escalamiento: {
                        id: nuevoEscalamiento._id,
                        descripcion: nuevoEscalamiento.descripcion,
                        prioridad: nuevoEscalamiento.prioridad,
                        estado: nuevoEscalamiento.estado,
                        usuario_id: nuevoEscalamiento.usuario_id,
                        evidencia: nuevoEscalamiento.evidencia.ruta ? {
                            ruta: nuevoEscalamiento.evidencia.ruta,
                            nombre_original: nuevoEscalamiento.evidencia.nombre_original,
                            url: `https://redcemed.com/api/mesa-ayuda/evidencia/${nuevoEscalamiento._id}`
                        } : null,
                        fecha_creacion: nuevoEscalamiento.createdAt
                    }
                }
            });

        } catch (error) {
            console.error('[POST /escalar] ❌ Error general:', error);
            return res.status(500).json({
                error: 1,
                response: {
                    mensaje: 'Error interno del servidor',
                    detalle: error.message
                }
            });
        }
    });
});

/**
 * GET /api/mesa-ayuda/escalamientos
 * Obtiene todos los escalamientos con toda su información
 */
router.get('/escalamientos', async (req, res) => {
    try {
        // Validar token
        const authHeader = req.headers['authorization'] || req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                error: 1,
                response: { mensaje: 'Token requerido' }
            });
        }

        const token = authHeader.substring(7);
        const secret = process.env.JWT_SECRET;

        if (!secret) {
            return res.status(500).json({
                error: 1,
                response: { mensaje: 'Servidor sin JWT_SECRET configurado' }
            });
        }

        let payload;
        try {
            payload = jwt.verify(token, secret);
        } catch (e) {
            return res.status(401).json({
                error: 1,
                response: { mensaje: 'Token inválido o expirado' }
            });
        }

        // Obtener todos los escalamientos con información completa
        const escalamientos = await Escalamiento
            .find({})
            .populate('usuario_id', 'Cr_Nombre_Usuario Cr_Correo Cr_Pe_Codigo')
            .populate('usuario_asignado', 'Cr_Nombre_Usuario Cr_Correo Cr_Pe_Codigo')
            .sort({ createdAt: -1 }) // Más recientes primero
            .lean();

        // Si no hay registros
        if (!escalamientos || escalamientos.length === 0) {
            return res.status(200).json({
                error: 0,
                response: {
                    mensaje: 'No se encontraron escalamientos',
                    total: 0,
                    escalamientos: []
                }
            });
        }

        // Agregar URLs de evidencia y resolución a cada escalamiento
        const escalamientosConUrl = escalamientos.map(esc => ({
            ...esc,
            evidencia_url: esc.evidencia?.ruta
                ? `https://redcemed.com/api/mesa-ayuda/evidencia/${esc._id}`
                : null,
            imagen_resolucion_url: esc.imagen_resolucion?.ruta
                ? `https://redcemed.com/api/mesa-ayuda/evidencia-resolucion/${esc._id}`
                : null
        }));

        return res.status(200).json({
            error: 0,
            response: {
                mensaje: 'Consulta exitosa',
                total: escalamientosConUrl.length,
                escalamientos: escalamientosConUrl
            }
        });

    } catch (error) {
        console.error('[GET /escalamientos] ❌ Error:', error);
        return res.status(500).json({
            error: 1,
            response: {
                mensaje: 'Error interno del servidor',
                detalle: error.message
            }
        });
    }
});

/**
 * POST /api/mesa-ayuda/seguimientos
 * Obtiene los escalamientos de un usuario específico (sus casos escalados)
 */
router.post('/seguimientos', async (req, res) => {
    try {
        // Validar token
        const authHeader = req.headers['authorization'] || req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                error: 1,
                response: { mensaje: 'Token requerido' }
            });
        }

        const token = authHeader.substring(7);
        const secret = process.env.JWT_SECRET;

        if (!secret) {
            return res.status(500).json({
                error: 1,
                response: { mensaje: 'Servidor sin JWT_SECRET configurado' }
            });
        }

        let payload;
        try {
            payload = jwt.verify(token, secret);
        } catch (e) {
            return res.status(401).json({
                error: 1,
                response: { mensaje: 'Token inválido o expirado' }
            });
        }

        // Obtener usuario_id del body
        const { usuario_id } = req.body;

        console.log('[POST /seguimientos] 📝 Consultando seguimientos para usuario:', usuario_id);

        // Validar campo obligatorio
        if (!usuario_id) {
            return res.status(400).json({
                error: 1,
                response: { mensaje: 'El campo usuario_id es obligatorio' }
            });
        }

        // Validar formato de usuario_id
        if (usuario_id.length !== 24) {
            return res.status(400).json({
                error: 1,
                response: { mensaje: 'Formato de usuario_id inválido' }
            });
        }

        // Verificar que el usuario existe
        const usuario = await User.findById(usuario_id);
        if (!usuario) {
            return res.status(404).json({
                error: 1,
                response: { mensaje: 'Usuario no encontrado' }
            });
        }

        console.log('[POST /seguimientos] ✅ Usuario encontrado:', usuario.Cr_Nombre_Usuario);

        // Obtener escalamientos del usuario específico
        const escalamientos = await Escalamiento
            .find({ usuario_id: usuario_id })
            .populate('usuario_id', 'Cr_Nombre_Usuario Cr_Correo Cr_Pe_Codigo')
            .populate('usuario_asignado', 'Cr_Nombre_Usuario Cr_Correo Cr_Pe_Codigo')
            .sort({ createdAt: -1 }) // Más recientes primero
            .lean();

        console.log('[POST /seguimientos] 📊 Escalamientos encontrados:', escalamientos.length);

        // Si no hay registros
        if (!escalamientos || escalamientos.length === 0) {
            return res.status(200).json({
                error: 0,
                response: {
                    mensaje: 'No tiene casos escalados registrados',
                    total: 0,
                    data: []
                }
            });
        }

        // Agregar URLs de evidencia y resolución a cada escalamiento
        const escalamientosConUrl = escalamientos.map(esc => ({
            ...esc,
            evidencia_url: esc.evidencia?.ruta
                ? `https://redcemed.com/api/mesa-ayuda/evidencia/${esc._id}`
                : null,
            imagen_resolucion_url: esc.imagen_resolucion?.ruta
                ? `https://redcemed.com/api/mesa-ayuda/evidencia-resolucion/${esc._id}`
                : null
        }));

        return res.status(200).json({
            error: 0,
            response: {
                mensaje: 'Consulta exitosa',
                total: escalamientosConUrl.length,
                data: escalamientosConUrl
            }
        });

    } catch (error) {
        console.error('[POST /seguimientos] ❌ Error:', error);
        return res.status(500).json({
            error: 1,
            response: {
                mensaje: 'Error interno del servidor',
                detalle: error.message
            }
        });
    }
});

/**
 * GET /api/mesa-ayuda/evidencia/:escalamientoId
 * Descarga/visualiza la imagen de evidencia de un escalamiento
 */
router.get('/evidencia/:escalamientoId', async (req, res) => {
    try {
        // Validar token
        const authHeader = req.headers['authorization'] || req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                error: 1,
                response: { mensaje: 'Token requerido' }
            });
        }

        const token = authHeader.substring(7);
        const secret = process.env.JWT_SECRET;

        if (!secret) {
            return res.status(500).json({
                error: 1,
                response: { mensaje: 'Servidor sin JWT_SECRET configurado' }
            });
        }

        let payload;
        try {
            payload = jwt.verify(token, secret);
        } catch (e) {
            return res.status(401).json({
                error: 1,
                response: { mensaje: 'Token inválido o expirado' }
            });
        }

        // Obtener escalamientoId de los parámetros
        const { escalamientoId } = req.params;

        // Validar formato de ID
        if (!escalamientoId || escalamientoId.length !== 24) {
            return res.status(400).json({
                error: 1,
                response: { mensaje: 'ID de escalamiento inválido' }
            });
        }

        console.log('[GET /evidencia] 🔍 Buscando escalamiento:', escalamientoId);

        // Buscar el escalamiento
        const escalamiento = await Escalamiento.findById(escalamientoId);

        if (!escalamiento) {
            console.log('[GET /evidencia] ❌ Escalamiento no encontrado');
            return res.status(404).json({
                error: 1,
                response: { mensaje: 'Escalamiento no encontrado' }
            });
        }

        console.log('[GET /evidencia] ✅ Escalamiento encontrado');
        console.log('[GET /evidencia] - Evidencia ruta:', escalamiento.evidencia?.ruta);

        // Verificar si tiene evidencia
        if (!escalamiento.evidencia || !escalamiento.evidencia.ruta || escalamiento.evidencia.ruta.trim() === '') {
            console.log('[GET /evidencia] ❌ El escalamiento no tiene evidencia adjunta');
            return res.status(404).json({
                error: 1,
                response: { mensaje: 'El escalamiento no tiene evidencia adjunta' }
            });
        }

        // Construir ruta absoluta del archivo
        const rutaRelativa = escalamiento.evidencia.ruta;
        const rutaAbsoluta = path.join(__dirname, '../../storage', rutaRelativa);

        console.log('[GET /evidencia] 📁 Ruta absoluta:', rutaAbsoluta);
        console.log('[GET /evidencia] 🔍 Verificando existencia del archivo...');

        // Verificar si el archivo existe
        if (!fs.existsSync(rutaAbsoluta)) {
            console.log('[GET /evidencia] ❌ El archivo NO existe en el servidor');
            console.log('[GET /evidencia] 📂 Contenido del directorio storage:');

            try {
                const storageDir = path.join(__dirname, '../../storage');
                if (fs.existsSync(storageDir)) {
                    const files = fs.readdirSync(storageDir, { recursive: true });
                    console.log('[GET /evidencia] - Archivos en storage:', files);
                } else {
                    console.log('[GET /evidencia] - Directorio storage NO existe');
                }
            } catch (dirError) {
                console.log('[GET /evidencia] - Error al leer directorio:', dirError.message);
            }

            return res.status(404).json({
                error: 1,
                response: {
                    mensaje: 'El archivo de evidencia no existe en el servidor',
                    ruta_esperada: rutaRelativa
                }
            });
        }

        console.log('[GET /evidencia] ✅ Archivo encontrado');

        // Determinar el tipo MIME basado en la extensión
        const extension = path.extname(rutaAbsoluta).toLowerCase();
        let mimeType = 'image/jpeg'; // Por defecto

        if (extension === '.png') {
            mimeType = 'image/png';
        } else if (extension === '.jpg' || extension === '.jpeg') {
            mimeType = 'image/jpeg';
        }

        console.log('[GET /evidencia] 📤 Enviando archivo, tipo:', mimeType);

        // Enviar el archivo
        res.setHeader('Content-Type', mimeType);
        res.setHeader('Content-Disposition', `inline; filename="${escalamiento.evidencia.nombre_original || 'evidencia' + extension}"`);
        res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache por 1 día

        return res.sendFile(rutaAbsoluta);

    } catch (error) {
        console.error('[GET /evidencia] ❌ Error:', error);
        return res.status(500).json({
            error: 1,
            response: {
                mensaje: 'Error interno del servidor',
                detalle: error.message
            }
        });
    }
});

/**
 * PUT /api/mesa-ayuda/gestionar
 * Gestiona/cierra un escalamiento: asigna usuario, actualiza estado, agrega notas y evidencia de resolución
 */
router.put('/gestionar', (req, res) => {
    uploadImagen.single('imagen_resolucion')(req, res, async (err) => {
        // Manejo de errores de Multer
        if (err) {
            if (err instanceof multer.MulterError) {
                if (err.code === 'LIMIT_FILE_SIZE') {
                    return res.status(400).json({
                        error: 1,
                        response: {
                            mensaje: 'La imagen excede el tamaño máximo permitido de 5 MB',
                            codigo: 'LIMIT_FILE_SIZE'
                        }
                    });
                }
                return res.status(400).json({
                    error: 1,
                    response: {
                        mensaje: `Error al subir archivo: ${err.message}`,
                        codigo: err.code
                    }
                });
            }

            if (err.message === 'Solo se permiten archivos JPG y PNG') {
                return res.status(400).json({
                    error: 1,
                    response: { mensaje: 'Solo se permiten archivos JPG y PNG' }
                });
            }

            return res.status(500).json({
                error: 1,
                response: { mensaje: 'Error al procesar el archivo', detalle: err.message }
            });
        }

        try {
            // Validar token
            const authHeader = req.headers['authorization'];
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                return res.status(401).json({
                    error: 1,
                    response: { mensaje: 'Token requerido' }
                });
            }

            const token = authHeader.substring(7);
            let payload;

            try {
                payload = jwt.verify(token, process.env.JWT_SECRET);
            } catch (e) {
                return res.status(401).json({
                    error: 1,
                    response: { mensaje: 'Token inválido o expirado' }
                });
            }

            // Obtener parámetros del FormData
            const { escalamiento_id, usuario_asignado, notas_resolucion, estado } = req.body;

            console.log('[PUT /gestionar] 📝 Datos recibidos:');
            console.log('[PUT /gestionar] - escalamiento_id:', escalamiento_id);
            console.log('[PUT /gestionar] - usuario_asignado:', usuario_asignado);
            console.log('[PUT /gestionar] - estado:', estado);
            console.log('[PUT /gestionar] - notas_resolucion:', notas_resolucion ? 'Sí' : 'No');
            console.log('[PUT /gestionar] - imagen_resolucion:', req.file ? 'Sí' : 'No');

            // Validar campos obligatorios
            if (!escalamiento_id) {
                return res.status(400).json({
                    error: 1,
                    response: { mensaje: 'El campo escalamiento_id es obligatorio' }
                });
            }

            if (!usuario_asignado) {
                return res.status(400).json({
                    error: 1,
                    response: { mensaje: 'El campo usuario_asignado es obligatorio' }
                });
            }

            if (!estado) {
                return res.status(400).json({
                    error: 1,
                    response: { mensaje: 'El campo estado es obligatorio' }
                });
            }

            // Validar formato de IDs
            if (escalamiento_id.length !== 24) {
                return res.status(400).json({
                    error: 1,
                    response: { mensaje: 'Formato de escalamiento_id inválido' }
                });
            }

            if (usuario_asignado.length !== 24) {
                return res.status(400).json({
                    error: 1,
                    response: { mensaje: 'Formato de usuario_asignado inválido' }
                });
            }

            // Validar estado
            const estadosValidos = ['PENDIENTE', 'EN_PROCESO', 'RESUELTO', 'CERRADO'];
            if (!estadosValidos.includes(estado)) {
                return res.status(400).json({
                    error: 1,
                    response: { mensaje: 'El estado debe ser: PENDIENTE, EN_PROCESO, RESUELTO o CERRADO' }
                });
            }

            // Buscar el escalamiento
            console.log('[PUT /gestionar] 🔍 Buscando escalamiento...');
            const escalamiento = await Escalamiento.findById(escalamiento_id);

            if (!escalamiento) {
                console.log('[PUT /gestionar] ❌ Escalamiento no encontrado');
                return res.status(404).json({
                    error: 1,
                    response: { mensaje: 'Escalamiento no encontrado' }
                });
            }

            console.log('[PUT /gestionar] ✅ Escalamiento encontrado');

            // Verificar que el usuario asignado existe
            console.log('[PUT /gestionar] 🔍 Verificando usuario asignado...');
            const usuario = await User.findById(usuario_asignado);
            if (!usuario) {
                console.log('[PUT /gestionar] ❌ Usuario asignado no encontrado');
                return res.status(404).json({
                    error: 1,
                    response: { mensaje: 'Usuario asignado no encontrado' }
                });
            }

            console.log('[PUT /gestionar] ✅ Usuario asignado encontrado:', usuario.Cr_Nombre_Usuario);

            // Preparar datos de actualización
            const datosActualizacion = {
                usuario_asignado,
                estado,
                notas_resolucion: notas_resolucion || null
            };

            // Si el estado es RESUELTO o CERRADO, actualizar fecha de resolución
            if (estado === 'RESUELTO' || estado === 'CERRADO') {
                datosActualizacion.fecha_resolucion = new Date();
                console.log('[PUT /gestionar] 📅 Fecha de resolución establecida');
            }

            // Guardar imagen de resolución si se envió
            if (req.file) {
                console.log('[PUT /gestionar] 📸 Procesando imagen de resolución...');
                console.log('[PUT /gestionar] - Tamaño:', req.file.size, 'bytes');
                console.log('[PUT /gestionar] - Tipo:', req.file.mimetype);
                console.log('[PUT /gestionar] - Nombre original:', req.file.originalname);

                try {
                    const timestamp = Date.now();
                    const extension = req.file.mimetype === 'image/png' ? 'png' : 'jpg';
                    const nombreArchivo = `resolucion_${escalamiento_id}_${timestamp}.${extension}`;
                    const rutaRelativa = `escalamientos/${nombreArchivo}`;
                    const rutaAbsoluta = path.join(__dirname, '../../storage', rutaRelativa);

                    console.log('[PUT /gestionar] 📁 Ruta absoluta:', rutaAbsoluta);

                    // Crear directorio si no existe
                    const dir = path.dirname(rutaAbsoluta);
                    if (!fs.existsSync(dir)) {
                        console.log('[PUT /gestionar] 📂 Creando directorio:', dir);
                        fs.mkdirSync(dir, { recursive: true });
                        console.log('[PUT /gestionar] ✅ Directorio creado exitosamente');
                    } else {
                        console.log('[PUT /gestionar] ✅ Directorio ya existe');
                    }

                    // Guardar archivo
                    console.log('[PUT /gestionar] 💾 Guardando imagen de resolución...');
                    fs.writeFileSync(rutaAbsoluta, req.file.buffer);
                    console.log('[PUT /gestionar] ✅ Imagen guardada exitosamente');

                    // Verificar que el archivo existe
                    if (fs.existsSync(rutaAbsoluta)) {
                        const stats = fs.statSync(rutaAbsoluta);
                        console.log('[PUT /gestionar] ✅ Verificación: Archivo existe');
                        console.log('[PUT /gestionar] - Tamaño en disco:', stats.size, 'bytes');
                    } else {
                        console.error('[PUT /gestionar] ❌ ERROR: El archivo NO se guardó correctamente');
                        throw new Error('No se pudo verificar el guardado del archivo');
                    }

                    // Agregar información de imagen de resolución
                    datosActualizacion.imagen_resolucion = {
                        ruta: rutaRelativa,
                        nombre_original: req.file.originalname,
                        fecha_subida: new Date()
                    };

                    console.log('[PUT /gestionar] ✅ Imagen de resolución procesada correctamente');

                } catch (fileError) {
                    console.error('[PUT /gestionar] ❌ Error al guardar imagen:', fileError);
                    return res.status(500).json({
                        error: 1,
                        response: {
                            mensaje: 'Error al guardar la imagen de resolución en el servidor',
                            detalle: fileError.message
                        }
                    });
                }
            } else {
                console.log('[PUT /gestionar] ℹ️ No se envió imagen de resolución');
            }

            // Actualizar el escalamiento
            console.log('[PUT /gestionar] 💾 Actualizando escalamiento en BD...');
            const escalamientoActualizado = await Escalamiento.findByIdAndUpdate(
                escalamiento_id,
                datosActualizacion,
                { new: true, runValidators: true }
            )
            .populate('usuario_id', 'Cr_Nombre_Usuario Cr_Correo Cr_Pe_Codigo')
            .populate('usuario_asignado', 'Cr_Nombre_Usuario Cr_Correo Cr_Pe_Codigo');

            console.log('[PUT /gestionar] ✅ Escalamiento actualizado exitosamente');

            return res.status(200).json({
                error: 0,
                response: {
                    mensaje: 'Escalamiento gestionado exitosamente',
                    escalamiento: {
                        id: escalamientoActualizado._id,
                        estado: escalamientoActualizado.estado,
                        usuario_asignado: escalamientoActualizado.usuario_asignado,
                        notas_resolucion: escalamientoActualizado.notas_resolucion,
                        fecha_resolucion: escalamientoActualizado.fecha_resolucion,
                        imagen_resolucion: escalamientoActualizado.imagen_resolucion?.ruta ? {
                            ruta: escalamientoActualizado.imagen_resolucion.ruta,
                            nombre_original: escalamientoActualizado.imagen_resolucion.nombre_original,
                            url: `https://redcemed.com/api/mesa-ayuda/evidencia-resolucion/${escalamientoActualizado._id}`
                        } : null,
                        fecha_actualizacion: escalamientoActualizado.updatedAt
                    }
                }
            });

        } catch (error) {
            console.error('[PUT /gestionar] ❌ Error general:', error);
            return res.status(500).json({
                error: 1,
                response: {
                    mensaje: 'Error interno del servidor',
                    detalle: error.message
                }
            });
        }
    });
});

/**
 * GET /api/mesa-ayuda/evidencia-resolucion/:escalamientoId
 * Descarga/visualiza la imagen de resolución de un escalamiento
 */
router.get('/evidencia-resolucion/:escalamientoId', async (req, res) => {
    try {
        // Validar token
        const authHeader = req.headers['authorization'] || req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                error: 1,
                response: { mensaje: 'Token requerido' }
            });
        }

        const token = authHeader.substring(7);
        const secret = process.env.JWT_SECRET;

        if (!secret) {
            return res.status(500).json({
                error: 1,
                response: { mensaje: 'Servidor sin JWT_SECRET configurado' }
            });
        }

        let payload;
        try {
            payload = jwt.verify(token, secret);
        } catch (e) {
            return res.status(401).json({
                error: 1,
                response: { mensaje: 'Token inválido o expirado' }
            });
        }

        // Obtener escalamientoId de los parámetros
        const { escalamientoId } = req.params;

        // Validar formato de ID
        if (!escalamientoId || escalamientoId.length !== 24) {
            return res.status(400).json({
                error: 1,
                response: { mensaje: 'ID de escalamiento inválido' }
            });
        }

        console.log('[GET /evidencia-resolucion] 🔍 Buscando escalamiento:', escalamientoId);

        // Buscar el escalamiento
        const escalamiento = await Escalamiento.findById(escalamientoId);

        if (!escalamiento) {
            console.log('[GET /evidencia-resolucion] ❌ Escalamiento no encontrado');
            return res.status(404).json({
                error: 1,
                response: { mensaje: 'Escalamiento no encontrado' }
            });
        }

        console.log('[GET /evidencia-resolucion] ✅ Escalamiento encontrado');
        console.log('[GET /evidencia-resolucion] - Imagen resolución ruta:', escalamiento.imagen_resolucion?.ruta);

        // Verificar si tiene imagen de resolución
        if (!escalamiento.imagen_resolucion || !escalamiento.imagen_resolucion.ruta || escalamiento.imagen_resolucion.ruta.trim() === '') {
            console.log('[GET /evidencia-resolucion] ❌ El escalamiento no tiene imagen de resolución adjunta');
            return res.status(404).json({
                error: 1,
                response: { mensaje: 'El escalamiento no tiene imagen de resolución adjunta' }
            });
        }

        // Construir ruta absoluta del archivo
        const rutaRelativa = escalamiento.imagen_resolucion.ruta;
        const rutaAbsoluta = path.join(__dirname, '../../storage', rutaRelativa);

        console.log('[GET /evidencia-resolucion] 📁 Ruta absoluta:', rutaAbsoluta);
        console.log('[GET /evidencia-resolucion] 🔍 Verificando existencia del archivo...');

        // Verificar si el archivo existe
        if (!fs.existsSync(rutaAbsoluta)) {
            console.log('[GET /evidencia-resolucion] ❌ El archivo NO existe en el servidor');
            return res.status(404).json({
                error: 1,
                response: {
                    mensaje: 'El archivo de imagen de resolución no existe en el servidor',
                    ruta_esperada: rutaRelativa
                }
            });
        }

        console.log('[GET /evidencia-resolucion] ✅ Archivo encontrado');

        // Determinar el tipo MIME basado en la extensión
        const extension = path.extname(rutaAbsoluta).toLowerCase();
        let mimeType = 'image/jpeg'; // Por defecto

        if (extension === '.png') {
            mimeType = 'image/png';
        } else if (extension === '.jpg' || extension === '.jpeg') {
            mimeType = 'image/jpeg';
        }

        console.log('[GET /evidencia-resolucion] 📤 Enviando archivo, tipo:', mimeType);

        // Enviar el archivo
        res.setHeader('Content-Type', mimeType);
        res.setHeader('Content-Disposition', `inline; filename="${escalamiento.imagen_resolucion.nombre_original || 'resolucion' + extension}"`);
        res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache por 1 día

        return res.sendFile(rutaAbsoluta);

    } catch (error) {
        console.error('[GET /evidencia-resolucion] ❌ Error:', error);
        return res.status(500).json({
            error: 1,
            response: {
                mensaje: 'Error interno del servidor',
                detalle: error.message
            }
        });
    }
});

module.exports = router;
