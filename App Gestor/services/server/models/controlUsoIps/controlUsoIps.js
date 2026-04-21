const { mongoose } = require('../../conection/mongo');

const controlUsoIpsSchema = new mongoose.Schema(
    {
        id_usuario: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        co_cantidad: {
            type: Number,
            required: true,
            default: 0
        },
        co_estado: {
            type: Boolean,
            required: true,
            default: true
        },
        co_fecha_registro: {
            type: String,
            required: true
        },
        co_hora_registro: {
            type: String,
            required: true
        }
    },
    { timestamps: true, collection: 'cl_control_uso_ips' }
);

module.exports = mongoose.model('ControlUsoIps', controlUsoIpsSchema);
