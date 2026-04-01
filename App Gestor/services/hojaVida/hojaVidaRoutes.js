const express = require('express');
const jwt = require('jsonwebtoken');
const HojaVida = require('../server/models/hojaVida/hojaVida');
const User = require('../server/models/user/user');
const IPS = require('../server/models/ips/ips');
const Permiso = require('../server/models/permiso/permiso');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const storage = multer.memoryStorage();
const upload =  multer({
    storage,
    fileFilter: (req, file, cb) => {
        if (file.mimetype !== 'application/pdf') {
            return cb(new Error('Solo se permiten archivos PDF'));
        }
        cb(null, true);
    },
    limits: { fileSize: 40 * 1024 * 1024 } 
});



const router = express.Router();

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
        try {
            jwt.verify(token, secret);
        } catch (e) {
            return res.status(401).json({ error: 1, response: { mensaje: 'Token inválido o expirado' } });
        }

        const data = req.body;

        const hojasVida = Array.isArray(data) ? data : [data];

        if (hojasVida.length === 0) {
            return res.status(400).json({ error: 1, response: { mensaje: 'No se enviaron datos de hojas de vida' } });
        }

        const documentosEnviados = hojasVida
            .map(hoja => hoja.DOCUMENTO)
            .filter(doc => doc !== null && doc !== undefined && String(doc).trim() !== '')
            .map(doc => String(doc).trim());

        if (documentosEnviados.length === 0) {
            return res.status(400).json({ error: 1, response: { mensaje: 'No se encontraron documentos válidos en los datos enviados' } });
        }

        const documentosExistentes = await HojaVida.find({
            DOCUMENTO: { $in: documentosEnviados }
        }).select('DOCUMENTO NOMBRE PRIMER_APELLIDO').lean();

        if (documentosExistentes.length > 0) {
            const documentosDuplicados = documentosExistentes.map(doc => ({
                documento: doc.DOCUMENTO,
                nombre: `${doc.NOMBRE || ''} ${doc.PRIMER_APELLIDO || ''}`.trim()
            }));

            return res.status(409).json({
                error: 1,
                response: {
                    mensaje: 'Se encontraron documentos ya registrados',
                    documentos_duplicados: documentosDuplicados,
                    total_duplicados: documentosDuplicados.length
                }
            });
        }

        const documentosUnicos = new Set();
        const duplicadosInternos = [];

        for (const hoja of hojasVida) {
            if (hoja.DOCUMENTO !== null && hoja.DOCUMENTO !== undefined && String(hoja.DOCUMENTO).trim() !== '') {
                const doc = String(hoja.DOCUMENTO).trim();
                if (documentosUnicos.has(doc)) {
                    duplicadosInternos.push({
                        documento: doc,
                        nombre: `${hoja.NOMBRE || ''} ${hoja.PRIMER_APELLIDO || ''}`.trim()
                    });
                } else {
                    documentosUnicos.add(doc);
                }
            }
        }

        if (duplicadosInternos.length > 0) {
            return res.status(400).json({
                error: 1,
                response: {
                    mensaje: 'Se encontraron documentos duplicados en el mismo envío',
                    documentos_duplicados_internos: duplicadosInternos,
                    total_duplicados: duplicadosInternos.length
                }
            });
        }

        const resultados = [];
        for (const hojaData of hojasVida) {
            if (hojaData.ESTADO_NOTIFICACION === undefined) {
                hojaData.ESTADO_NOTIFICACION = null;
            }
            if (hojaData.H_ESTADO_NOTIFICACION_CONSENTIMIENTO === undefined) {
                hojaData.H_ESTADO_NOTIFICACION_CONSENTIMIENTO = null;
            }

            const hojaVidaDoc = await HojaVida.create(hojaData);
            resultados.push({
                id: hojaVidaDoc._id,
                DOCUMENTO: hojaData.DOCUMENTO,
                NOMBRE: hojaData.NOMBRE
            });
        }

        return res.status(201).json({
            error: 0,
            response: {
                mensaje: `${resultados.length} hoja(s) de vida guardada(s) exitosamente`,
                hojas_vida: resultados
            }
        });
    } catch (err) {
        console.error('Error en /api/hojas-vida/crear:', err);
        return res.status(500).json({ error: 1, response: { mensaje: 'Error interno del servidor' } });
    }
});

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

        // Filtrar solo registros que NO tengan IPS_ID (null, undefined o no existe el campo)
        const hojasVida = await HojaVida.find({
            $or: [
                { IPS_ID: { $exists: false } },
                { IPS_ID: null },
                { IPS_ID: undefined }
            ]
        }).lean();

        return res.status(200).json({
            error: 0,
            response: {
                mensaje: `Se encontraron ${hojasVida.length} hoja(s) de vida`,
                total_registros: hojasVida.length,
                hojas_vida: hojasVida
            }
        });
    } catch (err) {
        console.error('Error en /api/hojas-vida/consultar:', err);
        return res.status(500).json({ error: 1, response: { mensaje: 'Error interno del servidor' } });
    }
});

