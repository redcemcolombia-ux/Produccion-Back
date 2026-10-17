const express = require('express');
const fs = require('fs/promises');
const path = require('path');
const { randomUUID } = require('crypto');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const { mongoose } = require('../server/conection/mongo');
const User = require('../server/models/user/user');
const HojaVida = require('../server/models/hojaVida/hojaVida');
const Solicitud = require('../server/models/examenes/solicitudExamenActualizado');
const Soporte = require('../server/models/examenes/soporteExamenActualizado');

const router = express.Router();
const uploadDir = path.join(__dirname, '../uploads/pdf/examenes-actualizados');
const perfilesGestor = new Set(['cliente gestor', 'cliente admin', 'cliente', 'supervisor', 'administrador']);
const perfilesLectura = new Set([...perfilesGestor, 'cliente informes']);
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 40 * 1024 * 1024 },
    fileFilter: (req, file, cb) => cb(null, file.mimetype === 'application/pdf')
});

async function autorizarCaso(req, res, next) {
    const auth = req.headers.authorization;
    if (!auth || !/^Bearer\s+\S+$/i.test(auth)) {
        return res.status(401).json({ error: 1, response: { mensaje: 'Token Bearer requerido' } });
    }

    let payload;
    try {
        payload = jwt.verify(auth.split(/\s+/)[1], process.env.JWT_SECRET);
    } catch (error) {
        return res.status(401).json({ error: 1, response: { mensaje: 'Token inválido o expirado' } });
    }

    if (!mongoose.isValidObjectId(req.params.id) || !mongoose.isValidObjectId(payload.userId)) {
        return res.status(400).json({ error: 1, response: { mensaje: 'Identificador inválido' } });
    }

    try {
        const user = await User.findById(payload.userId).select('Cr_Perfil Cr_Ips').lean();
        if (!user) {
            return res.status(401).json({ error: 1, response: { mensaje: 'Usuario no encontrado' } });
        }
        const perfil = (user.Cr_Perfil || '').trim().toLowerCase();
        const esGestor = perfilesLectura.has(perfil);
        const esIps = perfil === 'usuario' && !!user.Cr_Ips;
        if (!esGestor && !esIps) {
            return res.status(403).json({ error: 1, response: { mensaje: 'Perfil sin acceso a exámenes actualizados' } });
        }

        const caso = await HojaVida.findById(req.params.id).select('_id IPS_ID').lean();
        if (!caso || !caso.IPS_ID || (esIps && String(caso.IPS_ID) !== String(user.Cr_Ips))) {
            return res.status(404).json({ error: 1, response: { mensaje: 'Aspirante no encontrado para este usuario' } });
        }

        req.soporteUsuario = { id: user._id, ipsId: caso.IPS_ID, perfil, esGestor, esIps };
        next();
    } catch (error) {
        next(error);
    }
}

function soloGestor(req, res, next) {
    if (!perfilesGestor.has(req.soporteUsuario.perfil)) {
        return res.status(403).json({ error: 1, response: { mensaje: 'Solo un gestor puede solicitar el examen' } });
    }
    next();
}

function soloIps(req, res, next) {
    if (!req.soporteUsuario.esIps) {
        return res.status(403).json({ error: 1, response: { mensaje: 'Solo la IPS asignada puede cargar el PDF' } });
    }
    next();
}

function recibirPdf(req, res, next) {
    upload.single('pdf')(req, res, error => {
        if (error) {
            const mensaje = error.code === 'LIMIT_FILE_SIZE'
                ? 'El archivo excede el límite de 40 MB'
                : 'Error al procesar el PDF';
            return res.status(400).json({ error: 1, response: { mensaje } });
        }
        next();
    });
}

function presentar(soporte) {
    return {
        id: soporte._id,
        solicitud_id: soporte.solicitudId,
        nombre_original: soporte.nombreOriginal,
        ips_id: soporte.ipsId,
        usuario_id: soporte.usuarioId,
        fecha_carga: soporte.createdAt,
        archivo_url: `/api/hojas-vida/${soporte.hojaVidaId}/examenes-actualizados/${soporte._id}/archivo`
    };
}

router.post('/:id/examenes-actualizados/solicitudes', autorizarCaso, soloGestor, async (req, res, next) => {
    const motivo = typeof req.body.motivo === 'string' ? req.body.motivo.trim() : '';
    if (motivo.length < 10 || motivo.length > 1000) {
        return res.status(400).json({ error: 1, response: { mensaje: 'El motivo debe tener entre 10 y 1000 caracteres' } });
    }
    try {
        const solicitud = await Solicitud.create({
            hojaVidaId: req.params.id,
            ipsId: req.soporteUsuario.ipsId,
            gestorId: req.soporteUsuario.id,
            motivo
        });
        res.status(201).json({ error: 0, response: {
            id: solicitud._id, estado: 'PENDIENTE', motivo: solicitud.motivo,
            ips_id: solicitud.ipsId, fecha_solicitud: solicitud.createdAt
        } });
    } catch (error) {
        next(error);
    }
});

