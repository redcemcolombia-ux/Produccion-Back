
const HojaVida = require('../server/models/hojaVida/hojaVida');
const Permiso = require('../server/models/permiso/permiso');
router.post('/por_documento', async (req, res) => {
    try {
        const { documento } = req.body;

        if (!documento) {
            return res.status(400).json({
                error: 1,
                response: { mensaje: "Debe enviar el número de documento" }
            });
        }

        
        const permiso = await Permiso.findOne({ Pe_Documento: documento });

        if (!permiso) {
            return res.status(404).json({
                error: 1,
                response: { mensaje: "No se encontraron permisos para este documento" }
            });
        }

        
        const hojaVida = await HojaVida.findOne(
            { DOCUMENTO: documento },
            {
                DOCUMENTO: 1,
                NOMBRE: 1,
                PRIMER_APELLIDO: 1,
                SEGUNDO_APELLIDO: 1,
                ESTADO: 1,
                TEXT_NOTIFICACION: 1,
                FECHA_INSCRIPCION: 1
            }
        );

        if (!hojaVida) {
            return res.status(404).json({
                error: 1,
                response: {
                    mensaje: "El documento tiene permiso, pero no se encontró hoja de vida relacionada"
                }
            });
        }

        
        return res.status(200).json({
            error: 0,
            response: {
                mensaje: "Consulta exitosa",
                data: {
                    permiso: {
                        _id: permiso._id,
                        Pe_Documento: permiso.Pe_Documento,
                        Pe_TipoPermiso: permiso.Pe_Permiso,
                        Pe_FechaPermiso: permiso.createdAt,
                        Pe_Observaciones: permiso.Pe_Observaciones || ""
                    },
                    hoja_vida: hojaVida
                }
            }
        });

    } catch (err) {
        console.error("Error en /api/estado_caso/por_documento:", err);
        return res.status(500).json({
            error: 1,
            response: { mensaje: "Error inesperado" }
        });
    }
});
