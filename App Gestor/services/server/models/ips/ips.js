
const { mongoose } = require('../../conection/mongo');

const ipsSchema = new mongoose.Schema(
  { 
    NOMBRE_IPS: { type: String, required: true },
    NIT: { type: String },
    DIRECCION: { type: String },
    TELEFONO: { type: String },
    CORREO: { type: String },
    REPRESENTANTE: { type: String },
    CIUDAD: { type: String },
    DEPARTAMENTO: { type: String },
    REGIONAL: { type: String },
    ESTADO: { type: String, default: 'ACTIVA' },
    COMPLEMENTARIA_1: { type: mongoose.Schema.Types.Mixed },
    COMPLEMENTARIA_2: { type: mongoose.Schema.Types.Mixed },
    FECHA_REGISTRO: { type: String, default: new Date().toISOString() }
  },
  { timestamps: true, collection: 'cl_ips' }
);

module.exports = mongoose.model('IPS', ipsSchema);
