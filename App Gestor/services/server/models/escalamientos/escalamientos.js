const { mongoose } = require('../../conection/mongo');

const escalamientoSchema = new mongoose.Schema(
    {
        descripcion: {
            type: String,
            required: true,
            minlength: 100,
            maxlength: 5000,
            trim: true
        },
        prioridad: {
            type: String,
            required: true,
            enum: ['ALTO', 'MEDIO', 'BAJO']
        },
        usuario_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        evidencia: {
            ruta: { type: String, default: null },
            nombre_original: { type: String, default: null },
            fecha_subida: { type: Date, default: Date.now }
        },
        estado: {
            type: String,
            default: 'PENDIENTE',
            enum: ['PENDIENTE', 'EN_PROCESO', 'RESUELTO', 'CERRADO']
        },
        fecha_resolucion: {
            type: Date,
            default: null
        },
        usuario_asignado: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null
        },
        notas_resolucion: {
            type: String,
            default: null
        }
    },
    {
        timestamps: true,
        collection: 'cl_escalamientos'
    }
);

module.exports = mongoose.model('Escalamiento', escalamientoSchema);