router.get('/', async (req, res) => {
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

        
        const hojasVida = await HojaVida.find({}).lean();

        return res.status(200).json({
            error: 0,
            response: {
                mensaje: 'Consulta exitosa - Todas las hojas de vida',
                data: hojasVida,
                total: hojasVida.length
            }
        });

    } catch (err) {
        console.error('Error en /api/hoja_vida:', err);
        return res.status(500).json({
            error: 1,
            response: { mensaje: 'Error inesperado' }
        });
    }
});


router.get('/hojas-vida-full', async (req, res) => {
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

        const hojasVida = await HojaVida
            .find({})
            .populate('IPS_ID')
            .lean();

        const data = await Promise.all(
            hojasVida.map(async (hv) => {
                let result = hv;

                // Adjuntar datos completos de IPS bajo clave 'IPS'
                if (hv && hv.IPS_ID && typeof hv.IPS_ID === 'object') {
                    result = { ...result, IPS: hv.IPS_ID };
                }

                // Cruce USUARIO_SIC -> cl_credencial (User) para obtener Cr_Pe_Codigo
                // Luego usar Cr_Pe_Codigo -> cl_permisos para traer solo nombre/apellidos
                const usuarioSic = hv?.USUARIO_SIC ? String(hv.USUARIO_SIC).trim() : '';
                if (usuarioSic && usuarioSic.length === 24) {
                    try {
                        const cred = await User.findById(usuarioSic).select('Cr_Pe_Codigo').lean();
                        const permisoId = cred?.Cr_Pe_Codigo || null;
                        if (permisoId) {
                            const permiso = await Permiso
                                .findById(permisoId)
                                .select('Pe_Nombre Pe_Apellido Pe_Seg_Apellido')
                                .lean();

                            result = {
                                ...result,
                                Cr_Pe_Codigo: permisoId,
                                PERMISO_USUARIO_SIC: permiso || null
                            };
                        }
                    } catch (e) {
                        // Silenciar errores por registro individual para no romper la respuesta completa
                    }
                }

                return result;
            })
        );

        return res.status(200).json({
            error: 0,
            response: {
                mensaje: 'Consulta exitosa - Todas las hojas de vida',
                data,
                total: data.length
            }
        });

    } catch (err) {
        console.error('Error en /api/hojas-vida/hojas-vida-full:', err);
        return res.status(500).json({
            error: 1,
            response: { mensaje: 'Error inesperado' }
        });
    }
});


router.get('/hojas-vida-full', async (req, res) => {
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

        const hojasVida = await HojaVida
            .find({})
            .populate('IPS_ID')
            .lean();

        const data = await Promise.all(
            hojasVida.map(async (hv) => {
                let result = hv;

                // Adjuntar datos completos de IPS bajo clave 'IPS'
                if (hv && hv.IPS_ID && typeof hv.IPS_ID === 'object') {
                    result = { ...result, IPS: hv.IPS_ID };
                }

                // Cruce USUARIO_SIC -> cl_credencial (User) para obtener Cr_Pe_Codigo
                // Luego usar Cr_Pe_Codigo -> cl_permisos para traer solo nombre/apellidos
                const usuarioSic = hv?.USUARIO_SIC ? String(hv.USUARIO_SIC).trim() : '';
                if (usuarioSic && usuarioSic.length === 24) {
                    try {
                        const cred = await User.findById(usuarioSic).select('Cr_Pe_Codigo').lean();
                        const permisoId = cred?.Cr_Pe_Codigo || null;
                        if (permisoId) {
                            const permiso = await Permiso
                                .findById(permisoId)
                                .select('Pe_Nombre Pe_Apellido Pe_Seg_Apellido')
                                .lean();

                            result = {
                                ...result,
                                Cr_Pe_Codigo: permisoId,
                                PERMISO_USUARIO_SIC: permiso || null
                            };
                        }
                    } catch (e) {
                        // Silenciar errores por registro individual para no romper la respuesta completa
                    }
                }

                return result;
            })
        );

        return res.status(200).json({
            error: 0,
            response: {
                mensaje: 'Consulta exitosa - Todas las hojas de vida',
                data,
                total: data.length
            }
        });

    } catch (err) {
        console.error('Error en /api/hojas-vida/hojas-vida-full:', err);
        return res.status(500).json({
            error: 1,
            response: { mensaje: 'Error inesperado' }
        });
    }
});

