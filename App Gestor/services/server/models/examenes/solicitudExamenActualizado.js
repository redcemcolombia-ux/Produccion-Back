const { mongoose } = require('../../conection/mongo');

const solicitudExamenActualizadoSchema = new mongoose.Schema({
    hojaVidaId: { type: mongoose.Schema.Types.ObjectId, ref: 'HojaVida', required: true, index: true },
    ipsId: { type: mongoose.Schema.Types.ObjectId, ref: 'IPS', required: true },
    gestorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    motivo: { type: String, required: true, trim: true, maxlength: 1000 }
}, { timestamps: true, collection: 'cl_solicitudes_examenes_actualizados' });

module.exports = mongoose.model('SolicitudExamenActualizado', solicitudExamenActualizadoSchema);
