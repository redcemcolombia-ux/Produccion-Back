const { mongoose } = require('../../conection/mongo');

const soporteExamenActualizadoSchema = new mongoose.Schema({
    hojaVidaId: { type: mongoose.Schema.Types.ObjectId, ref: 'HojaVida', required: true, index: true },
    solicitudId: { type: mongoose.Schema.Types.ObjectId, ref: 'SolicitudExamenActualizado', required: true, unique: true },
    ipsId: { type: mongoose.Schema.Types.ObjectId, ref: 'IPS', required: true },
    usuarioId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    nombreArchivo: { type: String, required: true },
    nombreOriginal: { type: String, required: true }
}, { timestamps: true, collection: 'cl_soportes_examenes_actualizados' });

module.exports = mongoose.model('SoporteExamenActualizado', soporteExamenActualizadoSchema);