router.post('/por_ips', async (req, res) => {
    try {

        const { ips_id } = req.body;

        
        const authHeader = req.headers['authorization'] || req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 1, response: { mensaje: 'Token Bearer requerido' } });
        }

        const token = authHeader.substring(7); // Remover 'Bearer '

        const secret = process.env.JWT_SECRET;
        if (!secret) {
            return res.status(500).json({ error: 1, response: { mensaje: 'Servidor sin JWT_SECRET configurado' } });
        }

        try {
            jwt.verify(token, secret);
        } catch (e) {
            return res.status(401).json({ error: 1, response: { mensaje: 'Token inválido o expirado' } });
        }

        if (!ips_id || ips_id.trim() === '') {
            return res.status(400).json({ error: 1, response: { mensaje: 'Se debe enviar el ID de la IPS' } });
        }

        
        const ips = await IPS.findById(ips_id).lean();
        if (!ips) {
            return res.status(404).json({
                error: 1,
                response: { mensaje: `No se encontró la IPS con ID '${ips_id}' o no tiene registros asociados` }
            });
        }

        const hojasVida = await HojaVida.find({ IPS_ID: ips._id }).lean();

        if (hojasVida.length === 0) {
            return res.status(404).json({
                error: 1,
                response: { mensaje: `No existen hojas de vida asociadas a la IPS '${ips.NOMBRE_IPS}'` }
            });
        }


        const data = hojasVida.map(hv => ({
            ...hv, 
            NOMBREIPS: ips.NOMBRE_IPS 
        }));

        return res.status(200).json({
            error: 0,
            response: {
                mensaje: `Hojas de vida de la IPS: ${ips.NOMBRE_IPS}`,
                total: hojasVida.length,
                data
            }
        });

    } catch (err) {
        console.error('Error en /api/hoja_vida/por_ips:', err);
        return res.status(500).json({ error: 1, response: { mensaje: 'Error interno del servidor' } });
    }
});
router.post('/por_documento', async (req, res) => {
    try {
        const { documento, codigo_inscripcion } = req.body;

        const documentoTrim = typeof documento === 'string' ? documento.trim() : '';
        const codigoTrim = typeof codigo_inscripcion === 'string' ? codigo_inscripcion.trim() : '';

        if (!documentoTrim && !codigoTrim) {
            return res.status(400).json({
                error: 1,
                response: { mensaje: 'Debe enviar "documento" o "codigo_inscripcion"' }
            });
        }

        const query = {};
        if (documentoTrim) query.DOCUMENTO = documentoTrim;
        if (codigoTrim) query.CODIGO_INSCRIPCION = codigoTrim;

        const hojaVida = await HojaVida
            .findOne(query)
            .populate('IPS_ID')
            .lean();

        if (!hojaVida) {
            const criterios = [
                documentoTrim ? `DOCUMENTO='${documentoTrim}'` : null,
                codigoTrim ? `CODIGO_INSCRIPCION='${codigoTrim}'` : null
            ].filter(Boolean).join(' y ');

            return res.status(404).json({
                error: 1,
                response: { mensaje: `No se encontró hoja de vida por ${criterios}` }
            });
        }

        return res.status(200).json({
            error: 0,
            response: {
                mensaje: 'Consulta exitosa - Hoja de vida completa',
                data: hojaVida
            }
        });

    } catch (err) {
        console.error('Error en /api/hojas-vida/por_documento:', err);
        return res.status(500).json({ error: 1, response: { mensaje: 'Error interno del servidor' } });
    }
});

router.put('/agendar', async (req, res) => {
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

        const { hojaVidaId, fecha_hora, examenes, recomendaciones, usuario_id, ips_id } = req.body;

        if (!hojaVidaId || !fecha_hora || !examenes || !recomendaciones || !usuario_id || !ips_id) {
            return res.status(400).json({ error: 1, response: { mensaje: 'Todos los campos son requeridos: hojaVidaId, fecha_hora, examenes, recomendaciones, usuario_id, ips_id' } });
        }

        
        const ips = await IPS.findById(ips_id);
        if (!ips) {
            return res.status(404).json({ error: 1, response: { mensaje: `No se encontró la IPS con id '${ips_id}'` } });
        }

        
        const fechaHoraDate = new Date(fecha_hora);
        if (isNaN(fechaHoraDate.getTime())) {
            return res.status(400).json({ error: 1, response: { mensaje: 'Formato de fecha_hora inválido. Use formato ISO: YYYY-MM-DDTHH:mm' } });
        }

        const hojaActualizada = await HojaVida.findByIdAndUpdate(
            hojaVidaId,
            {
                IPS_ID: ips_id,
                FECHA_HORA: fechaHoraDate,
                EXAMENES: examenes,
                RECOMENDACIONES: recomendaciones,
                USUARIO_ID: usuario_id,
                ESTADO: 'EN ESPERA'
            },
            { new: true }
        );

        if (!hojaActualizada) {
            return res.status(404).json({ error: 1, response: { mensaje: `No se encontró la hoja de vida con id '${hojaVidaId}'` } });
        }

        return res.status(200).json({
            error: 0,
            response: {
                mensaje: 'Agendamiento actualizado correctamente',
                id: hojaActualizada._id
            }
        });

    } catch (err) {
        console.error('Error en /api/hoja_vida/agendar:', err);
        return res.status(500).json({ error: 1, response: { mensaje: 'Error inesperado al actualizar el documento' } });
    }
});


