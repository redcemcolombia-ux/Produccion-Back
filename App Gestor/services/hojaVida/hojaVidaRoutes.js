const express = require('express');
const jwt = require('jsonwebtoken');
const HojaVida = require('../server/models/hojaVida/hojaVida');
const User = require('../server/models/user/user');
const IPS = require('../server/models/ips/ips');
const Permiso = require('../server/models/permiso/permiso');
const ControlUsoIps = require('../server/models/controlUsoIps/controlUsoIps');
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
    limits: { fileSize: 150 * 1024 * 1024 }
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

router.put('/actualizar/:id', async (req, res) => {
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

        // Obtener ID desde params de la URL
        const { id } = req.params;
        const datosActualizar = req.body;

        if (!id) {
            return res.status(400).json({ error: 1, response: { mensaje: 'El ID es obligatorio' } });
        }

        // Validar que el ID sea válido
        if (id.length !== 24) {
            return res.status(400).json({ error: 1, response: { mensaje: 'ID inválido' } });
        }

        // Verificar que el registro existe
        const hojaVidaExistente = await HojaVida.findById(id);
        if (!hojaVidaExistente) {
            return res.status(404).json({ error: 1, response: { mensaje: 'No se encontró la hoja de vida con el ID proporcionado' } });
        }

        // Si se está actualizando el DOCUMENTO, verificar que no exista otro registro con ese documento
        if (datosActualizar.DOCUMENTO && datosActualizar.DOCUMENTO !== hojaVidaExistente.DOCUMENTO) {
            const documentoExiste = await HojaVida.findOne({
                DOCUMENTO: datosActualizar.DOCUMENTO,
                _id: { $ne: id }
            });

            if (documentoExiste) {
                return res.status(409).json({
                    error: 1,
                    response: {
                        mensaje: 'El documento ya está registrado en otra hoja de vida',
                        documento_existente: {
                            documento: documentoExiste.DOCUMENTO,
                            nombre: `${documentoExiste.NOMBRE || ''} ${documentoExiste.PRIMER_APELLIDO || ''}`.trim()
                        }
                    }
                });
            }
        }

        // Manejar campos especiales con valores por defecto
        if (datosActualizar.ESTADO_NOTIFICACION === undefined) {
            datosActualizar.ESTADO_NOTIFICACION = hojaVidaExistente.ESTADO_NOTIFICACION;
        }
        if (datosActualizar.H_ESTADO_NOTIFICACION_CONSENTIMIENTO === undefined) {
            datosActualizar.H_ESTADO_NOTIFICACION_CONSENTIMIENTO = hojaVidaExistente.H_ESTADO_NOTIFICACION_CONSENTIMIENTO;
        }

        // Actualizar el registro
        const hojaVidaActualizada = await HojaVida.findByIdAndUpdate(
            id,
            datosActualizar,
            { new: true, runValidators: true }
        );

        return res.status(200).json({
            error: 0,
            response: {
                mensaje: 'Hoja de vida actualizada exitosamente',
                hoja_vida: {
                    id: hojaVidaActualizada._id,
                    DOCUMENTO: hojaVidaActualizada.DOCUMENTO,
                    NOMBRE: hojaVidaActualizada.NOMBRE,
                    PRIMER_APELLIDO: hojaVidaActualizada.PRIMER_APELLIDO,
                    SEGUNDO_APELLIDO: hojaVidaActualizada.SEGUNDO_APELLIDO,
                    CORREO: hojaVidaActualizada.CORREO,
                    CELULAR: hojaVidaActualizada.CELULAR
                }
            }
        });
    } catch (err) {
        console.error('Error en /api/hojas-vida/actualizar:', err);
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

router.post('/validar-descontar-caso', async (req, res) => {
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

        const { usuario_id } = req.body;

        if (!usuario_id) {
            return res.status(400).json({ error: 1, response: { mensaje: 'El campo usuario_id es requerido' } });
        }

        // Validar control de uso de IPS del usuario
        const controlActivo = await ControlUsoIps.findOne({
            id_usuario: usuario_id,
            co_estado: true
        });

        if (!controlActivo) {
            return res.status(403).json({
                error: 1,
                response: {
                    mensaje: 'No tiene casos disponibles. Por favor, comuníquese con el administrador para obtener más casos.',
                    casos_disponibles: 0
                }
            });
        }

        if (controlActivo.co_cantidad <= 0) {
            return res.status(403).json({
                error: 1,
                response: {
                    mensaje: 'No tiene casos disponibles. Por favor, comuníquese con el administrador para obtener más casos.',
                    casos_disponibles: 0
                }
            });
        }

        // Descontar 1 caso
        controlActivo.co_cantidad = controlActivo.co_cantidad - 1;
        await controlActivo.save();
        console.log(`[/validar-descontar-caso] Caso consumido. Usuario: ${usuario_id}, Casos restantes: ${controlActivo.co_cantidad}`);

        return res.status(200).json({
            error: 0,
            response: {
                mensaje: 'Caso descontado correctamente',
                casos_restantes: controlActivo.co_cantidad,
                tiene_casos: controlActivo.co_cantidad > 0
            }
        });

    } catch (err) {
        console.error('Error en /api/hojas-vida/validar-descontar-caso:', err);
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

router.get('/con_usuario_sic', async (req, res) => {
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
            .find({
                USUARIO_SIC: { $exists: true, $ne: null, $ne: "" }
            })
            .populate('IPS_ID')
            .populate('USUARIO_ID')
            .lean();

        return res.status(200).json({
            error: 0,
            response: {
                mensaje: 'Consulta exitosa - Hojas de vida con USUARIO_SIC asignado',
                data: hojasVida,
                total: hojasVida.length
            }
        });

    } catch (err) {
        console.error('Error en /api/hojas-vida/con_usuario_sic:', err);
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

router.put('/actualizacion_biometria', (req, res) => {
    upload.single('pdf')(req, res, async (err) => {
        // Manejo de errores de Multer
        if (err) {
            if (err instanceof multer.MulterError) {
                if (err.code === 'LIMIT_FILE_SIZE') {
                    return res.status(400).json({
                        error: 1,
                        response: {
                            mensaje: 'El archivo excede el tamaño máximo permitido de 150 MB',
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

            if (err.message === 'Solo se permiten archivos PDF') {
                return res.status(400).json({
                    error: 1,
                    response: { mensaje: 'Solo se permiten archivos PDF' }
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

            // Obtener parámetros
            const { id_caso, id_usuario, notas_cambio } = req.body;

            if (!id_caso || !id_usuario || !req.file) {
                return res.status(400).json({
                    error: 1,
                    response: { mensaje: "Faltan parámetros (id_caso, id_usuario, pdf)" }
                });
            }

            if (!notas_cambio || notas_cambio.trim() === '') {
                return res.status(400).json({
                    error: 1,
                    response: { mensaje: "Las notas_cambio son obligatorias" }
                });
            }

            // Validar formato de IDs
            if (id_caso.length !== 24) {
                return res.status(400).json({
                    error: 1,
                    response: { mensaje: "Formato de id_caso inválido" }
                });
            }

            if (id_usuario.length !== 24) {
                return res.status(400).json({
                    error: 1,
                    response: { mensaje: "Formato de id_usuario inválido" }
                });
            }

            // Buscar el caso
            const registro = await HojaVida.findById(id_caso);
            if (!registro) {
                return res.status(404).json({
                    error: 1,
                    response: { mensaje: "Caso no encontrado" }
                });
            }

            // Verificar que el usuario existe
            const usuario = await User.findById(id_usuario);
            if (!usuario) {
                return res.status(404).json({
                    error: 1,
                    response: { mensaje: "Usuario no encontrado" }
                });
            }

            // Guardar en historial si existe información previa de RUTA_BIOMETRIA
            if (registro.RUTA_BIOMETRIA && registro.RUTA_BIOMETRIA.ruta) {
                // Inicializar historial si no existe
                if (!registro.HISTORIAL_BIOMETRIA) {
                    registro.HISTORIAL_BIOMETRIA = [];
                }

                // Agregar al historial
                registro.HISTORIAL_BIOMETRIA.push({
                    id_usuario_original: registro.RUTA_BIOMETRIA.id_usuario,
                    ruta_anterior: registro.RUTA_BIOMETRIA.ruta,
                    fecha_anterior: registro.RUTA_BIOMETRIA.fecha,
                    fecha_cambio: new Date(),
                    notas_cambio: notas_cambio.trim(),
                    id_usuario_cambio: id_usuario
                });
            }

            // Crear nombre del archivo (mismo formato que servicio original de biometría)
            const nombreArchivo = `${id_caso}_${Date.now()}.pdf`;
            const rutaRelativa = `biometria/${nombreArchivo}`;
            const rutaAbsoluta = path.join(__dirname, '../../storage', rutaRelativa);

            const dir = path.dirname(rutaAbsoluta);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

            // NO borramos el archivo anterior porque quedó guardado en el historial

            // Guardar el nuevo archivo
            fs.writeFileSync(rutaAbsoluta, req.file.buffer);

            // Actualizar RUTA_BIOMETRIA
            registro.RUTA_BIOMETRIA = {
                ruta: rutaRelativa,
                id_usuario: id_usuario,
                fecha: new Date()
            };

            await registro.save();

            return res.json({
                error: 0,
                response: {
                    mensaje: "Biometría actualizada exitosamente",
                    id_caso: id_caso,
                    biometria_actual: registro.RUTA_BIOMETRIA,
                    total_historial: registro.HISTORIAL_BIOMETRIA ? registro.HISTORIAL_BIOMETRIA.length : 0
                }
            });

        } catch (error) {
            console.error("Error inesperado en /actualizacion_biometria:", error);
            return res.status(500).json({
                error: 1,
                response: {
                    mensaje: "Error inesperado",
                    detalle: error.message
                }
            });
        }
    });
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

router.put('/upload_psicologia/', upload.single('pdf'), async (req, res) => {
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
        const rutaRelativa = `psicologia/${nombreArchivo}`;
        const rutaAbsoluta = path.join(__dirname, '../../storage', rutaRelativa);

        const dir = path.dirname(rutaAbsoluta);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });


        if (registro.RUTA_PSICOLOGIA && registro.RUTA_PSICOLOGIA.ruta) {
            const oldPath = path.join(__dirname, '../../storage', registro.RUTA_PSICOLOGIA.ruta);
            if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        }


        fs.writeFileSync(rutaAbsoluta, req.file.buffer);


        registro.RUTA_PSICOLOGIA = {
            ruta: rutaRelativa,
            id_usuario,
            fecha: new Date()
        };

        await registro.save();

        return res.json({
            error: 0,
            response: {
                mensaje: "PDF de psicología cargado exitosamente",
                id_aspirante: id_aspirante,
                psicologia: registro.RUTA_PSICOLOGIA
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

router.get('/psicologia/descargar/:aspiranteId', async (req, res) => {
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
            !registro.RUTA_PSICOLOGIA ||
            !registro.RUTA_PSICOLOGIA.ruta ||
            registro.RUTA_PSICOLOGIA.ruta.trim() === ''
        ) {
            return res.status(404).json({
                error: 1,
                response: { mensaje: 'El aspirante no tiene PDF de psicología cargado' }
            });
        }


        const rutaRelativa = registro.RUTA_PSICOLOGIA.ruta;
        const rutaAbsoluta = path.join(__dirname, '../../storage', rutaRelativa);


        if (!fs.existsSync(rutaAbsoluta)) {
            return res.status(404).json({
                error: 1,
                response: { mensaje: 'El archivo de psicología no existe en el servidor' }
            });
        }


        return res.download(rutaAbsoluta, `psicologia_${aspiranteId}.pdf`);

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

router.put('/cierre/gestionar', async (req, res) => {
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

        try {
            jwt.verify(token, secret);
        } catch (e) {
            return res.status(401).json({
                error: 1,
                response: { mensaje: 'Token inválido o expirado' }
            });
        }

        // Obtener datos del body
        const {
            id_hoja_vida,
            id_usuario_gestor_cierre,
            estado_cierre,
            notas_cierre,
            tipo_cierre
        } = req.body;

        // Validar campos obligatorios
        if (!id_hoja_vida) {
            return res.status(400).json({
                error: 1,
                response: { mensaje: 'El id_hoja_vida es obligatorio' }
            });
        }

        if (!id_usuario_gestor_cierre) {
            return res.status(400).json({
                error: 1,
                response: { mensaje: 'El id_usuario_gestor_cierre es obligatorio' }
            });
        }

        // Verificar que la hoja de vida existe
        const hojaVida = await HojaVida.findById(id_hoja_vida);
        if (!hojaVida) {
            return res.status(404).json({
                error: 1,
                response: { mensaje: 'Hoja de vida no encontrada' }
            });
        }

        // Verificar que el usuario gestor existe
        const usuarioGestor = await User.findById(id_usuario_gestor_cierre);
        if (!usuarioGestor) {
            return res.status(404).json({
                error: 1,
                response: { mensaje: 'Usuario gestor no encontrado' }
            });
        }

        // Actualizar los campos de cierre
        hojaVida.USUARIO_GESTOR_CIERRE = id_usuario_gestor_cierre;
        hojaVida.ESTADO_CIERRE = estado_cierre || null;
        hojaVida.NOTAS_CIERRE = notas_cierre || null;
        hojaVida.TIPO_CIERRE = tipo_cierre || null;
        hojaVida.FECHA_CIERRE = new Date();

        await hojaVida.save();

        return res.status(200).json({
            error: 0,
            response: {
                mensaje: 'Cierre gestionado exitosamente',
                datos: {
                    id_hoja_vida: hojaVida._id,
                    usuario_gestor: usuarioGestor.NOMBRE,
                    estado_cierre: hojaVida.ESTADO_CIERRE,
                    tipo_cierre: hojaVida.TIPO_CIERRE,
                    fecha_cierre: hojaVida.FECHA_CIERRE
                }
            }
        });

    } catch (error) {
        console.error('Error en /cierre/gestionar:', error);
        return res.status(500).json({
            error: 1,
            response: {
                mensaje: 'Error inesperado',
                detalle: error.message
            }
        });
    }
});

router.post('/casos/retorno-ips', async (req, res) => {
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

        try {
            jwt.verify(token, secret);
        } catch (e) {
            return res.status(401).json({
                error: 1,
                response: { mensaje: 'Token inválido o expirado' }
            });
        }

        // Obtener id_ips del body
        const { id_ips } = req.body;

        if (!id_ips) {
            return res.status(400).json({
                error: 1,
                response: { mensaje: 'El id_ips es obligatorio' }
            });
        }

        // Verificar que la IPS existe
        const ips = await IPS.findById(id_ips).lean();
        if (!ips) {
            return res.status(404).json({
                error: 1,
                response: { mensaje: 'IPS no encontrada' }
            });
        }

        // Buscar hojas de vida con los filtros
        const hojasVida = await HojaVida.find({
            TIPO_CIERRE: 'Retorno Ips',
            IPS_ID: id_ips
        })
        .populate('IPS_ID', 'NOMBRE_IPS NIT CORREO TELEFONO DIRECCION CIUDAD DEPARTAMENTO REGIONAL')
        .populate('USUARIO_ID', 'NOMBRE CORREO TELEFONO ROL')
        .populate('USUARIO_GESTOR_CIERRE', 'NOMBRE CORREO TELEFONO ROL')
        .populate('RUTA_BIOMETRIA.id_usuario', 'NOMBRE CORREO')
        .populate('RUTA_PSICOLOGIA.id_usuario', 'NOMBRE CORREO')
        .lean();

        return res.status(200).json({
            error: 0,
            response: {
                mensaje: `Casos de retorno IPS encontrados: ${hojasVida.length}`,
                total: hojasVida.length,
                ips: {
                    id: ips._id,
                    nombre: ips.NOMBRE_IPS
                },
                casos: hojasVida
            }
        });

    } catch (error) {
        console.error('Error en /casos/retorno-ips:', error);
        return res.status(500).json({
            error: 1,
            response: {
                mensaje: 'Error inesperado',
                detalle: error.message
            }
        });
    }
});

router.put('/actualizacion_examenes', (req, res) => {
    upload.single('pdf')(req, res, async (err) => {
        // Manejo de errores de Multer
        if (err) {
            if (err instanceof multer.MulterError) {
                if (err.code === 'LIMIT_FILE_SIZE') {
                    return res.status(400).json({
                        error: 1,
                        response: {
                            mensaje: 'El archivo excede el tamaño máximo permitido de 150 MB',
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

            // Error del fileFilter (tipo de archivo incorrecto)
            if (err.message === 'Solo se permiten archivos PDF') {
                return res.status(400).json({
                    error: 1,
                    response: { mensaje: 'Solo se permiten archivos PDF' }
                });
            }

            // Otros errores
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

            // Obtener parámetros
            const { id_caso, id_usuario, notas_cambio } = req.body;

            if (!id_caso || !id_usuario || !req.file) {
                return res.status(400).json({
                    error: 1,
                    response: { mensaje: "Faltan parámetros (id_caso, id_usuario, pdf)" }
                });
            }

            if (!notas_cambio || notas_cambio.trim() === '') {
                return res.status(400).json({
                    error: 1,
                    response: { mensaje: "Las notas_cambio son obligatorias" }
                });
            }

            // Validar formato de IDs
            if (id_caso.length !== 24) {
                return res.status(400).json({
                    error: 1,
                    response: { mensaje: "Formato de id_caso inválido" }
                });
            }

            if (id_usuario.length !== 24) {
                return res.status(400).json({
                    error: 1,
                    response: { mensaje: "Formato de id_usuario inválido" }
                });
            }

            // Buscar el caso
            const registro = await HojaVida.findById(id_caso);
            if (!registro) {
                return res.status(404).json({
                    error: 1,
                    response: { mensaje: "Caso no encontrado" }
                });
            }

            // Verificar que el usuario existe
            const usuario = await User.findById(id_usuario);
            if (!usuario) {
                return res.status(404).json({
                    error: 1,
                    response: { mensaje: "Usuario no encontrado" }
                });
            }

            // Guardar en historial si existe información previa de PDF_URL
            if (registro.PDF_URL && registro.PDF_URL.trim() !== '') {
                // Inicializar historial si no existe
                if (!registro.HISTORIAL_EXAMENES) {
                    registro.HISTORIAL_EXAMENES = [];
                }

                // Agregar al historial con la info del PDF anterior
                registro.HISTORIAL_EXAMENES.push({
                    id_usuario_original: registro.RUTA_EXAMENES?.id_usuario || null,
                    ruta_anterior: registro.PDF_URL,
                    fecha_anterior: registro.RUTA_EXAMENES?.fecha || null,
                    fecha_cambio: new Date(),
                    notas_cambio: notas_cambio.trim(),
                    id_usuario_cambio: id_usuario
                });
            }

            // Crear nombre del archivo con el mismo formato que se usa en el sistema
            const nombreArchivo = `hoja_vida_${id_caso}_${Date.now()}.pdf`;
            const UPLOAD_DIR = path.join(__dirname, '../uploads/pdf');

            // Asegurar que el directorio existe
            if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

            const rutaAbsoluta = path.join(UPLOAD_DIR, nombreArchivo);

            // NO borramos el archivo anterior porque quedó guardado en el historial

            // Guardar el nuevo archivo
            fs.writeFileSync(rutaAbsoluta, req.file.buffer);

            // Actualizar PDF_URL (campo principal usado en el sistema)
            registro.PDF_URL = `/uploads/pdf/${nombreArchivo}`;

            // Actualizar RUTA_EXAMENES con metadata completa
            registro.RUTA_EXAMENES = {
                ruta: `/uploads/pdf/${nombreArchivo}`,
                id_usuario: id_usuario,
                fecha: new Date()
            };

            await registro.save();

            return res.json({
                error: 0,
                response: {
                    mensaje: "Exámenes actualizados exitosamente",
                    id_caso: id_caso,
                    pdf_url: registro.PDF_URL,
                    examenes_metadata: registro.RUTA_EXAMENES,
                    total_historial: registro.HISTORIAL_EXAMENES ? registro.HISTORIAL_EXAMENES.length : 0
                }
            });

        } catch (error) {
            console.error("Error inesperado en /actualizacion_examenes:", error);
            return res.status(500).json({
                error: 1,
                response: {
                    mensaje: "Error inesperado",
                    detalle: error.message
                }
            });
        }
    });
});

/**
 * PUT /api/hojas-vida/notificaciones/marcar-leido
 * Marca como leídos elementos específicos de HISTORIAL_EXAMENES, INFO_LIBERACION y HISTORIAL_BIOMETRIA
 */
router.put('/notificaciones/marcar-leido', async (req, res) => {
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

        const {
            hoja_vida_id,
            historial_examenes_ids = [],
            info_liberacion_ids = [],
            historial_biometria_ids = [],
            marcar_leido_ruta_biometria = false,
            marcar_leido_ruta_psicologia = false,
            marcar_leido_pdf_url = false
        } = req.body;

        console.log('[PUT /notificaciones/marcar-leido] 📝 Datos recibidos:');
        console.log('[PUT /notificaciones/marcar-leido] - hoja_vida_id:', hoja_vida_id);
        console.log('[PUT /notificaciones/marcar-leido] - historial_examenes_ids:', historial_examenes_ids.length);
        console.log('[PUT /notificaciones/marcar-leido] - info_liberacion_ids:', info_liberacion_ids.length);
        console.log('[PUT /notificaciones/marcar-leido] - historial_biometria_ids:', historial_biometria_ids.length);
        console.log('[PUT /notificaciones/marcar-leido] - marcar_leido_ruta_biometria:', marcar_leido_ruta_biometria);
        console.log('[PUT /notificaciones/marcar-leido] - marcar_leido_ruta_psicologia:', marcar_leido_ruta_psicologia);
        console.log('[PUT /notificaciones/marcar-leido] - marcar_leido_pdf_url:', marcar_leido_pdf_url);

        // Validar campo obligatorio
        if (!hoja_vida_id) {
            return res.status(400).json({
                error: 1,
                response: { mensaje: 'El campo hoja_vida_id es obligatorio' }
            });
        }

        // Validar formato de ID
        if (hoja_vida_id.length !== 24) {
            return res.status(400).json({
                error: 1,
                response: { mensaje: 'Formato de hoja_vida_id inválido' }
            });
        }

        // Buscar la hoja de vida
        console.log('[PUT /notificaciones/marcar-leido] 🔍 Buscando hoja de vida...');
        const hojaVida = await HojaVida.findById(hoja_vida_id);

        if (!hojaVida) {
            console.log('[PUT /notificaciones/marcar-leido] ❌ Hoja de vida no encontrada');
            return res.status(404).json({
                error: 1,
                response: { mensaje: 'Hoja de vida no encontrada' }
            });
        }

        console.log('[PUT /notificaciones/marcar-leido] ✅ Hoja de vida encontrada');

        let actualizados = {
            historial_examenes: 0,
            info_liberacion: 0,
            historial_biometria: 0,
            ruta_biometria: false,
            ruta_psicologia: false,
            pdf_url: false
        };

        // Marcar como leído elementos de HISTORIAL_EXAMENES
        if (historial_examenes_ids.length > 0 && hojaVida.HISTORIAL_EXAMENES) {
            hojaVida.HISTORIAL_EXAMENES.forEach(item => {
                if (historial_examenes_ids.includes(item._id.toString())) {
                    item.leido = true;
                    actualizados.historial_examenes++;
                }
            });
        }

        // Marcar como leído elementos de INFO_LIBERACION
        if (info_liberacion_ids.length > 0 && hojaVida.INFO_LIBERACION) {
            hojaVida.INFO_LIBERACION.forEach(item => {
                if (info_liberacion_ids.includes(item._id.toString())) {
                    item.leido = true;
                    actualizados.info_liberacion++;
                }
            });
        }

        // Marcar como leído elementos de HISTORIAL_BIOMETRIA
        if (historial_biometria_ids.length > 0 && hojaVida.HISTORIAL_BIOMETRIA) {
            hojaVida.HISTORIAL_BIOMETRIA.forEach(item => {
                if (historial_biometria_ids.includes(item._id.toString())) {
                    item.leido = true;
                    actualizados.historial_biometria++;
                }
            });
        }

        // Marcar como leído campos principales
        if (marcar_leido_ruta_biometria && hojaVida.RUTA_BIOMETRIA?.ruta) {
            hojaVida.leido_ruta_biometria = true;
            actualizados.ruta_biometria = true;
        }

        if (marcar_leido_ruta_psicologia && hojaVida.RUTA_PSICOLOGIA?.ruta) {
            hojaVida.leido_ruta_psicologia = true;
            actualizados.ruta_psicologia = true;
        }

        if (marcar_leido_pdf_url && hojaVida.PDF_URL) {
            hojaVida.leido_pdf_url = true;
            actualizados.pdf_url = true;
        }

        // Guardar cambios
        console.log('[PUT /notificaciones/marcar-leido] 💾 Guardando cambios...');
        await hojaVida.save();
        console.log('[PUT /notificaciones/marcar-leido] ✅ Cambios guardados exitosamente');
        console.log('[PUT /notificaciones/marcar-leido] 📊 Elementos actualizados:', actualizados);

        return res.status(200).json({
            error: 0,
            response: {
                mensaje: 'Notificaciones marcadas como leídas exitosamente',
                actualizados: {
                    historial_examenes: actualizados.historial_examenes,
                    info_liberacion: actualizados.info_liberacion,
                    historial_biometria: actualizados.historial_biometria,
                    ruta_biometria: actualizados.ruta_biometria,
                    ruta_psicologia: actualizados.ruta_psicologia,
                    pdf_url: actualizados.pdf_url,
                    total_arrays: actualizados.historial_examenes + actualizados.info_liberacion + actualizados.historial_biometria,
                    total_campos: (actualizados.ruta_biometria ? 1 : 0) + (actualizados.ruta_psicologia ? 1 : 0) + (actualizados.pdf_url ? 1 : 0)
                }
            }
        });

    } catch (error) {
        console.error('[PUT /notificaciones/marcar-leido] ❌ Error:', error);
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
 * GET /api/hojas-vida/notificaciones
 * Obtiene todos los registros que contengan HISTORIAL_EXAMENES e INFO_LIBERACION NO LEÍDOS
 */
router.get('/notificaciones', async (req, res) => {
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

        console.log('[GET /notificaciones] 🔔 Consultando registros con notificaciones NO LEÍDAS...');

        // Filtrar registros que tengan al menos una notificación NO leída
        const notificaciones = await HojaVida.find({
            $or: [
                // Campos principales actualizados y no leídos
                {
                    'RUTA_BIOMETRIA.ruta': { $exists: true, $ne: null },
                    $or: [
                        { leido_ruta_biometria: { $ne: true } },
                        { leido_ruta_biometria: { $exists: false } }
                    ]
                },
                {
                    'RUTA_PSICOLOGIA.ruta': { $exists: true, $ne: null },
                    $or: [
                        { leido_ruta_psicologia: { $ne: true } },
                        { leido_ruta_psicologia: { $exists: false } }
                    ]
                },
                {
                    PDF_URL: { $exists: true, $ne: null, $ne: '' },
                    $or: [
                        { leido_pdf_url: { $ne: true } },
                        { leido_pdf_url: { $exists: false } }
                    ]
                },
                // Elementos de arrays no leídos
                {
                    HISTORIAL_EXAMENES: {
                        $elemMatch: {
                            $or: [
                                { leido: { $ne: true } },
                                { leido: { $exists: false } }
                            ]
                        }
                    }
                },
                {
                    INFO_LIBERACION: {
                        $elemMatch: {
                            $or: [
                                { leido: { $ne: true } },
                                { leido: { $exists: false } }
                            ]
                        }
                    }
                },
                {
                    HISTORIAL_BIOMETRIA: {
                        $elemMatch: {
                            $or: [
                                { leido: { $ne: true } },
                                { leido: { $exists: false } }
                            ]
                        }
                    }
                }
            ]
        })
        .populate('IPS_ID')
        .populate('USUARIO_ID', 'Cr_Nombre_Usuario Cr_Correo Cr_Pe_Codigo')
        .populate('USUARIO_SIC')
        .populate('USUARIO_GESTOR_CIERRE', 'Cr_Nombre_Usuario Cr_Correo')
        .populate('RUTA_BIOMETRIA.id_usuario', 'Cr_Nombre_Usuario Cr_Correo')
        .populate('RUTA_PSICOLOGIA.id_usuario', 'Cr_Nombre_Usuario Cr_Correo')
        .populate('RUTA_EXAMENES.id_usuario', 'Cr_Nombre_Usuario Cr_Correo')
        .populate('HISTORIAL_EXAMENES.id_usuario_cambio', 'Cr_Nombre_Usuario Cr_Correo')
        .populate('HISTORIAL_EXAMENES.id_usuario_original', 'Cr_Nombre_Usuario Cr_Correo')
        .populate('HISTORIAL_BIOMETRIA.id_usuario_cambio', 'Cr_Nombre_Usuario Cr_Correo')
        .populate('HISTORIAL_BIOMETRIA.id_usuario_original', 'Cr_Nombre_Usuario Cr_Correo')
        .populate('INFO_LIBERACION.usuario_id', 'Cr_Nombre_Usuario Cr_Correo')
        .sort({ updatedAt: -1 }) // Más recientes primero
        .lean();

        console.log('[GET /notificaciones] ✅ Consulta completada');
        console.log('[GET /notificaciones] 📊 Total de registros encontrados:', notificaciones.length);

        // Si no hay registros
        if (!notificaciones || notificaciones.length === 0) {
            return res.status(200).json({
                error: 0,
                response: {
                    mensaje: 'No se encontraron notificaciones',
                    total: 0,
                    notificaciones: []
                }
            });
        }

        // Enriquecer cada notificación con información adicional
        const notificacionesEnriquecidas = await Promise.all(
            notificaciones.map(async (hv) => {
                let resultado = { ...hv };

                // Agregar información de IPS si existe
                if (hv && hv.IPS_ID && typeof hv.IPS_ID === 'object') {
                    resultado.IPS = hv.IPS_ID;
                }

                // Cruce USUARIO_SIC -> cl_credencial (User) para obtener Cr_Pe_Codigo
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

                            resultado.Cr_Pe_Codigo = permisoId;
                            resultado.PERMISO_USUARIO_SIC = permiso || null;
                        }
                    } catch (e) {
                        // Silenciar errores por registro individual
                    }
                }

                // Filtrar solo elementos NO leídos
                if (hv.HISTORIAL_EXAMENES) {
                    resultado.HISTORIAL_EXAMENES = hv.HISTORIAL_EXAMENES.filter(
                        item => item.leido !== true
                    );
                }

                if (hv.INFO_LIBERACION) {
                    resultado.INFO_LIBERACION = hv.INFO_LIBERACION.filter(
                        item => item.leido !== true
                    );
                }

                if (hv.HISTORIAL_BIOMETRIA) {
                    resultado.HISTORIAL_BIOMETRIA = hv.HISTORIAL_BIOMETRIA.filter(
                        item => item.leido !== true
                    );
                }

                // Agregar contadores de elementos NO leídos de arrays
                resultado.total_historial_examenes = resultado.HISTORIAL_EXAMENES?.length || 0;
                resultado.total_info_liberacion = resultado.INFO_LIBERACION?.length || 0;
                resultado.total_historial_biometria = resultado.HISTORIAL_BIOMETRIA?.length || 0;

                // Detectar campos principales actualizados y no leídos
                resultado.notificaciones_campos = {
                    tiene_biometria: !!(hv.RUTA_BIOMETRIA?.ruta),
                    leido_biometria: hv.leido_ruta_biometria === true,
                    tiene_psicologia: !!(hv.RUTA_PSICOLOGIA?.ruta),
                    leido_psicologia: hv.leido_ruta_psicologia === true,
                    tiene_examenes: !!(hv.PDF_URL),
                    leido_examenes: hv.leido_pdf_url === true
                };

                // Total de notificaciones no leídas
                let total_campos_no_leidos = 0;
                if (resultado.notificaciones_campos.tiene_biometria && !resultado.notificaciones_campos.leido_biometria) total_campos_no_leidos++;
                if (resultado.notificaciones_campos.tiene_psicologia && !resultado.notificaciones_campos.leido_psicologia) total_campos_no_leidos++;
                if (resultado.notificaciones_campos.tiene_examenes && !resultado.notificaciones_campos.leido_examenes) total_campos_no_leidos++;

                resultado.total_notificaciones_no_leidas =
                    resultado.total_historial_examenes +
                    resultado.total_info_liberacion +
                    resultado.total_historial_biometria +
                    total_campos_no_leidos;

                return resultado;
            })
        );

        console.log('[GET /notificaciones] ✅ Datos enriquecidos correctamente');

        return res.status(200).json({
            error: 0,
            response: {
                mensaje: 'Consulta exitosa',
                total: notificacionesEnriquecidas.length,
                notificaciones: notificacionesEnriquecidas
            }
        });

    } catch (error) {
        console.error('[GET /notificaciones] ❌ Error:', error);
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
