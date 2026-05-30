const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const IPS = require('../server/models/ips/ips');

router.post('/crearIps', async (req, res) => {
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

        const data = req.body;

        // Validar que se envíen datos
        if (!data || Object.keys(data).length === 0) {
            return res.status(400).json({ 
                error: 1, 
                response: { mensaje: 'No se enviaron datos en el cuerpo de la petición' } 
            });
        }

        // Validar campos obligatorios
        const camposObligatorios = [
            { campo: 'NOMBRE_IPS', nombre: 'Nombre de la IPS' },
            { campo: 'NIT', nombre: 'NIT' },
            { campo: 'DIRECCION', nombre: 'Dirección' },
            { campo: 'TELEFONO', nombre: 'Teléfono' },
            { campo: 'CORREO', nombre: 'Correo electrónico' },
            { campo: 'REPRESENTANTE', nombre: 'Representante legal' },
            { campo: 'CIUDAD', nombre: 'Ciudad' },
            { campo: 'DEPARTAMENTO', nombre: 'Departamento' },
            { campo: 'REGIONAL', nombre: 'Regional' }
        ];

        const camposFaltantes = [];
        for (const { campo, nombre } of camposObligatorios) {
            if (!data[campo] || (typeof data[campo] === 'string' && data[campo].trim() === '')) {
                camposFaltantes.push(nombre);
            }
        }

        if (camposFaltantes.length > 0) {
            return res.status(400).json({
                error: 1,
                response: { 
                    mensaje: `Los siguientes campos son obligatorios: ${camposFaltantes.join(', ')}` 
                }
            });
        }

        // Validar formato de correo electrónico
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(data.CORREO.trim())) {
            return res.status(400).json({
                error: 1,
                response: { mensaje: 'El formato del correo electrónico no es válido' }
            });
        }

        
        // Validar duplicado por NOMBRE_IPS
        const existentePorNombre = await IPS.findOne({ NOMBRE_IPS: data.NOMBRE_IPS.trim() }).lean();
        if (existentePorNombre) {
            return res.status(409).json({
                error: 1,
                response: { mensaje: `La IPS '${data.NOMBRE_IPS}' ya está registrada` }
            });
        }

        // Validar duplicado por NIT (si se proporciona)
        if (data.NIT && data.NIT.trim() !== '') {
            const existentePorNIT = await IPS.findOne({ NIT: data.NIT.trim() }).lean();
            if (existentePorNIT) {
                return res.status(409).json({
                    error: 1,
                    response: { mensaje: `Ya existe una IPS registrada con el NIT '${data.NIT}'` }
                });
            }
        }

        // Validar duplicado por CORREO (si se proporciona)
        if (data.CORREO && data.CORREO.trim() !== '') {
            const existentePorCorreo = await IPS.findOne({ CORREO: data.CORREO.trim() }).lean();
            if (existentePorCorreo) {
                return res.status(409).json({
                    error: 1,
                    response: { mensaje: `Ya existe una IPS registrada con el correo '${data.CORREO}'` }
                });
            }
        }

        
        const nuevaIPS = await IPS.create({
            NOMBRE_IPS: data.NOMBRE_IPS.trim(),
            NIT: data.NIT.trim(),
            DIRECCION: data.DIRECCION.trim(),
            TELEFONO: data.TELEFONO.trim(),
            CORREO: data.CORREO.trim(),
            REPRESENTANTE: data.REPRESENTANTE.trim(),
            CIUDAD: data.CIUDAD.trim(),
            DEPARTAMENTO: data.DEPARTAMENTO.trim(),
            REGIONAL: data.REGIONAL.trim(),
            ESTADO: data.ESTADO ? data.ESTADO.trim() : 'ACTIVA',
            COMPLEMENTARIA_1: data.COMPLEMENTARIA_1 || {},
            COMPLEMENTARIA_2: data.COMPLEMENTARIA_2 || {},
            FECHA_REGISTRO: new Date().toISOString()
        });

        return res.status(201).json({
            error: 0,
            response: {
                mensaje: 'IPS creada exitosamente'
            }
        });

    } catch (err) {
        console.error('Error en /api/ips/crear:', err);
        return res.status(500).json({ error: 1, response: { mensaje: 'Error interno del servidor' } });
    }
});

router.post('/actualizar', async (req, res) => {
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

        const { id, ...updateData } = req.body;

        if (!id) {
            return res.status(400).json({ error: 1, response: { mensaje: 'Se requiere el id de la IPS a actualizar' } });
        }

        
        const ipsActualizada = await IPS.findByIdAndUpdate(id, updateData, { new: true });

        if (!ipsActualizada) {
            return res.status(404).json({ error: 1, response: { mensaje: `No se encontró la IPS con id '${id}'` } });
        }

        return res.status(200).json({
            error: 0,
            response: {
                mensaje: 'IPS actualizada exitosamente',
                ips: ipsActualizada
            }
        });

    } catch (err) {
        console.error('Error en /api/ips/actualizar:', err);
        return res.status(500).json({ error: 1, response: { mensaje: 'Error interno del servidor' } });
    }
});

// Endpoint para consultar todas las IPS
router.get('/consultar', async (req, res) => {
    try {
        // Validar token
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

        // Consultar todas las IPS
        const ips = await IPS.find({}).sort({ FECHA_REGISTRO: -1 }).lean();

        return res.status(200).json({
            error: 0,
            response: {
                mensaje: `Se encontraron ${ips.length} IPS registradas`,
                total: ips.length,
                ips: ips
            }
        });

    } catch (err) {
        console.error('Error en /api/ips/consultar:', err);
        return res.status(500).json({ error: 1, response: { mensaje: 'Error interno del servidor' } });
    }
});

module.exports = router;