router.get('/con-ips', async (req, res) => {
    try {
        
        const hojasVidaConIps = await HojaVida.find({
            IPS_ID: { $exists: true, $ne: null },
            ESTADO: 'EN ESPERA'
        }).populate('IPS_ID').lean();

        return res.status(200).json({
            error: 0,
            response: {
                mensaje: `Se encontraron ${hojasVidaConIps.length} hoja(s) de vida con IPS asignada y estado EN ESPERA`,
                total_registros: hojasVidaConIps.length,
                hojas_vida: hojasVidaConIps
            }
        });

    } catch (err) {
        console.error('Error en /api/hojas-vida/con-ips:', err);
        return res.status(500).json({ error: 1, response: { mensaje: 'Error interno del servidor' } });
    }
});


router.put('/:hojaVidaId/estado', async (req, res) => {
    try {
        const { hojaVidaId } = req.params;
        const { estado, detalle } = req.body;

        
        if (!estado) {
            return res.status(400).json({
                error: 1,
                response: { mensaje: 'El campo estado es requerido' }
            });
        }

        
        if (!hojaVidaId || hojaVidaId.length !== 24) {
            return res.status(400).json({
                error: 1,
                response: { mensaje: 'ID de hoja de vida inválido' }
            });
        }

        
        const hojaVida = await HojaVida.findById(hojaVidaId);
        if (!hojaVida) {
            return res.status(404).json({
                error: 1,
                response: { mensaje: 'Hoja de vida no encontrada' }
            });
        }

        
        const updateData = { ESTADO: estado };
        if (detalle !== undefined) {
            updateData.DETALLE = detalle;
        }

        const hojaActualizada = await HojaVida.findByIdAndUpdate(
            hojaVidaId,
            updateData,
            { new: true }
        );

        return res.status(200).json({
            error: 0,
            response: {
                mensaje: 'Estado actualizado correctamente',
                data: {
                    id: hojaActualizada._id,
                    estado: hojaActualizada.ESTADO,
                    detalle: hojaActualizada.DETALLE || null
                }
            }
        });

    } catch (err) {
        console.error('Error en PUT /:hojaVidaId/estado:', err);
        return res.status(500).json({
            error: 1,
            response: { mensaje: 'Error interno del servidor' }
        });
    }
});


router.get('/bot/procesados', async (req, res) => {
    try {
        
        const registrosProcesados = await HojaVida.find({
            DETALLE: {
                $exists: true,
                $ne: null,
                $regex: /PROCESADO_.*WhatsApp.*Email.*/i
            }
        }).lean();

        return res.status(200).json({
            error: 0,
            response: {
                mensaje: `Se encontraron ${registrosProcesados.length} registro(s) procesado(s)`,
                data: registrosProcesados.length
            }
        });

    } catch (err) {
        console.error('Error en /api/hojas-vida/bot/procesados:', err);
        return res.status(500).json({
            error: 1,
            response: { mensaje: 'Error interno del servidor' }
        });
    }
});

router.post('/notificaciones_pendientes', async (req, res) => {
    try {
        
        const notificaciones = await HojaVida.find(
            { ESTADO_NOTIFICACION: "SIN GESTION" },
            { TEXT_NOTIFICACION: 1, ESTADO_NOTIFICACION: 1 } 
        );

        return res.status(200).json({
            error: 0,
            response: {
                mensaje: "Consulta exitosa",
                notificaciones
            }
        });

    } catch (err) {
        console.error("Error en /notificaciones_pendientes:", err);

        return res.status(500).json({
            error: 1,
            response: {
                mensaje: "Error inesperado"
            }
        });
    }
});

router.post('/por_usuario_sic', async (req, res) => {
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

        const { USUARIO_SIC } = req.body;
        if (!USUARIO_SIC) {
            return res.status(400).json({
                error: 1,
                response: { mensaje: 'Falta el campo USUARIO_SIC' }
            });
        }

        const hojasVida = await HojaVida
            .find({ USUARIO_SIC })
            .populate('IPS_ID')
            .populate('USUARIO_ID')
            .lean();

        return res.status(200).json({
            error: 0,
            response: {
                mensaje: 'Consulta exitosa - Hojas de vida por USUARIO_SIC',
                data: hojasVida,
                total: hojasVida.length
            }
        });

    } catch (err) {
        console.error('Error en /api/hojas-vida/por_usuario_sic (POST):', err);
        return res.status(500).json({
            error: 1,
            response: { mensaje: 'Error inesperado' }
        });
    }
});

