const { mongoose } = require('../../conection/mongo');

const controlUsoIpsSchema = new mongoose.Schema(
    {
        id_usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        co_cantidad: { type: Number, default: 0 },
        co_estado: { type: Boolean, default: true }
    },
    { timestamps: true, collection: 'cl_control_uso_ips' }
);

module.exports = mongoose.model('ControlUsoIps', controlUsoIpsSchema);
