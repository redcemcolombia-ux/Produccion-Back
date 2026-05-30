const express = require('express');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const HojaVida = require('../server/models/hojaVida/hojaVida');

const router = express.Router();
const UPLOAD_DIR = path.join(__dirname, '../uploads/pdf');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const UPLOAD_DIR_NOTIFICACIONES = path.join(__dirname, '../uploads/notificaciones');
if (!fs.existsSync(UPLOAD_DIR_NOTIFICACIONES)) fs.mkdirSync(UPLOAD_DIR_NOTIFICACIONES, { recursive: true });
const STORAGE_NOTIFICACIONES_DIR = path.join(__dirname, '../../storage/notificaciones');


const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => cb(null, `hoja_vida_${req.body.id}_${Date.now()}.pdf`)
});

// Configurar límites de archivo: 40 MB máximo
const upload = multer({
    storage,
    limits: {
        fileSize: 40 * 1024 * 1024  // 40 MB en bytes
    },
    fileFilter: (req, file, cb) => {
        // Validar que sea un archivo PDF
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Solo se permiten archivos PDF'), false);
        }
    }
});


router.put('/pdf', (req, res, next) => {
    upload.single('pdf')(req, res, (err) => {
        if (err) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({
                    error: 1,
                    response: { mensaje: 'El archivo excede el límite de 40 MB' }
                });
            }
            if (err.message === 'Solo se permiten archivos PDF') {
                return res.status(400).json({
                    error: 1,
                    response: { mensaje: 'Solo se permiten archivos PDF' }
                });
            }
            return res.status(400).json({
                error: 1,
                response: { mensaje: 'Error al procesar el archivo' }
            });
        }
        next();
    });
}, async (req, res) => {
    try {
        const { id, token } = req.body;


        if (!id || !token || !req.file) {
            return res.status(400).json({ error: 1, response: { mensaje: 'Faltan parámetros requeridos' } });
        }


        const secret = process.env.JWT_SECRET;
        if (!secret) return res.status(500).json({ error: 1, response: { mensaje: 'Servidor sin JWT_SECRET configurado' } });

        try {
            jwt.verify(token, secret);
        } catch (e) {
            return res.status(401).json({ error: 1, response: { mensaje: 'Token inválido o expirado' } });
        }


        const pdfUrl = `/uploads/pdf/${req.file.filename}`;
        const update = await HojaVida.findByIdAndUpdate(
            id,
            {
                PDF_URL: pdfUrl,
                ESTADO: "EN ESPERA"
            },
            { new: true }
        );

        if (!update) {
            return res.status(404).json({ error: 1, response: { mensaje: 'No se encontró el documento' } });
        }

        return res.status(200).json({
            error: 0,
            response: {
                mensaje: 'PDF almacenado correctamente',
                id: update._id,
                url: pdfUrl
            }
        });

    } catch (err) {
        console.error('Error en /api/hoja_vida/pdf:', err);
        return res.status(500).json({ error: 1, response: { mensaje: 'Error inesperado al guardar el PDF' } });
    }
});

// Servicio para mostrar/descargar PDFs
router.get('/pdf/:filename', async (req, res) => {
    try {
        // Validación de token
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

        const { filename } = req.params;

        // Validar que el filename solo contenga caracteres seguros
        // Acepta IDs de MongoDB (alfanuméricos) y timestamps (numéricos)
        if (!/^hoja_vida_[a-zA-Z0-9]+_\d+\.pdf$/.test(filename)) {
            return res.status(400).json({
                error: 1,
                response: { mensaje: 'Nombre de archivo inválido' }
            });
        }

        // Construir la ruta completa del archivo
        const filePath = path.join(UPLOAD_DIR, filename);

        // Verificar que el archivo existe
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({
                error: 1,
                response: { mensaje: 'Archivo PDF no encontrado' }
            });
        }

        // Configurar headers para PDF
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${filename}"`);

        // Enviar el archivo
        res.sendFile(filePath);

    } catch (err) {
        console.error('Error en /api/pdf/pdf/:filename:', err);
        return res.status(500).json({
            error: 1,
            response: { mensaje: 'Error inesperado al obtener el PDF' }
        });
    }
});

router.get('/notificacion/:filename', async (req, res) => {
    try {
        const { filename } = req.params;

        if (!/^notificacion_\d+\.pdf$/.test(filename)) {
            return res.status(400).json({
                error: 1,
                response: { mensaje: 'Archivo de notificación inválido' }
            });
        }

        const filePath = path.join(UPLOAD_DIR_NOTIFICACIONES, filename);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({
                error: 1,
                response: { mensaje: 'Archivo no encontrado' }
            });
        }

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
        res.sendFile(filePath);

    } catch (err) {
        console.error('Error en /pdf/notificacion/:filename:', err);
        return res.status(500).json({
            error: 1,
            response: { mensaje: 'Error inesperado' }
        });
    }
});

router.get('/recibida/:filename', async (req, res) => {
    try {
        const { filename } = req.params;
        const isIdPattern = /^[a-fA-F0-9]{24}_\d+\.pdf$/.test(filename);
        const isNotifPattern = /^notificacion_\d+\.pdf$/.test(filename);
        if (!isIdPattern && !isNotifPattern) {
            return res.status(400).json({ error: 1, response: { mensaje: 'Nombre de archivo inválido' } });
        }

        const storagePath = path.join(STORAGE_NOTIFICACIONES_DIR, filename);
        const uploadNotifPath = path.join(UPLOAD_DIR_NOTIFICACIONES, filename);

        let filePath = null;
        if (fs.existsSync(storagePath)) filePath = storagePath;
        else if (fs.existsSync(uploadNotifPath)) filePath = uploadNotifPath;
        else {
            return res.status(404).json({ error: 1, response: { mensaje: 'Archivo PDF no encontrado' } });
        }

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
        res.sendFile(filePath);

    } catch (err) {
        console.error('Error en /api/pdf/recibida/:filename:', err);
        return res.status(500).json({
            error: 1,
            response: { mensaje: 'Error inesperado al obtener el PDF' }
        });
    }
});

router.get('/recibida/por-id/:id', async (req, res) => {
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

        const { id } = req.params;
        if (!/^[a-fA-F0-9]{24}$/.test(id)) {
            return res.status(400).json({ error: 1, response: { mensaje: 'ID inválido' } });
        }

        const registro = await HojaVida.findById(id).lean();
        if (!registro || !registro.RUTA_NOTIFICACION_RECIBIDA) {
            return res.status(404).json({ error: 1, response: { mensaje: 'Documento no encontrado' } });
        }

        const absolutePath = path.join(__dirname, '../../storage', registro.RUTA_NOTIFICACION_RECIBIDA);
        if (!fs.existsSync(absolutePath)) {
            return res.status(404).json({ error: 1, response: { mensaje: 'Archivo PDF no encontrado' } });
        }

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${path.basename(absolutePath)}"`);
        res.sendFile(absolutePath);

    } catch (err) {
        console.error('Error en /api/pdf/recibida/por-id/:id:', err);
        return res.status(500).json({ error: 1, response: { mensaje: 'Error inesperado al obtener el PDF' } });
    }
});


module.exports = router;
