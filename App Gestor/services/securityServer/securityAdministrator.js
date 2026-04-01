const jwt = require('jsonwebtoken');
class SecurityAdministrator {

  constructor() {

  }

  userAuthentication(app) {
    console.log('autenticando el usuario')
    app.use(async (req, res, next) => {
      console.log(`Tipo de peticion: ${req.method}`)
      console.log(`URL solicitada: ${req.url}`)
      next()
    })
  }


  tokenAutehntication = (req, res, next) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : authHeader;

    if (!token) {
      return res.status(401).json({ message: 'Token no proporcionado' });
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      return res.status(500).json({ message: 'Servidor sin JWT_SECRET configurado' });
    }

    jwt.verify(token, secret, (err, decodedToken) => {
      if (err) {
        return res.status(401).json({ message: 'Token inválido' });
      }
      req.userId = decodedToken.userId;
      next();
    });
  }



}

let securityAdministrator = new SecurityAdministrator();
module.exports = { securityAdministrator }