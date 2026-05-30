const express = require('express');
const jwt = require('jsonwebtoken');
const HojaVida = require('../server/models/hojaVida/hojaVida');
const { mongoose } = require('../server/conection/mongo');

const router = express.Router();

router.post('/liberar-caso', async (req, res) => {
    try {
        // Validar token de autorización
        const authHeader = req.headers['authorization'];
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                error: 1,
                response: { mensaje: 'Token inválido o expirado' }
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

        // Extraer datos del request
        const { caso_id, informe_liberacion, usuario_id } = req.body;

        // Validar parámetros requeridos
        if (!caso_id || !informe_liberacion || !usuario_id) {
            return res.status(400).json({
                error: 1,
                response: { mensaje: 'Faltan parámetros requeridos: caso_id, informe_liberacion, usuario_id' }
            });
        }

        // Validar que caso_id sea un ObjectId válido
        if (!mongoose.Types.ObjectId.isValid(caso_id)) {
            return res.status(400).json({
                error: 1,
                response: { mensaje: 'El caso_id no es válido' }
            });
        }

        // Validar que usuario_id sea un ObjectId válido
        if (!mongoose.Types.ObjectId.isValid(usuario_id)) {
            return res.status(400).json({
                error: 1,
                response: { mensaje: 'El usuario_id no es válido' }
            });
        }

        // Buscar el caso en la base de datos
        const caso = await HojaVida.findById(caso_id);

        if (!caso) {
            return res.status(404).json({
                error: 1,
                response: { mensaje: 'Caso no encontrado' }
            });
        }

        // Verificar que el caso tenga USUARIO_SIC asignado
        if (!caso.USUARIO_SIC) {
            return res.status(400).json({
                error: 1,
                response: { mensaje: 'El caso ya fue liberado previamente' }
            });
        }

        // Limpiar los campos del caso
        caso.USUARIO_SIC = null;
        caso.DETALLE_REUNION = undefined;
        caso.FECHA_HORA_CITA_PSICOLOGIA = undefined;
        caso.TIPO_REUNION = undefined;

        // Agregar información de liberación
        if (!caso.INFO_LIBERACION) {
            caso.INFO_LIBERACION = [];
        }

        caso.INFO_LIBERACION.push({
            caso_id,
            informe_liberacion,
            usuario_id,
            fecha_liberacion: new Date()
        });

        // Guardar los cambios en el caso
        await caso.save();

        // Respuesta exitosa
        return res.status(200).json({
            error: 0,
            response: {
                mensaje: 'Caso liberado exitosamente',
                data: {
                    caso_id: caso._id,
                    fecha_liberacion: new Date().toISOString()
                }
            }
        });

    } catch (err) {
        console.error('Error en /api/psico-gestion/liberar-caso:', err);
        return res.status(500).json({
            error: 1,
            response: { mensaje: 'Error interno del servidor' }
        });
    }
});

module.exports = router;