router.get('/:id/examenes-actualizados/solicitudes', autorizarCaso, async (req, res, next) => {
    try {
        const filtro = { hojaVidaId: req.params.id };
        if (req.soporteUsuario.esIps) filtro.ipsId = req.soporteUsuario.ipsId;
        const solicitudes = await Solicitud.find(filtro).sort({ createdAt: -1 }).lean();
        const soportes = await Soporte.find({ solicitudId: { $in: solicitudes.map(s => s._id) } })
            .select('_id solicitudId').lean();
        const porSolicitud = new Map(soportes.map(s => [String(s.solicitudId), s._id]));
        res.json({ error: 0, response: solicitudes.map(s => ({
            id: s._id,
            motivo: s.motivo,
            ips_id: s.ipsId,
            gestor_id: s.gestorId,
            fecha_solicitud: s.createdAt,
            estado: porSolicitud.has(String(s._id)) ? 'ATENDIDA' : 'PENDIENTE',
            soporte_id: porSolicitud.get(String(s._id)) || null
        })) });
    } catch (error) {
        next(error);
    }
});

router.post('/:id/examenes-actualizados', autorizarCaso, soloIps, recibirPdf, async (req, res, next) => {
    if (!mongoose.isValidObjectId(req.body.solicitud_id) || !req.file ||
        req.file.mimetype !== 'application/pdf' ||
        req.file.buffer.subarray(0, 5).toString() !== '%PDF-') {
        return res.status(400).json({ error: 1, response: { mensaje: 'Se requiere solicitud_id y un PDF válido' } });
    }

    let archivo;
    try {
        const solicitud = await Solicitud.findOne({
            _id: req.body.solicitud_id,
            hojaVidaId: req.params.id,
            ipsId: req.soporteUsuario.ipsId
        }).lean();
        if (!solicitud) {
            return res.status(404).json({ error: 1, response: { mensaje: 'Solicitud no encontrada para este aspirante e IPS' } });
        }
        await Soporte.init();
        if (await Soporte.exists({ solicitudId: solicitud._id })) {
            return res.status(409).json({ error: 1, response: { mensaje: 'La solicitud ya tiene un soporte' } });
        }

        const nombreArchivo = `examen_actualizado_${req.params.id}_${randomUUID()}.pdf`;
        archivo = path.join(uploadDir, nombreArchivo);
        await fs.mkdir(uploadDir, { recursive: true });
        await fs.writeFile(archivo, req.file.buffer, { flag: 'wx' });
        const soporte = await Soporte.create({
            hojaVidaId: req.params.id,
            solicitudId: solicitud._id,
            ipsId: req.soporteUsuario.ipsId,
            usuarioId: req.soporteUsuario.id,
            nombreArchivo,
            nombreOriginal: path.basename(req.file.originalname)
        });
        return res.status(201).json({ error: 0, response: presentar(soporte) });
    } catch (error) {
        if (archivo) await fs.unlink(archivo).catch(() => {});
        if (error.code === 11000) {
            return res.status(409).json({ error: 1, response: { mensaje: 'La solicitud ya tiene un soporte' } });
        }
        next(error);
    }
});

router.get('/:id/examenes-actualizados', autorizarCaso, async (req, res, next) => {
    try {
        const filtro = { hojaVidaId: req.params.id };
        if (req.soporteUsuario.esIps) filtro.ipsId = req.soporteUsuario.ipsId;
        const soportes = await Soporte.find(filtro).sort({ createdAt: -1 }).lean();
        res.json({ error: 0, response: soportes.map(presentar) });
    } catch (error) {
        next(error);
    }
});

router.get('/:id/examenes-actualizados/:soporteId/archivo', autorizarCaso, async (req, res, next) => {
    if (!mongoose.isValidObjectId(req.params.soporteId)) {
        return res.status(400).json({ error: 1, response: { mensaje: 'Identificador de soporte inválido' } });
    }

    try {
        const filtro = { _id: req.params.soporteId, hojaVidaId: req.params.id };
        if (req.soporteUsuario.esIps) filtro.ipsId = req.soporteUsuario.ipsId;
        const soporte = await Soporte.findOne(filtro).lean();
        if (!soporte || path.basename(soporte.nombreArchivo) !== soporte.nombreArchivo) {
            return res.status(404).json({ error: 1, response: { mensaje: 'Soporte no encontrado' } });
        }

        res.type('pdf');
        res.sendFile(path.join(uploadDir, soporte.nombreArchivo), error => {
            if (error && !res.headersSent) {
                res.status(error.status || 500).json({ error: 1, response: { mensaje: 'Archivo no disponible' } });
            }
        });
    } catch (error) {
        next(error);
    }
});

module.exports = router;
