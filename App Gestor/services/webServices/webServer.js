const WebServer = require('./class/webServerClass');
const webServer = new WebServer(process.env.WEBPORT);

webServer.start();

module.exports={webServer}; 