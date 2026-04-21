const router = require('express').Router();
const jwt = require('jsonwebtoken');
const ControlUsoIps = require('../server/models/controlUsoIps/controlUsoIps');
const User = require('../server/models/user/user');

const secret = process.env.JWT_SECRET || 'EsteEsMiSecreto';

// Servicio para gestionar el control de uso de IPS
router.post('/gestionar', async (req, res) => {
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
        if (!secret) {
            return res.status(500).json({
                error: 1,
                response: { mensaje: 'Servidor sin JWT_SECRET configurado' }
            });
        }

        try {
            jwt.verify(token, secret);
        } catch (error) {
            return res.status(401).json({
                error: 1,
                response: { mensaje: 'Token inválido o expirado' }
            });
        }

        // Validar parámetros requeridos
        const { id_usuario, co_cantidad } = req.body;

        if (!id_usuario) {
            return res.status(400).json({
                error: 1,
                response: { mensaje: 'El id_usuario es obligatorio' }
            });
        }

        // Validar que id_usuario sea un ObjectId válido
        const mongoose = require('mongoose');
        if (!mongoose.Types.ObjectId.isValid(id_usuario)) {
            return res.status(400).json({
                error: 1,
                response: { mensaje: 'El id_usuario no es un ObjectId válido' }
            });
        }

        if (co_cantidad === undefined || co_cantidad === null) {
            return res.status(400).json({
                error: 1,
                response: { mensaje: 'El co_cantidad es obligatorio' }
            });
        }

        // Validar que co_cantidad sea un número
        if (typeof co_cantidad !== 'number' || co_cantidad < 0) {
            return res.status(400).json({
                error: 1,
                response: { mensaje: 'El co_cantidad debe ser un número mayor o igual a 0' }
            });
        }

        // Verificar que el usuario existe
        const usuarioExiste = await User.findById(id_usuario);
        if (!usuarioExiste) {
            return res.status(404).json({
                error: 1,
                response: { mensaje: 'Usuario no encontrado' }
            });
        }

        // Buscar registros previos del usuario
        const registroPrevio = await ControlUsoIps.findOne({ id_usuario }).sort({ createdAt: -1 });

        // Obtener fecha y hora actuales
        const now = new Date();
        const co_fecha_registro = now.toISOString().split('T')[0]; // YYYY-MM-DD
        const co_hora_registro = now.toTimeString().split(' ')[0]; // HH:MM:SS

        // Caso 1: No existe registro previo - crear nuevo
        if (!registroPrevio) {
            const nuevoRegistro = new ControlUsoIps({
                id_usuario,
                co_cantidad,
                co_estado: true,
                co_fecha_registro,
                co_hora_registro
            });

            const registroGuardado = await nuevoRegistro.save();
            console.log('[/gestionar] Nuevo registro creado:', registroGuardado._id);

            return res.status(201).json({
                error: 0,
                response: {
                    mensaje: 'Registro creado exitosamente',
                    datos: {
                        id: registroGuardado._id,
                        id_usuario: registroGuardado.id_usuario,
                        co_cantidad: registroGuardado.co_cantidad,
                        co_estado: registroGuardado.co_estado,
                        co_fecha_registro: registroGuardado.co_fecha_registro,
                        co_hora_registro: registroGuardado.co_hora_registro
                    }
                }
            });
        }

        // Caso 2: Existe registro previo
        // Validar si co_cantidad = 0 Y co_estado = true
        if (registroPrevio.co_cantidad === 0 && registroPrevio.co_estado === true) {
            // Actualizar registro actual con co_estado = false
            registroPrevio.co_estado = false;
            await registroPrevio.save();
            console.log('[/gestionar] Registro anterior actualizado a inactivo:', registroPrevio._id);

            // Crear nuevo registro con los datos recibidos
            const nuevoRegistro = new ControlUsoIps({
                id_usuario,
                co_cantidad,
                co_estado: true,
                co_fecha_registro,
                co_hora_registro
            });

            const registroGuardado = await nuevoRegistro.save();
            console.log('[/gestionar] Nuevo registro creado tras actualizar anterior:', registroGuardado._id);

            return res.status(201).json({
                error: 0,
                response: {
                    mensaje: 'Registro anterior actualizado y nuevo registro creado exitosamente',
                    registro_anterior: {
                        id: registroPrevio._id,
                        co_estado: registroPrevio.co_estado
                    },
                    nuevo_registro: {
                        id: registroGuardado._id,
                        id_usuario: registroGuardado.id_usuario,
                        co_cantidad: registroGuardado.co_cantidad,
                        co_estado: registroGuardado.co_estado,
                        co_fecha_registro: registroGuardado.co_fecha_registro,
                        co_hora_registro: registroGuardado.co_hora_registro
                    }
                }
            });
        }

        // Caso 3: co_cantidad es diferente de 0
        if (registroPrevio.co_cantidad !== 0) {
            return res.status(200).json({
                error: 0,
                response: {
                    mensaje: `Tiene una cantidad de casos activos de ${registroPrevio.co_cantidad}`,
                    datos: {
                        id: registroPrevio._id,
                        id_usuario: registroPrevio.id_usuario,
                        co_cantidad: registroPrevio.co_cantidad,
                        co_estado: registroPrevio.co_estado,
                        co_fecha_registro: registroPrevio.co_fecha_registro,
                        co_hora_registro: registroPrevio.co_hora_registro
                    }
                }
            });
        }

        // Caso 4: co_cantidad = 0 pero co_estado = false
        return res.status(200).json({
            error: 0,
            response: {
                mensaje: 'El registro anterior está inactivo',
                datos: {
                    id: registroPrevio._id,
                    co_cantidad: registroPrevio.co_cantidad,
                    co_estado: registroPrevio.co_estado
                }
            }
        });

    } catch (error) {
        console.error('Error en /gestionar:', error);
        console.error('Stack trace:', error.stack);
        return res.status(500).json({
            error: 1,
            response: {
                mensaje: 'Error interno del servidor',
                detalle: error.message
            }
        });
    }
});

