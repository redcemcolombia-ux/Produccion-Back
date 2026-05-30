const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');


const User = require('../server/models/user/user');
const Permiso = require('../server/models/permiso/permiso');

const router = express.Router();

router.post('/register', async (req, res) => {
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

        const { persona, credenciales } = req.body;

        if (!persona || !credenciales) {
            return res.status(400).json({ error: 1, response: { mensaje: 'Datos de persona y credenciales son requeridos' } });
        }
        if (!persona.Pe_Correo || !persona.Pe_Documento) {
            return res.status(400).json({ error: 1, response: { mensaje: 'Pe_Correo y Pe_Documento son requeridos' } });
        }
        if (!credenciales.Cr_Nombre_Usuario || !credenciales.Cr_Password) {
            return res.status(400).json({ error: 1, response: { mensaje: 'Cr_Nombre_Usuario y Cr_Password son requeridos' } });
        }

        const email = (persona.Pe_Correo || '').trim();
        const documento = (persona.Pe_Documento || '').trim();

        let permisoDuplicado = null;
        if (email && documento) {
            permisoDuplicado = await Permiso
                .findOne({ $or: [{ Pe_Correo: email }, { Pe_Documento: documento }] })
                .collation({ locale: 'en', strength: 2 })
                .lean();
        } else if (email) {
            permisoDuplicado = await Permiso
                .findOne({ Pe_Correo: email })
                .collation({ locale: 'en', strength: 2 })
                .lean();
        } else if (documento) {
            permisoDuplicado = await Permiso
                .findOne({ Pe_Documento: documento })
                .lean();
        }

        console.log('[register] Check permiso duplicado => email:', email, 'doc:', documento,
            'found:', permisoDuplicado ? { correo: permisoDuplicado.Pe_Correo, doc: permisoDuplicado.Pe_Documento } : null);

        if (permisoDuplicado) {
            return res.status(409).json({ error: 1, response: { mensaje: 'Documento o correo ya registrados' } });
        }

        const username = (credenciales.Cr_Nombre_Usuario || '').trim();
        const usuarioDuplicado = username
            ? await User
                .findOne({ Cr_Nombre_Usuario: username })
                .collation({ locale: 'en', strength: 2 })
                .lean()
            : null;

        console.log('[register] Check usuario duplicado => username:', username,
            'found:', usuarioDuplicado ? { username: usuarioDuplicado.Cr_Nombre_Usuario } : null);

        if (usuarioDuplicado) {
            return res.status(409).json({ error: 1, response: { mensaje: 'Nombre de usuario ya está en uso' } });
        }

        const passwordHash = await bcrypt.hash(credenciales.Cr_Password, 10);

        const crIpsRaw = credenciales.Cr_Ips;
        const crEmpresaRaw = credenciales.Cr_Empresa;

        let crIps = undefined;
        if (typeof crIpsRaw === 'string' && crIpsRaw.trim() !== '') {
            if (!mongoose.Types.ObjectId.isValid(crIpsRaw.trim())) {
                return res.status(400).json({ error: 1, response: { mensaje: 'Cr_Ips inválido: debe ser un ObjectId' } });
            }
            crIps = crIpsRaw.trim();
        } else if (typeof crEmpresaRaw === 'string' && mongoose.Types.ObjectId.isValid(crEmpresaRaw.trim())) {
            crIps = crEmpresaRaw.trim();
        }

        const permisoDoc = await Permiso.create({
            Pe_Nombre: persona.Pe_Nombre,
            Pe_Apellido: persona.Pe_Apellido,
            Pe_Seg_Apellido: persona.Pe_Seg_Apellido,
            Pe_Tipo_Documento: persona.Pe_Tipo_Documento,
            Pe_Documento: persona.Pe_Documento, // texto plano
            Pe_Telefons_Fijo: persona.Pe_Telefons_Fijo,
            Pe_Cel: persona.Pe_Cel,
            Pe_Correo: persona.Pe_Correo,
            Pe_Direccion: persona.Pe_Direccion,
            Pe_Permiso: persona.Pe_Permiso,
            Pe_Departamento: persona.Pe_Departamento,
            Pe_Ciudad: persona.Pe_Ciudad
        });

        const usuarioDoc = await User.create({
            Cr_Nombre_Usuario: credenciales.Cr_Nombre_Usuario,
            Cr_Password: passwordHash,
            Cr_Perfil: credenciales.Cr_Perfil,
            Cr_Empresa: credenciales.Cr_Empresa,
            Cr_Ips: crIps,
            Cr_Estado: 'Activo',
            Cr_Pe_Codigo: permisoDoc._id
        });

        return res.status(201).json({
            error: 0,
            response: {
                mensaje: 'Registro exitoso'
            }
        });
    } catch (err) {
        console.error('Error en /api/users/register:', err);
        return res.status(500).json({ error: 1, response: { mensaje: 'Error interno del servidor' } });
    }
});