router.post('/casos_disponibles', async (req, res) => {
    try {
        const { token } = req.body;

        if (!token) {
            return res.status(400).json({
                error: 1, 
                response: { mensaje: "Token requerido" }
            });
        }

        
        const secret = process.env.JWT_SECRET;
        try {
            jwt.verify(token, secret);
        } catch (e) {
            return res.status(401).json({
                error: 1,
                response: { mensaje: "Token inválido o expirado" }
            });
        }

        
        const casos = await HojaVida.find({
            $or: [
                { USUARIO_SIC: { $exists: false } },
                { USUARIO_SIC: null },
                { USUARIO_SIC: "" }
            ]
        });

        if (!casos.length) {
            return res.status(200).json({
                error: 0,
                response: {
                    mensaje: "No hay casos disponibles",
                    casos: []
                }
            });
        }

        
        const resultados = [];
        for (const caso of casos) {
            const permiso = await Permiso.findOne({
                Pe_Documento: caso.DOCUMENTO
            });

            resultados.push({
                hoja_vida: caso,
                permisos: permiso || null
            });
        }

        return res.status(200).json({
            error: 0,
            response: {
                mensaje: "Consulta exitosa",
                casos: resultados
            }
        });

    } catch (err) {
        console.error("Error en /api/hoja_vida/casos_disponibles:", err);
        return res.status(500).json({
            error: 1,
            response: { mensaje: "Error inesperado" }
        });
    }
});

router.put('/asignar_psicologo', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        const tokenFromHeader = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
        const { id, token: tokenFromBody, USUARIO_SIC } = req.body;
        const token = tokenFromBody || tokenFromHeader;

        if (!id || !token || !USUARIO_SIC) {
            return res.status(400).json({
                error: 1,
                response: { mensaje: "Faltan parámetros requeridos" }
            });
        }

        const secret = process.env.JWT_SECRET;
        if (!secret) {
            return res.status(500).json({
                error: 1,
                response: { mensaje: "Servidor sin JWT_SECRET configurado" }
            });
        }

        try {
            jwt.verify(token, secret);
        } catch (e) {
            return res.status(401).json({
                error: 1,
                response: { mensaje: "Token inválido o expirado" }
            });
        }

        const update = await HojaVida.findByIdAndUpdate(
            id,
            {
                USUARIO_SIC,
                ESTADO_NOTIFICACION: "TOMADO POR PSICOLOGIA"
            },
            { new: true, runValidators: true }
        );

        if (!update) {
            return res.status(404).json({
                error: 1,
                response: { mensaje: "No se encontró el caso" }
            });
        }

        return res.status(200).json({
            error: 0,
            response: {
                mensaje: "Psicólogo asignado correctamente",
                id: update._id
            }
        });
    } catch (err) {
        console.error('Error en /api/hoja_vida/asignar_psicologo:', err);
        return res.status(500).json({
            error: 1,
            response: { mensaje: "Error inesperado" }
        });
    }
});

router.post('/caso_disponible', async (req, res) => {
    try {
        const { token } = req.body;

        if (!token) {
            return res.status(400).json({
                error: 1,
                response: { mensaje: "Falta el token" }
            });
        }

        
        const secret = process.env.JWT_SECRET;
        if (!secret) {
            return res.status(500).json({
                error: 1,
                response: { mensaje: "Servidor sin JWT_SECRET configurado" }
            });
        }

        try {
            jwt.verify(token, secret);
        } catch (e) {
            return res.status(401).json({
                error: 1,
                response: { mensaje: "Token inválido o expirado" }
            });
        }

        
        const caso = await HojaVida.findOne(
            {
                $or: [
                    { USUARIO_SIC: { $exists: false } },
                    { USUARIO_SIC: null },
                    { USUARIO_SIC: "" }
                ]
            },
            {
                DOCUMENTO: 1,
                NOMBRE: 1,
                TEXT_NOTIFICACION: 1
            }
        ).sort({ createdAt: 1 }); 

        if (!caso) {
            return res.status(404).json({
                error: 1,
                response: { mensaje: "No hay casos disponibles" }
            });
        }

        return res.status(200).json({
            error: 0,
            response: {
                mensaje: "Caso disponible encontrado",
                caso
            }
        });

    } catch (err) {
        console.error('Error en /api/hoja_vida/caso_disponible:', err);
        return res.status(500).json({
            error: 1,
            response: { mensaje: "Error inesperado" }
        });
    }
});

router.get('/sin_usuario_sic', async (req, res) => {
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

       
        const registros = await HojaVida.find({
            $or: [
                { USUARIO_SIC: null },
                { USUARIO_SIC: "" },
                { USUARIO_SIC: { $exists: false } }
            ]
        }).lean();

        if (!registros || registros.length === 0) {
            return res.status(200).json({
                error: 1,
                response: {
                    mensaje: 'No existen registros sin USUARIO_SIC'
                }
            });
        }

       
        return res.status(200).json({
            error: 0,
            response: {
                mensaje: 'Consulta exitosa',
                data: registros,
                total: registros.length
            }
        });

    } catch (err) {
        console.error('Error en /api/hoja_vida/sin_usuario_sic:', err);
        return res.status(500).json({
            error: 1,
            response: { mensaje: 'Error inesperado' }
        });
    }
});