// Servicio para listar usuarios con perfil "usuario" y su control de uso
router.get('/listar-usuarios', async (req, res) => {
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

        if (!secret) {
            return res.status(500).json({
                error: 1,
                response: { mensaje: 'Servidor sin JWT_SECRET configurado' }
            });
        }

        try {
            jwt.verify(token, secret);
        } catch (error) {
            return res.status(401).json({
                error: 1,
                response: { mensaje: 'Token inválido o expirado' }
            });
        }

        // Buscar usuarios con perfil "Usuario"
        const usuarios = await User.find({ Cr_Perfil: 'Usuario' })
            .populate('Cr_Pe_Codigo')
            .populate('Cr_Ips')
            .sort({ createdAt: -1 })
            .lean();

        // Para cada usuario, buscar su registro activo en control_uso_ips
        const usuariosConControl = await Promise.all(
            usuarios.map(async (usuario) => {
                // Buscar registro con co_estado = true
                const controlActivo = await ControlUsoIps.findOne({
                    id_usuario: usuario._id,
                    co_estado: true
                }).lean();

                // Si no hay registro activo, agregar valores por defecto
                if (!controlActivo) {
                    return {
                        ...usuario,
                        control_uso: {
                            co_cantidad: 0,
                            co_estado: false,
                            co_fecha_registro: 'sin gestion',
                            co_hora_registro: 'sin gestion'
                        }
                    };
                }

                // Si hay registro activo, incluir sus datos
                return {
                    ...usuario,
                    control_uso: {
                        id: controlActivo._id,
                        co_cantidad: controlActivo.co_cantidad,
                        co_estado: controlActivo.co_estado,
                        co_fecha_registro: controlActivo.co_fecha_registro,
                        co_hora_registro: controlActivo.co_hora_registro
                    }
                };
            })
        );

        return res.status(200).json({
            error: 0,
            response: {
                mensaje: `Se encontraron ${usuariosConControl.length} usuarios con perfil 'Usuario'`,
                total: usuariosConControl.length,
                usuarios: usuariosConControl
            }
        });

    } catch (error) {
        console.error('Error en /listar-usuarios:', error);
        return res.status(500).json({
            error: 1,
            response: {
                mensaje: 'Error interno del servidor',
                detalle: error.message
            }
        });
    }
});

// Servicio para listar todos los registros de un usuario específico
router.post('/historial-usuario', async (req, res) => {
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

        if (!secret) {
            return res.status(500).json({
                error: 1,
                response: { mensaje: 'Servidor sin JWT_SECRET configurado' }
            });
        }

        try {
            jwt.verify(token, secret);
        } catch (error) {
            return res.status(401).json({
                error: 1,
                response: { mensaje: 'Token inválido o expirado' }
            });
        }

        // Validar parámetro requerido
        const { id_usuario } = req.body;

        if (!id_usuario) {
            return res.status(400).json({
                error: 1,
                response: { mensaje: 'El id_usuario es obligatorio' }
            });
        }

        // Validar que id_usuario sea un ObjectId válido
        const mongoose = require('mongoose');
        if (!mongoose.Types.ObjectId.isValid(id_usuario)) {
            return res.status(400).json({
                error: 1,
                response: { mensaje: 'El id_usuario no es un ObjectId válido' }
            });
        }

        // Verificar que el usuario existe
        const usuarioExiste = await User.findById(id_usuario)
            .populate('Cr_Pe_Codigo')
            .populate('Cr_Ips')
            .lean();

        if (!usuarioExiste) {
            return res.status(404).json({
                error: 1,
                response: { mensaje: 'Usuario no encontrado' }
            });
        }

        // Buscar todos los registros del usuario (sin importar co_estado)
        const registros = await ControlUsoIps.find({ id_usuario })
            .sort({ createdAt: -1 })
            .lean();

        return res.status(200).json({
            error: 0,
            response: {
                mensaje: `Se encontraron ${registros.length} registros para el usuario`,
                total: registros.length,
                usuario: {
                    id: usuarioExiste._id,
                    nombre_usuario: usuarioExiste.Cr_Nombre_Usuario,
                    perfil: usuarioExiste.Cr_Perfil,
                    persona: usuarioExiste.Cr_Pe_Codigo,
                    ips: usuarioExiste.Cr_Ips
                },
                registros: registros
            }
        });

    } catch (error) {
        console.error('Error en /historial-usuario:', error);
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
