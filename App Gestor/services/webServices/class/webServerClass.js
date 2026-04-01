const http = require('http');
const express = require('express');
const mime = require('mime-types');
const cors = require('cors');
const { connectMongo, mongoose } = require('../../server/conection/mongo');
const authRoutes = require('../../auth/authRoutes');
const { securityAdministrator } = require('../../securityServer/securityAdministrator');
const userRoutes = require('../../user/userRoutes');
const hojaVidaRoutes = require('../../hojaVida/hojaVidaRoutes');
const pdf = require('../../pdf/pdf');
const ipsRoutes = require('../../ipsRoutes/ipsRoutes');
const notificaciones = require('../../notificaciones/notificaciones');
const preguntasPsicologia = require('../../psicologia/preguntas');

class WebServer {
    constructor(port) {
        this.port = port;
        this.app = express();
        this.server = http.createServer(this.app);
        this.publicPath = require('path').resolve(__dirname, '../../public');
        // this.pathSetUp= new PathSetUp();

        // Configuración de CORS
        const corsOptions = {
            origin: [
                'http://localhost:4200',
                'http://3.142.186.227:4200'
            ],
            credentials: true,
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization'],
            optionsSuccessStatus: 200
        };

        this.app.use(cors(corsOptions));

        this.app.use(express.json());

        this.app.use(express.static(this.publicPath, {
            setHeaders: (res, filePath) => {
                const mimeType = mime.lookup(filePath);
                if (mimeType) {
                    res.setHeader('Content-Type', mimeType);
                }
            }
        }));

        // Endpoint de salud para comprobar la conexión a MongoDB
        this.app.get('/api/health/db', (req, res) => {
            const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
            res.json({
                readyState: mongoose.connection.readyState,
                state: states[mongoose.connection.readyState]
            });
        });
        this.app.use(express.json());
        this.app.use('/api/auth', authRoutes);
        this.app.use('/api/users', userRoutes);
        this.app.use('/api/hojas-vida', hojaVidaRoutes); 
        this.app.use('/api/ips', ipsRoutes);
        this.app.use('/api/pdf', pdf);
        this.app.use('/api/estado_caso', pdf);
        this.app.use('/api/notificaciones', notificaciones);
        this.app.use('/api/preguntas_psicologia', preguntasPsicologia);
    }

    /* _userAuthentication() {
        securityAdministrator.userAuthentication(this.app);
    }
    _tokenAuthentication(){
       // securityAdministrator.tokenAutehntication(this.app);
    }
    _setupRoutes(app,express,publicPath,securityAdministrator){
    this.pathSetUp.setRoutes(app,express,publicPath,securityAdministrator);
        
    } */

    async start() {
        console.log('[webserver] MONGODB_URI:', process.env.MONGODB_URI);
        securityAdministrator.userAuthentication(this.app);
        await connectMongo();

        /* this._userAuthentication();
        this._tokenAuthentication();
        this._setupRoutes(this.app,express,this.publicPath,securityAdministrator); */
        this.server.listen(this.port, () => {
            console.log(`Server listening on port ${this.port}`);
        });
    }

}

module.exports = WebServer;