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
                const timestamp = Date.now();
                const extension = req.file.mimetype === 'image/png' ? 'png' : 'jpg';
                const nombreArchivo = `${usuario_id}_${timestamp}.${extension}`;
                const rutaRelativa = `escalamientos/${nombreArchivo}`;
                const rutaAbsoluta = path.join(__dirname, '../../storage', rutaRelativa);

                // Crear directorio si no existe
                const dir = path.dirname(rutaAbsoluta);
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                }

                // Guardar archivo
                fs.writeFileSync(rutaAbsoluta, req.file.buffer);

                // Agregar información de evidencia
                escalamientoData.evidencia = {
                    ruta: rutaRelativa,
                    nombre_original: req.file.originalname,
                    fecha_subida: new Date()
                };
            }

            // Crear el escalamiento
            const nuevoEscalamiento = await Escalamiento.create(escalamientoData);

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
                            nombre_original: nuevoEscalamiento.evidencia.nombre_original
                        } : null,
                        fecha_creacion: nuevoEscalamiento.createdAt
                    }
                }
            });

        } catch (error) {
            console.error('Error en /api/mesa-ayuda/escalar:', error);
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

        return res.status(200).json({
            error: 0,
            response: {
                mensaje: 'Consulta exitosa',
                total: escalamientos.length,
                escalamientos: escalamientos
            }
        });

    } catch (error) {
        console.error('Error en /api/mesa-ayuda/escalamientos:', error);
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
