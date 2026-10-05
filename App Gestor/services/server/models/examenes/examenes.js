const { mongoose } = require('../../conection/mongo');

const examenSchema = new mongoose.Schema(
    {
        NOMBRE: { type: String, required: true, trim: true, maxlength: 100 },
        DESCRIPCION: { type: String, trim: true, maxlength: 500, default: '' },
        ESTADO: { type: String, enum: ['ACTIVO', 'INACTIVO'], default: 'ACTIVO' },
        USUARIO_CREACION: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        USUARIO_MODIFICACION: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        FECHA_MODIFICACION: { type: Date, default: null }
    },
    { timestamps: true, collection: 'cl_examenes' }
);

module.exports = mongoose.model('Examen', examenSchema);