router.put('/estado_notificacion/gestionar', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;

        // Validar cabecera con token
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                error: 1,
                response: {
                    mensaje: "Token inválido o no proporcionado"
                }
            });
        }

        const token = authHeader.split(' ')[1];
        const { id } = req.body;

        // Validar que el ID venga en el body
        if (!id) {
            return res.status(400).json({
                error: 1,
                response: {
                    mensaje: "Debe enviar el ID del caso"
                }
            });
        }

        // Validar token JWT
        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET);
        } catch (err) {
            return res.status(401).json({
                error: 1,
                response: {
                    mensaje: "Token inválido o expirado"
                }
            });
        }

        // Actualizar estado
        const update = {
            ESTADO_NOTIFICACION: "GESTIONANDO NOTIFICACION",
            H_ESTADO_NOTIFICACION_CONSENTIMIENTO: "SIN GESTION"
        };

        const hojaVida = await HojaVida.findByIdAndUpdate(id, update, {
            new: true
        });

        if (!hojaVida) {
            return res.status(404).json({
                error: 1,
                response: {
                    mensaje: "No se encontró el caso con ese ID"
                }
            });
        }

        return res.json({
            error: 0,
            response: {
                mensaje: "Estado actualizado correctamente",
                id: hojaVida._id
            }
        });

    } catch (err) {
        console.error("Error inesperado:", err);
        return res.status(500).json({
            error: 1,
            response: {
                mensaje: "Error inesperado"
            }
        });
    }
});


router.put('/notificacion/gestionar', async (req, res) => {
    try {
        
        
        // Leer el ID desde el body
        const { id } = req.body;

        if (!id) {
            return res.json({
                error: 1,
                response: { mensaje: "El ID del caso es obligatorio" }
            });
        }

        
        const actualizado = await HojaVida.findByIdAndUpdate(
            id,
            {
                H_ESTADO_NOTIFICACION_CONSENTIMIENTO: "GESTIONADO",
                ESTADO_NOTIFICACION: "GESTIONADO",
                ESTADO: "Notificado Consentimiento"
            },
            { new: true }
        );

        if (!actualizado) {
            return res.json({
                error: 1,
                response: { mensaje: "Error al actualizar el documento: no encontrado" }
            });
        }

        
        return res.json({
            error: 0,
            response: {
                mensaje: "Estados actualizados correctamente",
                id
            }
        });

    } catch (error) {
        return res.json({
            error: 1,
            response: { mensaje: "Error inesperado", detalle: error.message }
        });
    }
});

router.put('/reunion/gestionar', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                error: 1,
                response: { mensaje: 'Token inválido o no proporcionado' }
            });
        }

        const token = authHeader.split(' ')[1];
        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET);
        } catch (err) {
            return res.status(401).json({
                error: 1,
                response: { mensaje: 'Token inválido o expirado' }
            });
        }

        const { id_caso, id_usuario, fecha_hora, tipo_reunion, detalle_reunion } = req.body;

        if (!id_caso || !id_usuario) {
            return res.status(400).json({
                error: 1,
                response: { mensaje: 'Debe enviar id_caso e id_usuario' }
            });
        }

        const usuario = await User.findById(id_usuario).lean();
        if (!usuario) {
            return res.status(404).json({
                error: 1,
                response: { mensaje: 'Usuario no encontrado' }
            });
        }

        let fechaValida = null;
        if (fecha_hora) {
            const f = new Date(fecha_hora);
            if (isNaN(f.getTime())) {
                return res.status(400).json({
                    error: 1,
                    response: { mensaje: 'fecha_hora inválida' }
                });
            }
            fechaValida = f;
        }

        const update = {};
        update.USUARIO_ID = id_usuario;
        if (fechaValida) update.FECHA_HORA_CITA_PSICOLOGIA = fechaValida;
        if (typeof tipo_reunion === 'string') update.TIPO_REUNION = tipo_reunion;
        if (typeof detalle_reunion === 'string') update.DETALLE_REUNION = detalle_reunion;

        let hojaVida = await HojaVida.findByIdAndUpdate(id_caso, update, { new: true });

        if (!hojaVida) {
            hojaVida = await HojaVida.create({
                USUARIO_ID: id_usuario,
                FECHA_HORA_CITA_PSICOLOGIA: fechaValida || undefined,
                TIPO_REUNION: typeof tipo_reunion === 'string' ? tipo_reunion : undefined,
                DETALLE_REUNION: typeof detalle_reunion === 'string' ? detalle_reunion : undefined
            });
        }

        return res.status(200).json({
            error: 0,
            response: {
                mensaje: 'Registro actualizado correctamente',
                id: hojaVida._id
            }
        });

    } catch (err) {
        return res.status(500).json({
            error: 1,
            response: { mensaje: 'Error inesperado' }
        });
    }
});


