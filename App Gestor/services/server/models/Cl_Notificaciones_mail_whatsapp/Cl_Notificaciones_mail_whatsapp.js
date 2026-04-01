const { mongoose } = require('../../conection/mongo');

const notificacionSchema = new mongoose.Schema(
    {
        id_usuario: { 
            type: mongoose.Schema.Types.ObjectId, 
            ref: 'User', 
            required: true 
        },

        asunto: { 
            type: String, 
            required: true, 
            trim: true 
        },

        mensaje: { 
            type: String, 
            required: true 
        },

        ruta_documento_adjunto: { 
            type: String 
        },

        estado: { 
            type: String, 
            enum: ['ACTIVO', 'INACTIVO'], 
            default: 'INACTIVO' 
        }
    },
    { 
        timestamps: true,
        collection: 'Cl_Notificaciones_mail_whatsapp' 
    }
);

module.exports = mongoose.model('NotificacionMailWhatsapp', notificacionSchema);
