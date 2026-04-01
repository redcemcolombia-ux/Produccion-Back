require('dotenv').config(); // carga las variables del .env

const WebServer = require('./services/webServices/class/webServerClass');

// lee el puerto del .env o usa 3000 por defecto
const port = process.env.PORT || 3000;

// Crear e iniciar el servidor web con toda la configuración
const webServer = new WebServer(port);
webServer.start();
