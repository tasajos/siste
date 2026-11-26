import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { io as connect } from 'socket.io-client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

if (process.env.NODE_ENV !== 'test' || !process.env.DB_NAME?.endsWith('_test')) {
  throw new Error('Usa NODE_ENV=test y una base de datos independiente cuyo nombre termine en _test.');
}
const { app } = await import('../src/app.js');
const { pool, run, rows } = await import('../src/db.js');
const { attachSockets } = await import('../src/notifications.js');
const path = '/api/v1';
const api = request(app);
const prefix = randomBytes(4).toString('hex');
const secret = 'Prueba!2026-' + prefix;
type User = { id: number; token: string; email: string };
let admin: User, citizen: User, teammate: User, observer: User;
let incident: number, operation: number, team: number, resource: number, shelter: number, person: number;
const auth = (user: User) => ({ Authorization: 'Bearer ' + user.token });
const url = (route: string) => path + route;
function login(email: string, key = secret) { return api.post(url('/auth/login')).send({ correo: email, clave: key }); }
async function user(name: string, role?: string): Promise<User> {
  const email = name + '-' + prefix + '@example.com';
  if (role) await run('INSERT INTO usuarios (nombre,correo,password_hash,rol) VALUES (?,?,?,?)', [name, email, await bcrypt.hash(secret, 12), role]);
  else await api.post(url('/auth/register')).send({ nombre: name, correo: email, clave: secret }).expect(201);
  const { body } = await login(email).expect(200);
  return { id: body.usuario.id, token: body.token, email };
}
async function create(route: string, payload: object, actor = admin) {
  const { body } = await api.post(url(route)).set(auth(actor)).send(payload).expect(201);
  return Number(body.id);
}
beforeAll(async () => {
  await api.get(url('/health')).expect(200, { estado: 'ok', database: 'mysql' });
  admin = await user('admin','administrador');
  teammate = await user('equipo', 'equipo');
  observer = await user('observador');
}, 15000);
afterAll(async () => { await pool.end(); });
describe.sequential('Mi Comunidad Segura · API con MySQL', () => {
  it('PF-01 registra una cuenta ciudadana y rechaza el rol inyectado', async () => {
    await api.post(url('/auth/register')).send({ nombre: 'Intento', correo: 'rol-' + prefix + '@example.com', clave: secret, rol: 'administrador' }).expect(422);
    citizen = await user('ciudadano');
    expect((await api.get(url('/auth/me')).set(auth(citizen)).expect(200)).body.rol).toBe('ciudadano');
  });
  it('PF-02 inicia sesión, rota la cookie y la revoca en el logout', async () => {
    const client = request.agent(app);
    const entry = await client.post(url('/auth/login')).send({ correo: citizen.email, clave: secret }).expect(200);
    expect(entry.headers['set-cookie'][0]).toContain('HttpOnly');
    const refreshed = await client.post(url('/auth/refresh')).expect(200);
    expect(refreshed.headers['set-cookie'][0]).not.toEqual(entry.headers['set-cookie'][0]);
    await client.post(url('/auth/logout')).expect(204);
    await api.get(url('/auth/me')).set('Authorization', 'Bearer ' + refreshed.body.token).expect(401);
    await client.post(url('/auth/refresh')).expect(401);
  });
  it('PF-03 rechaza una contraseña incorrecta', async () => { await login(citizen.email, 'incorrecta').expect(401); });
  it('PF-04 restringe usuarios, auditoría y operaciones', async () => {
    await api.get(url('/usuarios')).set(auth(citizen)).expect(403);
    await api.get(url('/personas')).set(auth(citizen)).expect(403);
    await api.get(url('/operaciones')).set(auth(citizen)).expect(403);
    await api.get(url('/auditorias')).set(auth(admin)).expect(200);
  });
  it('PF-05 crea un incidente con prioridad preliminar y conserva su historial', async () => {
    incident = await create('/emergencias', { titulo: 'Simulacro ' + prefix, descripcion: 'Ejercicio ficticio de reporte comunitario.', tipo: 'incendio_forestal', municipio_id: 30903,
      prioridad: 'critica', latitud: -17.331224, longitud: -66.214802, fecha: new Date().toISOString() }, citizen);
    const result = await api.get(url('/emergencias/' + incident)).set(auth(citizen)).expect(200);
    expect(result.body.verificacion).toBe('pendiente');
    await api.get(url('/emergencias/' + incident + '/historial')).set(auth(citizen)).expect(200);
  });
  it('PF-06 filtra incidentes y aísla reportes pendientes de terceros', async () => {
    const { body } = await api.get(url('/emergencias?municipio_id=30903&prioridad=critica&q=' + prefix)).set(auth(citizen)).expect(200);
    expect(body.data[0].id).toBe(incident);
    await api.get(url('/emergencias/' + incident)).set(auth(observer)).expect(404);
    await api.get(url('/emergencias?municipio_id=0')).set(auth(citizen)).expect(422);
  });
  it('PF-07 devuelve las coordenadas visibles y los catálogos del mapa', async () => {
    const { body } = await api.get(url('/emergencias/' + incident)).set(auth(citizen)).expect(200);
    expect([body.latitud, body.longitud]).toEqual([-17.331224, -66.214802]);
    expect((await api.get(url('/municipios?provincia_id=309')).set(auth(citizen)).expect(200)).body).toHaveLength(5);
  });
  it('PF-08 comprueba permisos de verificación y separa publicación', async () => {
    await api.patch(url('/emergencias/' + incident + '/verificacion')).set(auth(citizen)).send({ verificacion: 'verificada' }).expect(403);
    await api.patch(url('/emergencias/' + incident + '/verificacion')).set(auth(admin)).send({ alerta_publica: true }).expect(409);
    await api.patch(url('/emergencias/' + incident + '/verificacion')).set(auth(admin)).send({ verificacion: 'verificada' }).expect(204);
    await api.get(url('/emergencias/' + incident)).set(auth(observer)).expect(404);
  });
  it('PF-09 actualiza el estado y registra el cambio', async () => {
    await api.patch(url('/emergencias/' + incident + '/estado')).set(auth(admin)).send({ estado: 'en_atencion' }).expect(204);
    const { body } = await api.get(url('/emergencias/' + incident + '/historial')).set(auth(admin)).expect(200);
    expect(body[0].detalle.estado).toBe('en_atencion');
  });
  it('PF-10 y PF-11 registran una persona ficticia y conservan los seguimientos', async () => {
    person = await create('/personas', { emergencia_id: incident, nombre: 'Caso ficticio ' + prefix, edad: 14, ubicacion: 'Lugar de simulación', fecha: new Date().toISOString() });
    await api.post(url('/personas/' + person + '/seguimiento')).set(auth(admin)).send({ estado: 'localizada', verificacion: 'verificada', observaciones: 'Caso de prueba.' }).expect(201);
    const { body } = await api.get(url('/personas/' + person + '/seguimiento')).set(auth(admin)).expect(200);
    expect(body.map((item: { estado: string }) => item.estado)).toEqual(['localizada','reportada']);
  });
  it('PF-12 y PF-13 registran equipo, asignan operación y aceptan avances del equipo', async () => {
    const institution = await create('/instituciones', { nombre: 'Institución ficticia ' + prefix, tipo: 'rescate' });
    team = await create('/equipos', { nombre: 'Equipo ' + prefix, institucion_id: institution, municipio_id: 30903, responsable: 'Persona ficticia', integrantes: 4 });
    await api.post(url('/equipos/' + team + '/integrantes')).set(auth(admin)).send({ usuario_id: teammate.id }).expect(201);
    operation = await create('/operaciones', { emergencia_id: incident, nombre: 'Simulacro operativo ' + prefix, descripcion: 'Coordinación de prueba.', responsable_id: admin.id });
    await api.get(url('/operaciones/' + operation)).set(auth(teammate)).expect(404);
    await api.post(url('/operaciones/' + operation + '/equipos')).set(auth(admin)).send({ equipo_id: team }).expect(201);
    await api.get(url('/operaciones/' + operation)).set(auth(teammate)).expect(200);
    await api.post(url('/operaciones/' + operation + '/avances')).set(auth(teammate)).send({ detalle: 'Avance ficticio.' }).expect(201);
    const detail = await api.get(url('/operaciones/' + operation + '/asignaciones')).set(auth(teammate)).expect(200);
    expect(detail.body.equipos[0].estado).toBe('asignado');
  });
  it('PF-14 y PF-15 registran recursos, impiden inventario negativo y asignan con transacción', async () => {
    resource = await create('/recursos', { nombre: 'Agua de prueba ' + prefix, categoria: 'agua', unidad: 'bidón', ubicacion: 'Depósito ficticio', responsable: 'Ejercicio', minimo: 2 });
    const moves = '/recursos/' + resource + '/movimientos';
    await api.post(url(moves)).set(auth(admin)).send({ tipo: 'entrada', cantidad: 8 }).expect(201);
    await api.post(url(moves)).set(auth(admin)).send({ tipo: 'salida', cantidad: 9 }).expect(409);
    await api.post(url('/operaciones/' + operation + '/recursos')).set(auth(admin)).send({ recurso_id: resource, cantidad: 6 }).expect(201);
    const { body } = await api.get(url('/recursos/' + resource)).set(auth(admin)).expect(200);
    expect(body.cantidad).toBe(2);
  });
  it('PF-16 y PF-17 crean refugios y evacuaciones, y exigen revisión de sobreocupación', async () => {
    shelter = await create('/refugios', { nombre: 'Refugio ficticio ' + prefix, municipio_id: 30903, direccion: 'Dirección de prueba', latitud: -17.33, longitud: -66.21,
      capacidad: 10, ocupacion: 0, responsable: 'Pruebista', activo: true });
    await api.patch(url('/refugios/' + shelter)).set(auth(admin)).send({ ocupacion: 11 }).expect(409);
    await api.patch(url('/refugios/' + shelter)).set(auth(admin)).send({ ocupacion: 11, revision_ocupacion: 'Autorización ficticia para el ejercicio.' }).expect(204);
    await create('/evacuaciones', { emergencia_id: incident, origen: 'Origen ficticio', destino: 'Refugio de prueba', refugio_id: shelter,
      personas: 4, equipo_id: team, estado: 'registrada', fecha: new Date().toISOString() });
  });
  it('PF-18 persiste la alerta aprobada, emite por Socket.IO y registra lectura', async () => {
    const server = createServer(app);
    const io = attachSockets(server);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as { port: number }).port;
    const client = connect('http://127.0.0.1:' + port, { auth: { token: observer.token }, timeout: 2500 });
    try {
      await new Promise<void>((resolve, reject) => { client.once('connect', resolve); client.once('connect_error', reject); });
      const delivery = new Promise<void>(resolve => client.once('notificaciones:cambio', resolve));
      await api.patch(url('/emergencias/' + incident + '/verificacion')).set(auth(admin)).send({ alerta_publica: true, recomendaciones: 'Simulacro. Consulta indicaciones oficiales.' }).expect(204);
      await delivery;
      const { body } = await api.get(url('/notificaciones')).set(auth(observer)).expect(200);
      expect(body.data[0].tipo).toBe('alerta_critica');
      await api.patch(url('/notificaciones/' + body.data[0].id + '/leer')).set(auth(citizen)).expect(404);
      await api.patch(url('/notificaciones/' + body.data[0].id + '/leer')).set(auth(observer)).expect(204);
      expect((await api.get(url('/notificaciones')).set(auth(observer)).expect(200)).body.data[0].leida).toBe(1);
    } finally {
      client.disconnect();
      await io.close();
    }
  }, 12000);
  it('PF-20 calcula reportes sobre registros persistidos y verifica el centro operativo', async () => {
    const { body } = await api.get(url('/reportes/emergencias?municipio_id=30903')).set(auth(admin)).expect(200);
    expect(body.data.some((row: { municipio: string }) => row.municipio === 'Tiquipaya')).toBe(true);
    for (const name of ['personas','recursos','operaciones','refugios']) await api.get(url('/reportes/' + name)).set(auth(admin)).expect(200);
    const report = await api.get(url('/centro-operaciones/resumen')).set(auth(admin)).expect(200);
    expect(report.body.indicadores.equipos).toBeTypeOf('number');
  });
  it('PF-22 verifica los registros y las relaciones directamente en MySQL', async () => {
    expect((await rows('SELECT COUNT(*) total FROM emergencias WHERE id=? AND municipio_id=30903', [incident]))[0].total).toBe(1);
    expect((await rows('SELECT cantidad FROM operacion_recursos WHERE operacion_id=? AND recurso_id=?', [operation, resource]))[0].cantidad).toBe(6);
    expect((await rows('SELECT COUNT(*) total FROM information_schema.referential_constraints WHERE constraint_schema=DATABASE()'))[0].total).toBeGreaterThan(20);
  });
  it('PF-24 oculta datos personales y reduce precisión de los reportes públicos', async () => {
    const { body } = await api.get(url('/emergencias/' + incident)).set(auth(observer)).expect(200);
    expect(body.latitud).toBe(-17.33);
    expect(body.descripcion).toBeUndefined();
    expect(body.usuario_id).toBeUndefined();
    await api.get(url('/personas/' + person)).set(auth(observer)).expect(403);
    await api.get(url('/emergencias/' + incident + '/historial')).set(auth(observer)).expect(404);
  });
});
