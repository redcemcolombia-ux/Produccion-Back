const { mongoose } = require('../../conection/mongo');

const permisoSchema = new mongoose.Schema(
    {
        Pe_Nombre: { type: String },
        Pe_Apellido: { type: String },
        Pe_Seg_Apellido: { type: String },
        Pe_Tipo_Documento: { type: String },
        Pe_Documento: { type: String },
        Pe_Telefons_Fijo: { type: String },
        Pe_Cel: { type: String },
        Pe_Correo: { type: String },
        Pe_Direccion: { type: String },
        Pe_Permiso: { type: String },
        Pe_Departamento: { type: String },
        Pe_Ciudad: { type: String }
    },
    { timestamps: true, collection: 'cl_permisos' }
);

module.exports = mongoose.model('Permiso', permisoSchema);