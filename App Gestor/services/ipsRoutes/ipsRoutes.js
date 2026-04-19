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

        const { id, ...datosActualizacion } = req.body;

        if (!id) {
            return res.status(400).json({ error: 1, response: { mensaje: 'Se requiere el id de la IPS a actualizar' } });
        }

        // Verificar que la IPS existe
        const ipsExistente = await IPS.findById(id).lean();
        if (!ipsExistente) {
            return res.status(404).json({ error: 1, response: { mensaje: `No se encontró la IPS con id '${id}'` } });
        }

        // Objeto para almacenar los campos a actualizar
        const updateData = {};

        // Validar y procesar NOMBRE_IPS
        if (datosActualizacion.NOMBRE_IPS !== undefined) {
            const nombreTrim = datosActualizacion.NOMBRE_IPS.trim();
            if (nombreTrim !== ipsExistente.NOMBRE_IPS) {
                const existentePorNombre = await IPS.findOne({
                    NOMBRE_IPS: nombreTrim,
                    _id: { $ne: id }
                }).lean();

                if (existentePorNombre) {
                    return res.status(400).json({
                        error: 1,
                        response: { mensaje: `El nombre de IPS '${nombreTrim}' ya está en uso` }
                    });
                }
            }
            updateData.NOMBRE_IPS = nombreTrim;
        }

        // Validar y procesar NIT
        if (datosActualizacion.NIT !== undefined && datosActualizacion.NIT.trim() !== '') {
            const nitTrim = datosActualizacion.NIT.trim();
            if (nitTrim !== ipsExistente.NIT) {
                const existentePorNIT = await IPS.findOne({
                    NIT: nitTrim,
                    _id: { $ne: id }
                }).lean();

                if (existentePorNIT) {
                    return res.status(400).json({
                        error: 1,
                        response: { mensaje: `El NIT '${nitTrim}' ya está registrado` }
                    });
                }
            }
            updateData.NIT = nitTrim;
        }

        // Validar y procesar CORREO
        if (datosActualizacion.CORREO !== undefined && datosActualizacion.CORREO.trim() !== '') {
            const correoTrim = datosActualizacion.CORREO.trim();

            // Validar formato de correo
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(correoTrim)) {
                return res.status(400).json({
                    error: 1,
                    response: { mensaje: 'El formato del correo electrónico no es válido' }
                });
            }

            if (correoTrim !== ipsExistente.CORREO) {
                const existentePorCorreo = await IPS.findOne({
                    CORREO: correoTrim,
                    _id: { $ne: id }
                }).lean();

                if (existentePorCorreo) {
                    return res.status(400).json({
                        error: 1,
                        response: { mensaje: `El correo '${correoTrim}' ya está registrado` }
                    });
                }
            }
            updateData.CORREO = correoTrim;
        }

        // Procesar otros campos (trim si son strings)
        if (datosActualizacion.DIRECCION !== undefined) {
            updateData.DIRECCION = typeof datosActualizacion.DIRECCION === 'string'
                ? datosActualizacion.DIRECCION.trim()
                : datosActualizacion.DIRECCION;
        }
        if (datosActualizacion.TELEFONO !== undefined) {
            updateData.TELEFONO = typeof datosActualizacion.TELEFONO === 'string'
                ? datosActualizacion.TELEFONO.trim()
                : datosActualizacion.TELEFONO;
        }
        if (datosActualizacion.REPRESENTANTE !== undefined) {
            updateData.REPRESENTANTE = typeof datosActualizacion.REPRESENTANTE === 'string'
                ? datosActualizacion.REPRESENTANTE.trim()
                : datosActualizacion.REPRESENTANTE;
        }
        if (datosActualizacion.CIUDAD !== undefined) {
            updateData.CIUDAD = typeof datosActualizacion.CIUDAD === 'string'
                ? datosActualizacion.CIUDAD.trim()
                : datosActualizacion.CIUDAD;
        }
        if (datosActualizacion.DEPARTAMENTO !== undefined) {
            updateData.DEPARTAMENTO = typeof datosActualizacion.DEPARTAMENTO === 'string'
                ? datosActualizacion.DEPARTAMENTO.trim()
                : datosActualizacion.DEPARTAMENTO;
        }
        if (datosActualizacion.REGIONAL !== undefined) {
            updateData.REGIONAL = typeof datosActualizacion.REGIONAL === 'string'
                ? datosActualizacion.REGIONAL.trim()
                : datosActualizacion.REGIONAL;
        }
        if (datosActualizacion.ESTADO !== undefined) {
            updateData.ESTADO = typeof datosActualizacion.ESTADO === 'string'
                ? datosActualizacion.ESTADO.trim()
                : datosActualizacion.ESTADO;
        }
        if (datosActualizacion.COMPLEMENTARIA_1 !== undefined) {
            updateData.COMPLEMENTARIA_1 = datosActualizacion.COMPLEMENTARIA_1;
        }
        if (datosActualizacion.COMPLEMENTARIA_2 !== undefined) {
            updateData.COMPLEMENTARIA_2 = datosActualizacion.COMPLEMENTARIA_2;
        }

        // Actualizar solo si hay campos para actualizar
        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({
                error: 1,
                response: { mensaje: 'No se proporcionaron campos para actualizar' }
            });
        }

        const ipsActualizada = await IPS.findByIdAndUpdate(id, updateData, { new: true }).lean();

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