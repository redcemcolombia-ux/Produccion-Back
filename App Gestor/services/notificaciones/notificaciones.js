const express = require('express');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const Notificacion = require('../server/models/Cl_Notificaciones_mail_whatsapp/Cl_Notificaciones_mail_whatsapp');
const HojaVida = require('../server/models/hojaVida/hojaVida');

const router = express.Router();

// Carpeta donde se guardarán los PDF
const UPLOAD_DIR = path.join(__dirname, '../uploads/notificaciones');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Configuración de multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
        const filename = `notificacion_${Date.now()}.pdf`;
        cb(null, filename);
    }
});

// Validación tamaño y tipo
const upload = multer({
    storage,
    limits: { fileSize: 100 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') cb(null, true);
        else cb(new Error('Solo se permiten archivos PDF'), false);
    }
});


// ------------------------------------------------------
// POST /api/notificaciones/crear
// ------------------------------------------------------
router.post('/crear', (req, res, next) => {
    upload.fields([
        { name: 'pdf', maxCount: 1 },
        { name: 'documento_adjunto', maxCount: 1 },
        { name: 'archivo', maxCount: 1 }
    ])(req, res, (err) => {
        if (err) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({
                    error: 1,
                    response: { mensaje: 'El archivo excede los 100MB permitidos' }
                });
            }
            if (err.code === 'LIMIT_UNEXPECTED_FILE') {
                return res.status(400).json({
                    error: 1,
                    response: { mensaje: "Campo de archivo inválido. Use 'pdf', 'documento_adjunto' o 'archivo'" }
                });
            }
            if (err.message === 'Solo se permiten archivos PDF') {
                return res.status(400).json({
                    error: 1,
                    response: { mensaje: 'Solo se permiten archivos PDF' }
                });
            }

            console.error('Error multer:', err);
            return res.status(400).json({
                error: 1,
                response: { mensaje: 'Error al procesar el archivo' }
            });
        }
        next();
    });
}, async (req, res) => {
    try {
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

        try {
            jwt.verify(token, secret);
        } catch (e) {
            return res.status(401).json({
                error: 1,
                response: { mensaje: 'Token inválido o expirado' }
            });
        }

        // Campos del request
        const { id_usuario, asunto, mensaje } = req.body;

        if (!id_usuario || !asunto || !mensaje) {
            return res.status(400).json({
                error: 1,
                response: { mensaje: 'Faltan parámetros obligatorios' }
            });
        }

        let ruta_documento_adjunto = null;
        const fileEntry = (req.files && (req.files.pdf?.[0] || req.files.documento_adjunto?.[0] || req.files.archivo?.[0])) || req.file || null;
        if (fileEntry) {
            ruta_documento_adjunto = `/uploads/notificaciones/${fileEntry.filename}`;
        }

        // Crear registro en BD
        const nuevaNotificacion = await Notificacion.create({
            id_usuario,
            asunto,
            mensaje,
            ruta_documento_adjunto,
            estado: 'ACTIVO'
        });

        return res.status(201).json({
            error: 0,
            response: {
                mensaje: 'Registro creado correctamente',
                id: nuevaNotificacion._id
            }
        });

    } catch (err) {
        console.error('Error en /api/notificaciones/crear:', err);
        return res.status(500).json({
            error: 1,
            response: { mensaje: 'Error inesperado' }
        });
    }
});

router.get('/listar-por-usuario', async (req, res) => {
    try {
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

        try {
            jwt.verify(token, secret);
        } catch (e) {
            return res.status(401).json({
                error: 1,
                response: { mensaje: 'Token inválido o expirado' }
            });
        }

        const { id_usuario } = req.query;

        if (!id_usuario) {
            return res.status(400).json({
                error: 1,
                response: { mensaje: 'El id_usuario es obligatorio' }
            });
        }

        const notificaciones = await Notificacion.find({ id_usuario }).sort({ createdAt: -1 });

        return res.status(200).json({
            error: 0,
            response: {
                mensaje: 'Notificaciones obtenidas correctamente',
                notificaciones
            }
        });

    } catch (err) {
        console.error('Error en /api/notificaciones/listar-por-usuario:', err);
        return res.status(500).json({
            error: 1,
            response: { mensaje: 'Error inesperado' }
        });
    }
});

router.put('/actualizar-estado', async (req, res) => {
    try {
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

        try {
            jwt.verify(token, secret);
        } catch (e) {
            return res.status(401).json({
                error: 1,
                response: { mensaje: 'Token inválido o expirado' }
            });
        }

        const { id_usuario, id_notificacion, estado } = req.body;

        if (!id_usuario || !id_notificacion || !estado) {
            return res.status(400).json({
                error: 1,
                response: { mensaje: 'Faltan parámetros obligatorios' }
            });
        }

        const notificacion = await Notificacion.findOneAndUpdate(
            { _id: id_notificacion, id_usuario },
            { estado },
            { new: true }
        );

        if (!notificacion) {
            return res.status(404).json({
                error: 1,
                response: { mensaje: 'No se encontró la notificación para actualizar' }
            });
        }

        return res.status(200).json({
            error: 0,
            response: {
                mensaje: 'Estado actualizado correctamente',
                notificacion
            }
        });

    } catch (err) {
        console.error('Error en /api/notificaciones/actualizar-estado:', err);
        return res.status(500).json({
            error: 1,
            response: { mensaje: 'Error inesperado' }
        });
    }
});

