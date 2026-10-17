const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const bcrypt = require('bcryptjs');
const { mongoose } = require('../server/conection/mongo');
const User = require('../server/models/user/user');
const IPS = require('../server/models/ips/ips');
const HojaVida = require('../server/models/hojaVida/hojaVida');
const Solicitud = require('../server/models/examenes/solicitudExamenActualizado');
const Soporte = require('../server/models/examenes/soporteExamenActualizado');
const WebServer = require('../webServices/class/webServerClass');

function crearPdf(texto) {
    const contenido = `BT /F1 12 Tf 72 720 Td (${texto}) Tj ET`;
    const objetos = [
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
        `<< /Length ${Buffer.byteLength(contenido)} >>\nstream\n${contenido}\nendstream`,
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
    ];
    let pdf = '%PDF-1.4\n';
    const offsets = [0];
    objetos.forEach((objeto, indice) => {
        offsets.push(Buffer.byteLength(pdf));
        pdf += `${indice + 1} 0 obj\n${objeto}\nendobj\n`;
    });
    const xref = Buffer.byteLength(pdf);
    pdf += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
    offsets.slice(1).forEach(offset => {
        pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
    });
    pdf += `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return Buffer.from(pdf);
}

test('solicitud, carga, consulta y descarga con MongoDB local real', async () => {
    const uri = process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27019/redcem_examenes_actualizados_test';
    const parsed = new URL(uri);
    if (parsed.hostname !== '127.0.0.1' || parsed.pathname !== '/redcem_examenes_actualizados_test') {
        throw new Error('La prueba solo puede usar la base local redcem_examenes_actualizados_test');
    }
    process.env.JWT_SECRET = 'secreto-local-de-pruebas';

    let servidor;
    let caso;
    const usuarios = [];
    const ipsCreadas = [];
    try {
        await mongoose.connect(uri, { serverSelectionTimeoutMS: 3000 });
        const [ips, otraIps] = await IPS.create([
            { NOMBRE_IPS: `IPS Prueba ${randomUUID()}` },
            { NOMBRE_IPS: `Otra IPS Prueba ${randomUUID()}` }
        ]);
        ipsCreadas.push(ips._id, otraIps._id);
        const clave = 'clave-local-de-prueba';
        const hash = await bcrypt.hash(clave, 4);
        for (const [perfil, ipsId] of [
            ['Cliente Gestor', null], ['Usuario', ips._id],
            ['Usuario', otraIps._id], ['Cliente Informes', null]
        ]) {
            const usuario = await User.create({
                Cr_Nombre_Usuario: `prueba-${randomUUID()}`,
                Cr_Password: hash, Cr_Perfil: perfil, Cr_Ips: ipsId
            });
            usuarios.push(usuario);
        }
        caso = await HojaVida.create({
            NOMBRE: 'Caso de prueba', IPS_ID: ips._id,
            PDF_URL: '/uploads/pdf/original.pdf', ESTADO: 'EN ESPERA',
            RUTA_EXAMENES: { ruta: '/uploads/pdf/original.pdf' },
            HISTORIAL_EXAMENES: []
        });
        const estadoAntes = {
            pdf: caso.PDF_URL, estado: caso.ESTADO,
            ruta: caso.RUTA_EXAMENES.ruta, historial: caso.HISTORIAL_EXAMENES.length
        };

        const web = new WebServer(0);
        servidor = web.server;
        await new Promise(resolve => servidor.listen(0, '127.0.0.1', resolve));
        const base = `http://127.0.0.1:${servidor.address().port}`;
        const ruta = `${base}/api/hojas-vida/${caso._id}/examenes-actualizados`;
        async function login(usuario) {
            const respuesta = await fetch(`${base}/api/auth/login`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: usuario.Cr_Nombre_Usuario, password: clave })
            });
            assert.equal(respuesta.status, 200);
            return { Authorization: `Bearer ${(await respuesta.json()).response.token}` };
        }
        const [gestor, usuarioIps, usuarioOtraIps, informes] = await Promise.all(usuarios.map(login));
        async function solicitar(motivo, headers = gestor) {
            return fetch(`${ruta}/solicitudes`, {
                method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({ motivo })
            });
        }
        async function cargar(solicitudId, pdf, headers = usuarioIps) {
            const form = new FormData();
            form.set('solicitud_id', String(solicitudId));
            form.set('pdf', new Blob([pdf], { type: 'application/pdf' }), 'resultado.pdf');
            return fetch(ruta, { method: 'POST', headers, body: form });
        }

        assert.equal((await solicitar('Dudas del resultado', usuarioIps)).status, 403);
        assert.equal((await solicitar('Dudas del resultado', informes)).status, 403);
        assert.equal((await solicitar('corto')).status, 400);
        const solicitudRespuesta = await solicitar('Se requiere un examen actualizado para validar el resultado');
        assert.equal(solicitudRespuesta.status, 201);
        const solicitudId = (await solicitudRespuesta.json()).response.id;
        assert.equal(await Solicitud.countDocuments({ _id: solicitudId, hojaVidaId: caso._id }), 1);

        const pendientes = await fetch(`${ruta}/solicitudes`, { headers: usuarioIps });
        assert.equal(pendientes.status, 200);
        assert.equal((await pendientes.json()).response[0].estado, 'PENDIENTE');
        const pdf1 = crearPdf('Primer examen');
        const pdf2 = crearPdf('Segundo examen');
        assert.equal((await cargar(solicitudId, pdf1, gestor)).status, 403);
        assert.equal((await cargar(solicitudId, pdf1, usuarioOtraIps)).status, 404);
        assert.equal((await cargar(new mongoose.Types.ObjectId(), pdf1)).status, 404);
        assert.equal((await cargar(solicitudId, Buffer.from('no es PDF'))).status, 400);
        assert.equal((await cargar(solicitudId, Buffer.alloc(40 * 1024 * 1024 + 1))).status, 400);
        const primeraCarga = await cargar(solicitudId, pdf1);
        assert.equal(primeraCarga.status, 201);
        const soporte1 = (await primeraCarga.json()).response;
        assert.equal((await cargar(solicitudId, pdf1)).status, 409);

        const segundaSolicitud = await solicitar('Solicitamos una segunda validacion documentada');
        assert.equal(segundaSolicitud.status, 201);
        const segundoId = (await segundaSolicitud.json()).response.id;
        const segundaCarga = await cargar(segundoId, pdf2);
        assert.equal(segundaCarga.status, 201);
        const soporte2 = (await segundaCarga.json()).response;
        assert.notEqual(soporte1.id, soporte2.id);

        const terceraSolicitud = await solicitar('Se requiere otra validacion para concurrencia');
        assert.equal(terceraSolicitud.status, 201);
        const tercerId = (await terceraSolicitud.json()).response.id;
        const simultaneas = await Promise.all([cargar(tercerId, pdf1), cargar(tercerId, pdf2)]);
        assert.deepEqual(simultaneas.map(r => r.status).sort(), [201, 409]);

        for (const headers of [gestor, usuarioIps, informes]) {
            const listado = await fetch(ruta, { headers });
            assert.equal(listado.status, 200);
            assert.equal((await listado.json()).response.length, 3);
            const solicitudes = await fetch(`${ruta}/solicitudes`, { headers });
            assert.equal(solicitudes.status, 200);
            assert.ok((await solicitudes.json()).response.every(s => s.estado === 'ATENDIDA'));
        }
        for (const [soporte, esperado] of [[soporte1, pdf1], [soporte2, pdf2]]) {
            const descarga = await fetch(base + soporte.archivo_url, { headers: gestor });
            assert.equal(descarga.status, 200);
            assert.deepEqual(Buffer.from(await descarga.arrayBuffer()), esperado);
        }
        assert.equal((await fetch(ruta, { headers: usuarioOtraIps })).status, 404);
        assert.equal((await fetch(base + soporte1.archivo_url, { headers: usuarioOtraIps })).status, 404);
        assert.equal((await fetch(ruta)).status, 401);
        assert.equal((await fetch(`${base}/api/pdf/pdf/archivo.pdf`)).status, 401);

        const persistidos = await Soporte.find({ hojaVidaId: caso._id }).lean();
        assert.equal(persistidos.length, 3);
        assert.equal(new Set(persistidos.map(s => String(s.solicitudId))).size, 3);
        const archivosCaso = (await fs.readdir(path.join(__dirname, '../uploads/pdf/examenes-actualizados')))
            .filter(nombre => nombre.startsWith(`examen_actualizado_${caso._id}_`));
        assert.equal(archivosCaso.length, persistidos.length);
        const actualizado = await HojaVida.findById(caso._id).lean();
        assert.deepEqual({
            pdf: actualizado.PDF_URL, estado: actualizado.ESTADO,
            ruta: actualizado.RUTA_EXAMENES.ruta,
            historial: actualizado.HISTORIAL_EXAMENES.length
        }, estadoAntes);
    } finally {
        if (servidor) await new Promise(resolve => servidor.close(resolve));
        if (mongoose.connection.readyState === 1) {
            if (caso) {
                const dir = path.join(__dirname, '../uploads/pdf/examenes-actualizados');
                const nombres = await fs.readdir(dir).catch(() => []);
                for (const nombre of nombres.filter(n => n.startsWith(`examen_actualizado_${caso._id}_`))) {
                    await fs.unlink(path.join(dir, nombre)).catch(() => {});
                }
                await Soporte.deleteMany({ hojaVidaId: caso._id });
                await Solicitud.deleteMany({ hojaVidaId: caso._id });
                await HojaVida.deleteOne({ _id: caso._id });
            }
            await User.deleteMany({ _id: { $in: usuarios.map(u => u._id) } });
            await IPS.deleteMany({ _id: { $in: ipsCreadas } });
            await mongoose.disconnect();
        }
    }
});