router.post('/consulta_por_documento_completa', async (req, res) => {
    try {
        const { documento } = req.body;

        
        if (!documento) {
            return res.json({
                error: 1,
                response: {
                    mensaje: "El documento es obligatorio"
                }
            });
        }

       
        const hojaVida = await HojaVida.findOne({ DOCUMENTO: documento });

        if (!hojaVida) {
            return res.json({
                error: 1,
                response: {
                    mensaje: "Documento no encontrado"
                }
            });
        }

       
        return res.json({
            error: 0,
            response: {
                mensaje: "Consulta exitosa",
                data: hojaVida
            }
        });

    } catch (error) {
        console.error("Error inesperado:", error);

        return res.json({
            error: 1,
            response: {
                mensaje: "Error inesperado",
                detalle: error.message
            }
        });
    }
});

router.put('/notificacion/recibida', upload.single('pdf'), async (req, res) => {
    try {
        const { _id } = req.body;

        if (!_id || !req.file) {
            return res.status(400).json({
                error: 1,
                response: { mensaje: "Faltan parámetros obligatorios (_id, pdf)" }
            });
        }

        
        const registroExistente = await HojaVida.findById(_id);
        if (!registroExistente) {
            return res.status(404).json({
                error: 1,
                response: { mensaje: "No se encontró el ID en la base de datos" }
            });
        }

        
        const nombreArchivo = `${_id}_${Date.now()}.pdf`;
        const ruta_relativa = `notificaciones/${nombreArchivo}`;
        const absolutePath = path.join(__dirname, '../../storage', ruta_relativa);

        
        const dir = path.dirname(absolutePath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        
        if (registroExistente.RUTA_NOTIFICACION_RECIBIDA) {
            const oldPath = path.join(__dirname, '../../storage', registroExistente.RUTA_NOTIFICACION_RECIBIDA);
            if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        }

        
        fs.writeFileSync(absolutePath, req.file.buffer);

        
        registroExistente.RUTA_NOTIFICACION_RECIBIDA = ruta_relativa;
        registroExistente.ESTADO = "CONSENTIMIENTO RECIBIDO";
        await registroExistente.save();

        return res.json({
            error: 0,
            response: {
                mensaje: "PDF cargado y estado actualizado correctamente",
                id: registroExistente._id
            }
        });

    } catch (error) {
        console.error("Error inesperado:", error);
        return res.status(500).json({
            error: 1,
            response: { mensaje: "Error inesperado", detalle: error.message }
        });
    }
});

router.get('/notificacion/descargar', async (req, res) => {
    try {
        const authHeader = req.headers['authorization'] || req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 1, response: { mensaje: 'Token requerido' } });
        }

        const token = authHeader.substring(7);
        const secret = process.env.JWT_SECRET;
        if (!secret) return res.status(500).json({ error: 1, response: { mensaje: 'Servidor sin JWT_SECRET configurado' } });

        let payload;
        try {
            payload = jwt.verify(token, secret);
        } catch (e) {
            return res.status(401).json({ error: 1, response: { mensaje: 'Token inválido o expirado' } });
        }

        const { id } = req.query; 
        if (!id) return res.status(400).json({ error: 1, response: { mensaje: 'ID es obligatorio' } });

        const registro = await HojaVida.findById(id);
        if (!registro || !registro.RUTA_NOTIFICACION_RECIBIDA) {
            return res.status(404).json({ error: 1, response: { mensaje: 'Documento no encontrado' } });
        }

        

        const absolutePath = path.join(__dirname, '../../storage', registro.RUTA_NOTIFICACION_RECIBIDA);
         console.log(absolutePath);
        if (!fs.existsSync(absolutePath)) {
           
            return res.status(404).json({ error: 1, response: { mensaje: 'Archivo no encontrado en el servidor' } });
        }

        
        res.download(absolutePath, registro.RUTA_NOTIFICACION_RECIBIDA, (err) => {
            if (err) console.error('Error al enviar el archivo:', err);
        });

    } catch (err) {
        console.error('Error inesperado:', err);
        res.status(500).json({ error: 1, response: { mensaje: 'Error inesperado' } });
    }
});


