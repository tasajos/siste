import type { Server as HttpServer } from 'node:http';
import type { PoolConnection } from 'mysql2/promise';
import { Router } from 'express';
import { Server } from 'socket.io';
import { origins, rows, run, type Row } from './db.js';
import { session } from './auth.js';
import { HttpError, id, pageQuery, pageResult } from './http.js';

type Notice = { tipo: string; titulo: string; mensaje: string; emergencia_id?: number };
let socketServer: Server | undefined;
export function attachSockets(server: HttpServer) {
  const io = new Server(server, {
    cors: { origin: origins, credentials: true },
    allowRequest: (req, done) => done(null, !req.headers.origin || origins.includes(req.headers.origin)),
  });
  socketServer = io;
  io.use(async (socket, next) => {
    try {
      const auth = await session(String(socket.handshake.auth.token ?? ''));
      socket.data.auth = auth;
      next();
    } catch {
      next(new Error('Sesión no válida'));
    }
  });
  io.on('connection', socket => {
    const { usuario, expiresAt } = socket.data.auth;
    socket.join('usuario:' + usuario.id);
    const timer = setTimeout(() => socket.disconnect(true), Math.max(0, expiresAt - Date.now()));
    socket.on('disconnect', () => clearTimeout(timer));
  });
  return io;
}
export function disconnectUser(user: number) { socketServer?.in('usuario:' + user).disconnectSockets(true); }
export async function notify(db: PoolConnection, recipients: number[], notice: Notice) {
  const people = [...new Set(recipients)];
  for (const person of people) {
    await run('INSERT INTO notificaciones (usuario_id,tipo,titulo,mensaje,emergencia_id) VALUES (?,?,?,?,?)',
      [person, notice.tipo, notice.titulo, notice.mensaje, notice.emergencia_id ?? null], db);
  }
  return people;
}
export function publish(recipients: number[]) {
  for (const person of recipients) socketServer?.to('usuario:' + person).emit('notificaciones:cambio');
}
export async function staffRecipients(db: PoolConnection) {
  return (await rows<Row & { id: number }>("SELECT id FROM usuarios WHERE activo=TRUE AND rol IN ('administrador','operador')", [], db)).map(row => row.id);
}
export const notifications = Router();
notifications.get('/', async (req, res) => {
  const { page, limit } = pageQuery.parse(req.query);
  const [{ total }] = await rows<Row & { total: number }>('SELECT COUNT(*) total FROM notificaciones WHERE usuario_id=?', [req.usuario.id]);
  const data = await rows('SELECT * FROM notificaciones WHERE usuario_id=? ORDER BY id DESC LIMIT ? OFFSET ?', [req.usuario.id, String(limit), String((page - 1) * limit)]);
  res.json(pageResult(data, page, limit, total));
});
notifications.patch('/:id/leer', async (req, res) => {
  const result = await run('UPDATE notificaciones SET leida=TRUE WHERE id=? AND usuario_id=?', [id.parse(req.params.id), req.usuario.id]);
  if (!result.affectedRows) throw new HttpError(404, 'No encontramos la notificación.');
  res.status(204).end();
});
