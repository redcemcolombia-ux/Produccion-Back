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
module.exports = router;