router.put('/biometria/subir', upload.single('pdf'), async (req, res) => {
    try {
        
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

        
        const { id_aspirante, id_usuario } = req.body;

        if (!id_aspirante || !id_usuario || !req.file) {
            return res.status(400).json({
                error: 1,
                response: { mensaje: "Faltan parámetros (id_aspirante, id_usuario, pdf)" }
            });
        }

        
        const registro = await HojaVida.findById(id_aspirante);
        if (!registro) {
            return res.status(404).json({
                error: 1,
                response: { mensaje: "Aspirante no encontrado" }
            });
        }

        
        const nombreArchivo = `${id_aspirante}_${Date.now()}.pdf`;
        const rutaRelativa = `biometria/${nombreArchivo}`;
        const rutaAbsoluta = path.join(__dirname, '../../storage', rutaRelativa);

        const dir = path.dirname(rutaAbsoluta);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        
        if (registro.RUTA_BIOMETRIA && registro.RUTA_BIOMETRIA.ruta) {
            const oldPath = path.join(__dirname, '../../storage', registro.RUTA_BIOMETRIA.ruta);
            if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        }

        
        fs.writeFileSync(rutaAbsoluta, req.file.buffer);

        
        registro.RUTA_BIOMETRIA = {
            ruta: rutaRelativa,
            id_usuario,
            fecha: new Date()
        };

        await registro.save();

        return res.json({
            error: 0,
            response: {
                mensaje: "Biometría cargada exitosamente",
                id_aspirante: id_aspirante,
                biometria: registro.RUTA_BIOMETRIA
            }
        });

    } catch (error) {
        console.error("Error inesperado:", error);
        return res.status(500).json({
            error: 1,
            response: {
                mensaje: "Error inesperado",
                detalle: error.message
            }
        });
    }
});

router.get('/biometria/descargar/:aspiranteId', async (req, res) => {
    try {
        
        const authHeader = req.headers['authorization'];

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                error: 1,
                response: { mensaje: 'Token requerido' }
            }); 
        }

        const token = authHeader.substring(7);
        const secret = process.env.JWT_SECRET;

        let payload;
        try {
            payload = jwt.verify(token, secret);
        } catch (err) {
            return res.status(401).json({
                error: 1,
                response: { mensaje: 'Token inválido o expirado' }
            });
        }

        
        const { aspiranteId } = req.params;

        
        const registro = await HojaVida.findById(aspiranteId);

        if (!registro) {
            return res.status(404).json({
                error: 1,
                response: { mensaje: 'Aspirante no encontrado' }
            });
        }

        
        if (
            !registro.RUTA_BIOMETRIA ||
            !registro.RUTA_BIOMETRIA.ruta ||
            registro.RUTA_BIOMETRIA.ruta.trim() === ''
        ) {
            return res.status(404).json({
                error: 1,
                response: { mensaje: 'El aspirante no tiene PDF biométrico cargado' }
            });
        }

        
        const rutaRelativa = registro.RUTA_BIOMETRIA.ruta;
        const rutaAbsoluta = path.join(__dirname, '../../storage', rutaRelativa);

        
        if (!fs.existsSync(rutaAbsoluta)) {
            return res.status(404).json({
                error: 1,
                response: { mensaje: 'El archivo biométrico no existe en el servidor' }
            });
        }

        
        return res.download(rutaAbsoluta, `biometria_${aspiranteId}.pdf`);

    } catch (error) {
        console.error('Error inesperado:', error);
        return res.status(500).json({
            error: 1,
            response: {
                mensaje: 'Error inesperado',
                detalle: error.message
            }
        });
    }
});

router.get('/biometria/info/:aspiranteId', async (req, res) => {
    try {
        
        const authHeader = req.headers['authorization'];
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                error: 1,
                response: { mensaje: 'Token requerido' }
            });
        }

        const token = authHeader.substring(7);
        const secret = process.env.JWT_SECRET;

        let payload;
        try {
            payload = jwt.verify(token, secret);
        } catch (e) {
            return res.status(401).json({
                error: 1,
                response: { mensaje: 'Token inválido o expirado' }
            });
        }

        const { aspiranteId } = req.params;

        
        const registro = await HojaVida.findById(aspiranteId)
            .populate('RUTA_BIOMETRIA.id_usuario', 'Cr_Nombre_Usuario');

        if (!registro) {
            return res.status(404).json({
                error: 1,
                response: { mensaje: 'Aspirante no encontrado' }
            });
        }

        if (!registro.RUTA_BIOMETRIA || !registro.RUTA_BIOMETRIA.ruta) {
            return res.status(404).json({
                error: 1,
                response: { mensaje: 'Este aspirante no tiene PDF cargado' }
            });
        }

        return res.json({
            error: 0,
            response: {
                mensaje: 'Información del archivo de biometría',
                data: {
                    ruta: registro.RUTA_BIOMETRIA.ruta,
                    fecha: registro.RUTA_BIOMETRIA.fecha,
                    usuario: registro.RUTA_BIOMETRIA.id_usuario
                        ? registro.RUTA_BIOMETRIA.id_usuario.Cr_Nombre_Usuario
                        : null,
                    id_usuario: registro.RUTA_BIOMETRIA.id_usuario?._id || null
                }
            }
        });

    } catch (error) {
        console.error("Error inesperado:", error);
        return res.status(500).json({
            error: 1,
            response: { mensaje: 'Error inesperado', detalle: error.message }
        });
    }
});



module.exports = router;