router.get('/listar-por-usuario', async (req, res) => {
    try {
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

        try {
            jwt.verify(token, secret);
        } catch (e) {
            return res.status(401).json({
                error: 1,
                response: { mensaje: 'Token inválido o expirado' }
            });
        }

        const { id_usuario } = req.query;

        if (!id_usuario) {
            return res.status(400).json({
                error: 1,
                response: { mensaje: 'El id_usuario es obligatorio' }
            });
        }

        const id_usuario_limpio = id_usuario.trim();

        const notificaciones = await Notificacion.find({ id_usuario: id_usuario_limpio })
            .sort({ createdAt: -1 });

        const BASE_URL = `${req.protocol}://${req.get('host')}`;

        const respuesta = notificaciones.map((n) => ({
            id: n._id,
            asunto: n.asunto,
            mensaje: n.mensaje,
            estado: n.estado,
            fecha_creacion: n.createdAt,
            documento_adjunto: n.ruta_documento_adjunto
                ? `${BASE_URL}${n.ruta_documento_adjunto}`
                : null
        }));

        return res.status(200).json({
            error: 0,
            response: respuesta
        });

    } catch (err) {
        console.error('Error en /api/notificaciones/listar-por-usuario:', err);
        return res.status(500).json({
            error: 1,
            response: { mensaje: 'Error inesperado' }
        });
    }
});
router.get('/obtener-documento', async (req, res) => {
    try {
        // 1. VALIDAR TOKEN (misma estructura)
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

        let decodedToken;
        try {
            decodedToken = jwt.verify(token, secret);
        } catch (e) {
            return res.status(401).json({
                error: 1,
                response: { mensaje: 'Token inválido o expirado' }
            });
        }

        const id_usuario_token = decodedToken.id_usuario;

        // 2. OBTENER id_notificacion DESDE QUERY
        const { id_notificacion } = req.query;

        if (!id_notificacion) {
            return res.status(400).json({
                error: 1,
                response: { mensaje: 'El id_notificacion es obligatorio' }
            });
        }

        const id_limpio = id_notificacion.trim();

        // 3. BUSCAR NOTIFICACIÓN
        const notificacion = await Notificacion.findById(id_limpio);

        if (!notificacion) {
            return res.status(404).json({
                error: 1,
                response: { mensaje: 'Notificación no encontrada' }
            });
        }

        

        // 5. VALIDAR EXISTENCIA DEL ARCHIVO
        if (!notificacion.ruta_documento_adjunto) {
            return res.status(404).json({
                error: 1,
                response: { mensaje: 'La notificación no tiene archivo adjunto' }
            });
        }

        const rutaCompleta = path.join(__dirname, '..', notificacion.ruta_documento_adjunto);
        console.log(rutaCompleta);

        if (!fs.existsSync(rutaCompleta)) {
            return res.status(404).json({
                error: 1,
                response: { mensaje: 'Archivo no encontrado en el servidor' }
            });
        }

        // 6. ENVIAR PDF COMO STREAM
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'inline; filename=documento.pdf');

        const fileStream = fs.createReadStream(rutaCompleta);
        fileStream.pipe(res);

    } catch (err) {
        console.error('Error en /api/notificaciones/obtener-documento:', err);
        return res.status(500).json({
            error: 1,
            response: { mensaje: 'Error inesperado' }
        });
    }
});

router.get('/casos_pendientes', async (req, res) => {
    try {
        console.log("URL solicitada: /api/notificaciones/casos_pendientes");

        
        const casos = await HojaVida.find({
            H_ESTADO_NOTIFICACION_CONSENTIMIENTO: { $exists: true, $eq: "SIN GESTION" }
        });

        if (!casos.length) {
            return res.status(200).json({
                error: 1,
                response: { mensaje: 'No hay casos pendientes' }
            });
        }

        const resultados = [];
        const ultimaNotificacionActiva = await Notificacion.findOne({ estado: "ACTIVO" }).sort({ createdAt: -1 });

        for (const caso of casos) {
            const candidates = [];
            if (caso.USUARIO_ID) candidates.push(caso.USUARIO_ID);
            if (caso._id) candidates.push(caso._id);

            let notificacion = null;
            if (candidates.length) {
                notificacion = await Notificacion
                    .findOne({ id_usuario: { $in: candidates }, estado: "ACTIVO" })
                    .sort({ createdAt: -1 });
            }
            if (!notificacion) {
                notificacion = ultimaNotificacionActiva;
            }

            resultados.push({
                _id: caso._id,
                NOMBRE: caso.NOMBRE,
                PRIMER_APELLIDO: caso.PRIMER_APELLIDO,
                SEGUNDO_APELLIDO: caso.SEGUNDO_APELLIDO,
                CELULAR: caso.CELULAR,
                CORREO: caso.CORREO,
                notificacion: notificacion
                    ? {
                        _id: notificacion._id,
                        asunto: notificacion.asunto,
                        mensaje: notificacion.mensaje,
                        ruta_documento_adjunto: notificacion.ruta_documento_adjunto
                    }
                    : null
            });
        }

        return res.status(200).json({
            error: 0,
            response: {
                mensaje: "Consulta exitosa",
                data: resultados
            }
        });

    } catch (err) {
        console.error("Error inesperado:", err);
        return res.status(500).json({
            error: 1,
            response: { mensaje: 'Error inesperado' }
        });
    }
});


router.get('/consultar', async (req, res) => {
    try {
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

        try {
            jwt.verify(token, secret);
        } catch (e) {
            return res.status(401).json({
                error: 1,
                response: { mensaje: 'Token inválido o expirado' }
            });
        }

        const notificaciones = await Notificacion.find({}).sort({ createdAt: -1 });

        return res.status(200).json({
            error: 0,
            response: {
                mensaje: `Se encontraron ${notificaciones.length} notificaciones`,
                total: notificaciones.length,
                notificaciones
            }
        });

    } catch (err) {
        console.error('Error en /api/notificaciones/consultar:', err);
        return res.status(500).json({
            error: 1,
            response: { mensaje: 'Error inesperado' }
        });
    }
});

module.exports = router;
