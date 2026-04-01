const { mongoose } = require('../../conection/mongo');

const hojaVidaSchema = new mongoose.Schema(
    {
        PKEYHOJAVIDA: { type: String },
        PKEYASPIRANT: { type: String },
        CODIPROGACAD: { type: String },
        ANNOPERIACAD: { type: Number },
        NUMEPERIACAD: { type: String },
        CODIGO_INSCRIPCION: { type: String },
        DOCUMENTO: { type: String },
        NOMBRE: { type: String },
        PRIMER_APELLIDO: { type: String },
        SEGUNDO_APELLIDO: { type: String },
        EDAD: { type: Number },
        GENERO: { type: String },
        FECH_NACIMIENTO: { type: String },
        CORREO: { type: String },
        TELEFONO: { type: String },
        CELULAR: { type: String },
        DIRECCION: { type: String },
        CIUDAD: { type: String },
        ESTADO: { type: String },
        DEPARTAMENTO: { type: String },
        REGIONAL: { type: String },
        COMPLEMENTARIA_1: { type: mongoose.Schema.Types.Mixed },
        COMPLEMENTARIA_2: { type: mongoose.Schema.Types.Mixed },
        FECHA_INSCRIPCION: { type: String },
        GRUP_MINO: { type: String },
        ESTRATO: { type: String },
        TIPO_MEDIO: { type: String },
        COLEGIO: { type: String },
        IPS_ID: { type: mongoose.Schema.Types.ObjectId, ref: 'IPS' },
        PDF_URL: { type: String },
        // Campos de agendamiento
        FECHA_HORA: { type: Date },
        FECHA_HORA_CITA_PSICOLOGIA: { type: Date },
        EXAMENES: { type: String },
        RECOMENDACIONES: { type: String },
        USUARIO_ID: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        DETALLE: { type: String },
        TIPO_REUNION: { type: String },
        DETALLE_REUNION: { type: String },
        TEXT_NOTIFICACION: { type: String },
        ESTADO_NOTIFICACION: { type: String, default: "TOMADO POR PSICOLOGIA" },
        H_ESTADO_NOTIFICACION_CONSENTIMIENTO: {type: String, default: "SIN GESTION"},
        USUARIO_SIC: { type: String },
        RUTA_NOTIFICACION_RECIBIDA: {type:String},
        RUTA_BIOMETRIA: {
            ruta: { type: String, default: null },
            id_usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
            fecha: { type: Date, default: null }
        }

    },
    { timestamps: true, collection: 'cl_hoja_vida' }
);

module.exports = mongoose.model('HojaVida', hojaVidaSchema);