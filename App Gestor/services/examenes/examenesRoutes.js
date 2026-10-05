const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const Examen = require('../server/models/examenes/examenes');

const router = express.Router();

const ESTADOS_VALIDOS = ['ACTIVO', 'INACTIVO'];

router.post('/crear', async (req, res) => {
    try {
        const authHeader = req.headers['authorization'] || req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 1, response: { mensaje: 'Token requerido' } });
        }
        const token = authHeader.substring(7);
        const secret = process.env.JWT_SECRET;
        if (!secret) {
            return res.status(500).json({ error: 1, response: { mensaje: 'Servidor sin JWT_SECRET configurado' } });
        }
        let decoded;
        try {
            decoded = jwt.verify(token, secret);
        } catch (e) {
            return res.status(401).json({ error: 1, response: { mensaje: 'Token inválido o expirado' } });
        }

        const { nombre, descripcion, estado } = req.body || {};

        const nombreLimpio = typeof nombre === 'string' ? nombre.trim() : '';
        if (!nombreLimpio) {
            return res.status(400).json({ error: 1, response: { mensaje: 'El nombre del examen es obligatorio' } });
        }
        if (nombreLimpio.length > 100) {
            return res.status(400).json({ error: 1, response: { mensaje: 'El nombre del examen no puede superar los 100 caracteres' } });
        }

        let descripcionLimpia = '';
        if (descripcion !== undefined && descripcion !== null) {
            if (typeof descripcion !== 'string') {
                return res.status(400).json({ error: 1, response: { mensaje: 'La descripción debe ser un texto' } });
            }
            descripcionLimpia = descripcion.trim();
            if (descripcionLimpia.length > 500) {
                return res.status(400).json({ error: 1, response: { mensaje: 'La descripción no puede superar los 500 caracteres' } });
            }
        }

        let estadoFinal = 'ACTIVO';
        if (estado !== undefined && estado !== null && estado !== '') {
            if (typeof estado !== 'string' || !ESTADOS_VALIDOS.includes(estado.trim().toUpperCase())) {
                return res.status(400).json({ error: 1, response: { mensaje: 'El estado debe ser ACTIVO o INACTIVO' } });
            }
            estadoFinal = estado.trim().toUpperCase();
        }

        const examenDuplicado = await Examen
            .findOne({ NOMBRE: nombreLimpio })
            .collation({ locale: 'en', strength: 2 })
            .lean();

        if (examenDuplicado) {
            return res.status(409).json({ error: 1, response: { mensaje: `Ya existe un examen con el nombre '${nombreLimpio}'` } });
        }

        const usuarioCreacion = decoded && mongoose.Types.ObjectId.isValid(decoded.userId) ? decoded.userId : null;

        const examenDoc = await Examen.create({
            NOMBRE: nombreLimpio,
            DESCRIPCION: descripcionLimpia,
            ESTADO: estadoFinal,
            USUARIO_CREACION: usuarioCreacion
        });

        return res.status(201).json({
            error: 0,
            response: {
                mensaje: 'Examen creado exitosamente',
                examen: {
                    id: examenDoc._id,
                    NOMBRE: examenDoc.NOMBRE,
                    DESCRIPCION: examenDoc.DESCRIPCION,
                    ESTADO: examenDoc.ESTADO,
                    createdAt: examenDoc.createdAt
                }
            }
        });
    } catch (err) {
        console.error('Error en /api/examenes/crear:', err);
        return res.status(500).json({ error: 1, response: { mensaje: 'Error interno del servidor' } });
    }
});

// Endpoint para consultar todos los exámenes
router.get('/consultar', async (req, res) => {
    try {
        const authHeader = req.headers['authorization'] || req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 1, response: { mensaje: 'Token requerido' } });
        }
        const token = authHeader.substring(7);
        const secret = process.env.JWT_SECRET;
        if (!secret) {
            return res.status(500).json({ error: 1, response: { mensaje: 'Servidor sin JWT_SECRET configurado' } });
        }
        try {
            jwt.verify(token, secret);
        } catch (e) {
            return res.status(401).json({ error: 1, response: { mensaje: 'Token inválido o expirado' } });
        }

        // Con .lean() no aplica el toJSON de User: limitar campos para no exponer Cr_Password
        const examenes = await Examen.find({})
            .populate('USUARIO_CREACION', 'Cr_Nombre_Usuario Cr_Perfil')
            .sort({ createdAt: -1 })
            .lean();

        return res.status(200).json({
            error: 0,
            response: {
                mensaje: `Se encontraron ${examenes.length} exámenes registrados`,
                total: examenes.length,
                examenes
            }
        });
    } catch (err) {
        console.error('Error en /api/examenes/consultar:', err);
        return res.status(500).json({ error: 1, response: { mensaje: 'Error interno del servidor' } });
    }
});

// Endpoint para actualizar solo el estado de un examen
router.put('/actualizar-estado', async (req, res) => {
    try {
        const authHeader = req.headers['authorization'] || req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 1, response: { mensaje: 'Token requerido' } });
        }
        const token = authHeader.substring(7);
        const secret = process.env.JWT_SECRET;
        if (!secret) {
            return res.status(500).json({ error: 1, response: { mensaje: 'Servidor sin JWT_SECRET configurado' } });
        }
        try {
            jwt.verify(token, secret);
        } catch (e) {
            return res.status(401).json({ error: 1, response: { mensaje: 'Token inválido o expirado' } });
        }

        // Solo se leen id y estado; cualquier otro campo del body se ignora
        const { id, estado: estadoRaw } = req.body || {};

        if (!id) {
            return res.status(400).json({ error: 1, response: { mensaje: 'El id del examen es obligatorio' } });
        }
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ error: 1, response: { mensaje: 'El id del examen no es válido' } });
        }

        const estado = typeof estadoRaw === 'string' ? estadoRaw.trim().toUpperCase() : '';
        if (!estado) {
            return res.status(400).json({ error: 1, response: { mensaje: 'El estado es obligatorio' } });
        }
        if (!ESTADOS_VALIDOS.includes(estado)) {
            return res.status(400).json({ error: 1, response: { mensaje: 'El estado debe ser ACTIVO o INACTIVO' } });
        }

        const examen = await Examen.findById(id).lean();
        if (!examen) {
            return res.status(404).json({ error: 1, response: { mensaje: 'No se encontró el examen' } });
        }

        if (examen.ESTADO === estado) {
            return res.status(200).json({
                error: 0,
                response: {
                    mensaje: `El examen ya se encuentra en estado ${estado}`,
                    examen: {
                        id: examen._id,
                        NOMBRE: examen.NOMBRE,
                        ESTADO: examen.ESTADO,
                        updatedAt: examen.updatedAt
                    }
                }
            });
        }

        const examenActualizado = await Examen.findByIdAndUpdate(
            id,
            { $set: { ESTADO: estado } },
            { new: true, runValidators: true }
        ).lean();

        if (!examenActualizado) {
            return res.status(404).json({ error: 1, response: { mensaje: 'No se encontró el examen' } });
        }

        return res.status(200).json({
            error: 0,
            response: {
                mensaje: `Estado actualizado a ${estado} correctamente`,
                examen: {
                    id: examenActualizado._id,
                    NOMBRE: examenActualizado.NOMBRE,
                    ESTADO: examenActualizado.ESTADO,
                    updatedAt: examenActualizado.updatedAt
                }
            }
        });
    } catch (err) {
        console.error('Error en /api/examenes/actualizar-estado:', err);
        return res.status(500).json({ error: 1, response: { mensaje: 'Error interno del servidor' } });
    }
});

module.exports = router;
