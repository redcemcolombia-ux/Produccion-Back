const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../server/models/user/user');
const bcrypt = require('bcryptjs');
const Permiso = require('../server/models/permiso/permiso');

const router = express.Router();

router.post('/login', async (req, res) => {
    try {
        const { email: emailPlain, password: passwordPlain } = req.body;
        const secret = process.env.JWT_SECRET;

        if (!emailPlain || !passwordPlain) {
            return res.status(400).json({ error: 1, response: { mensaje: 'Usuario y contraseña son requeridos' } });
        }
        if (!secret) {
            return res.status(500).json({ error: 1, response: { mensaje: 'Servidor sin JWT_SECRET configurado' } });
        }

        const user = await User.findOne({
            $or: [{ Cr_Nombre_Usuario: emailPlain }, { email: emailPlain }]
        }).populate('Cr_Pe_Codigo').populate('Cr_Ips');

        if (!user) {
            return res.status(401).json({ error: 1, response: { mensaje: 'Credenciales inválidas' } });
        }

        const hash = user.Cr_Password;

        if (!hash) {
            console.warn('Usuario sin hash bcrypt en BD:', user._id);
            return res.status(500).json({ error: 1, response: { mensaje: 'Cuenta sin hash bcrypt configurado' } });
        }

        let verified = false;
        try {
            verified = await bcrypt.compare(passwordPlain, hash);
        } catch (e) {
            console.error('Error comparando contraseña con bcrypt:', e);
            return res.status(500).json({ error: 1, response: { mensaje: 'Error verificando credenciales' } });
        }

        if (!verified) {
            return res.status(401).json({ error: 1, response: { mensaje: 'Credenciales inválidas' } });
        }

        const token = jwt.sign(
            { userId: user._id, email: user.Cr_Nombre_Usuario || user.email },
            secret,
            { expiresIn: process.env.JWT_EXPIRES_IN || '12h' }
        );

        const perfil = user.Cr_Perfil ?? null;
        const empresa = user.Cr_Empresa ?? null;
        const ipsId = user.Cr_Ips ? (user.Cr_Ips._id || user.Cr_Ips) : null;
        const permisos = user.Cr_Pe_Codigo || null;
        const nombre = permisos?.Pe_Nombre || null;
        const apellido = permisos?.Pe_Apellido || null;
        const correo = permisos?.Pe_Correo || null;
        const cel = permisos?.Pe_Cel || null;
        const permiso = permisos?.Pe_Permiso || null;

        return res.status(200).json({
            error: 0,
            response: {
                mensaje: 'Login exitoso',
                id: user._id,
                ips_id: ipsId,
                token,
                perfil,
                empresa,
                nombre,
                apellido,
                correo,
                cel,
                permiso
            }
        });
    } catch (err) {
        console.error('Error en /login:', err);
        return res.status(500).json({ error: 1, response: { mensaje: 'Error interno del servidor' } });
    }
});

module.exports = router;