// Endpoint para consultar todos los usuarios
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

        // Consultar todos los usuarios con sus datos relacionados (Permiso e IPS)
        const usuarios = await User.find({})
            .populate('Cr_Pe_Codigo')
            .populate('Cr_Ips')
            .sort({ createdAt: -1 })
            .lean();

        return res.status(200).json({
            error: 0,
            response: {
                mensaje: `Se encontraron ${usuarios.length} usuarios registrados`,
                total: usuarios.length,
                usuarios: usuarios
            }
        });

    } catch (err) {
        console.error('Error en /api/users/consultar:', err);
        return res.status(500).json({ error: 1, response: { mensaje: 'Error interno del servidor' } });
    }
});

// Endpoint para actualizar un usuario específico
router.post('/actualizar', async (req, res) => {
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

        const { id, persona, credenciales } = req.body;

        if (!id) {
            return res.status(400).json({ error: 1, response: { mensaje: 'Se requiere el id del usuario a actualizar' } });
        }

        // Verificar que el usuario existe
        const usuarioExistente = await User.findById(id).lean();
        if (!usuarioExistente) {
            return res.status(404).json({ error: 1, response: { mensaje: `No se encontró el usuario con id '${id}'` } });
        }

        // Actualizar credenciales si se envían
        if (credenciales && Object.keys(credenciales).length > 0) {
            const updateData = {};

            // Validar duplicado de nombre de usuario si se está cambiando
            if (credenciales.Cr_Nombre_Usuario && credenciales.Cr_Nombre_Usuario.trim() !== '') {
                const username = credenciales.Cr_Nombre_Usuario.trim();
                const usuarioDuplicado = await User
                    .findOne({
                        Cr_Nombre_Usuario: username,
                        _id: { $ne: id } // Excluir el usuario actual
                    })
                    .collation({ locale: 'en', strength: 2 })
                    .lean();

                if (usuarioDuplicado) {
                    return res.status(409).json({ error: 1, response: { mensaje: 'Nombre de usuario ya está en uso' } });
                }
                updateData.Cr_Nombre_Usuario = username;
            }

            // Actualizar password si se envía
            if (credenciales.Cr_Password && credenciales.Cr_Password.trim() !== '') {
                updateData.Cr_Password = await bcrypt.hash(credenciales.Cr_Password, 10);
            }

            // Actualizar otros campos de credenciales
            if (credenciales.Cr_Perfil !== undefined) {
                updateData.Cr_Perfil = credenciales.Cr_Perfil;
            }
            if (credenciales.Cr_Empresa !== undefined) {
                updateData.Cr_Empresa = credenciales.Cr_Empresa;
            }
            if (credenciales.Cr_Estado !== undefined) {
                updateData.Cr_Estado = credenciales.Cr_Estado;
            }

            // Manejar Cr_Ips (validar ObjectId si se envía)
            if (credenciales.Cr_Ips !== undefined) {
                if (credenciales.Cr_Ips && typeof credenciales.Cr_Ips === 'string' && credenciales.Cr_Ips.trim() !== '') {
                    if (!mongoose.Types.ObjectId.isValid(credenciales.Cr_Ips.trim())) {
                        return res.status(400).json({ error: 1, response: { mensaje: 'Cr_Ips inválido: debe ser un ObjectId' } });
                    }
                    updateData.Cr_Ips = credenciales.Cr_Ips.trim();
                } else {
                    updateData.Cr_Ips = null;
                }
            }

            // Actualizar el usuario
            if (Object.keys(updateData).length > 0) {
                await User.findByIdAndUpdate(id, updateData);
            }
        }

        // Actualizar datos de persona (Permiso) si se envían
        if (persona && Object.keys(persona).length > 0 && usuarioExistente.Cr_Pe_Codigo) {
            const permisoId = usuarioExistente.Cr_Pe_Codigo;
            const updatePersona = {};

            // Validar duplicados de correo y documento si se están cambiando
            const email = persona.Pe_Correo ? persona.Pe_Correo.trim() : null;
            const documento = persona.Pe_Documento ? persona.Pe_Documento.trim() : null;

            if (email || documento) {
                const query = { _id: { $ne: permisoId } };
                const orConditions = [];

                if (email) orConditions.push({ Pe_Correo: email });
                if (documento) orConditions.push({ Pe_Documento: documento });

                if (orConditions.length > 0) {
                    query.$or = orConditions;
                    const permisoDuplicado = await Permiso
                        .findOne(query)
                        .collation({ locale: 'en', strength: 2 })
                        .lean();

                    if (permisoDuplicado) {
                        return res.status(409).json({ error: 1, response: { mensaje: 'Documento o correo ya registrados en otro usuario' } });
                    }
                }
            }

            // Construir objeto de actualización
            if (persona.Pe_Nombre !== undefined) updatePersona.Pe_Nombre = persona.Pe_Nombre;
            if (persona.Pe_Apellido !== undefined) updatePersona.Pe_Apellido = persona.Pe_Apellido;
            if (persona.Pe_Seg_Apellido !== undefined) updatePersona.Pe_Seg_Apellido = persona.Pe_Seg_Apellido;
            if (persona.Pe_Tipo_Documento !== undefined) updatePersona.Pe_Tipo_Documento = persona.Pe_Tipo_Documento;
            if (persona.Pe_Documento !== undefined) updatePersona.Pe_Documento = persona.Pe_Documento;
            if (persona.Pe_Telefons_Fijo !== undefined) updatePersona.Pe_Telefons_Fijo = persona.Pe_Telefons_Fijo;
            if (persona.Pe_Cel !== undefined) updatePersona.Pe_Cel = persona.Pe_Cel;
            if (persona.Pe_Correo !== undefined) updatePersona.Pe_Correo = persona.Pe_Correo;
            if (persona.Pe_Direccion !== undefined) updatePersona.Pe_Direccion = persona.Pe_Direccion;
            if (persona.Pe_Permiso !== undefined) updatePersona.Pe_Permiso = persona.Pe_Permiso;
            if (persona.Pe_Departamento !== undefined) updatePersona.Pe_Departamento = persona.Pe_Departamento;
            if (persona.Pe_Ciudad !== undefined) updatePersona.Pe_Ciudad = persona.Pe_Ciudad;

            // Actualizar el permiso si hay cambios
            if (Object.keys(updatePersona).length > 0) {
                await Permiso.findByIdAndUpdate(permisoId, updatePersona);
            }
        }

        // Obtener el usuario actualizado con sus relaciones
        const usuarioActualizado = await User.findById(id)
            .populate('Cr_Pe_Codigo')
            .populate('Cr_Ips')
            .lean();

        return res.status(200).json({
            error: 0,
            response: {
                mensaje: 'Usuario actualizado exitosamente',
                usuario: usuarioActualizado
            }
        });

    } catch (err) {
        console.error('Error en /api/users/actualizar:', err);
        return res.status(500).json({ error: 1, response: { mensaje: 'Error interno del servidor' } });
    }
});

module.exports = router;
