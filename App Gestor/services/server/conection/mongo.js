const mongoose = require('mongoose');

const connectMongo = async () => {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        console.error('MONGODB_URI no está configurado en .env');
        process.exit(1);
    }

    try {
        await mongoose.connect(uri);
        console.log('MongoDB conectado');
    } catch (err) {
        console.error('Error conectando a MongoDB:', err);
        process.exit(1);
    }
};

module.exports = { connectMongo, mongoose };