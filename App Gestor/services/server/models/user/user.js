const { mongoose } = require('../../conection/mongo');

const userSchema = new mongoose.Schema(
    {
        Cr_Nombre_Usuario: { type: String, required: true, unique: true, trim: true, lowercase: false },
        Cr_Password: { type: String, required: true },
        Cr_Perfil: { type: String },
        Cr_Empresa: { type: String },
        Cr_Estado: { type: String },
        Cr_Ips: { type: mongoose.Schema.Types.ObjectId, ref: 'IPS' },
        
        Cr_Pe_Codigo: { type: mongoose.Schema.Types.ObjectId, ref: 'Permiso' }
    },
    { timestamps: true, collection: 'cl_credencial' }
);

userSchema.set('toJSON', {
    transform: (doc, ret) => {
        delete ret.Cr_Password;
        return ret;
    }
});

module.exports = mongoose.model('User', userSchema);