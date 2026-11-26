import { createHash, randomBytes, randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Router, type Request, type RequestHandler, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { audit, env, rows, run, transaction, type Row } from './db.js';
import { HttpError, id, pageQuery, pageResult, requireFound, text } from './http.js';

const roles = ['administrador', 'operador', 'equipo', 'ciudadano'] as const;
export type Role = (typeof roles)[number];
export type Person = { id: number; nombre: string; correo: string; rol: Role };
type AuthRow = Row & Person & { password_hash: string; activo: number };
const life = 7 * 24 * 60 * 60 * 1000;
const cookieName = 'comunidad_refresh';
const cookieOptions = { httpOnly: true, secure: env.SECURE_COOKIES === 'true', sameSite: 'strict' as const, path: '/api/v1/auth' };
const sha = (token: string) => createHash('sha256').update(token).digest('hex');
const userFields = 'id,nombre,correo,rol';
const invalid = () => new HttpError(401, 'La sesión no es válida o ha caducado.');
const email = z.email().max(254).transform(value => value.toLowerCase());
export const password = z.string().min(10).refine(value => Buffer.byteLength(value) <= 72, 'Máximo 72 bytes.');
const login = z.object({ correo: email, clave: z.string().min(1).max(72) });
const register = login.extend({ nombre: text(100, 2), clave: password }).strict();
const authLimit = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false,
  message: { error: 'Demasiados intentos. Vuelve a intentarlo más tarde.' },
});
const refreshParts = z.string().regex(/^[a-f\d-]{36}\.[a-f\d]{64}$/);
function cookie(req: Request) {
  return req.headers.cookie?.split(';').map(value => value.trim()).find(value => value.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
}
function issue(res: Response, user: Person, sid: string, secret: string, maxAge = life) {
  res.cookie(cookieName, sid + '.' + secret, { ...cookieOptions, maxAge });
  const token = jwt.sign({ sid }, env.JWT_SECRET, { algorithm: 'HS256', subject: String(user.id), audience: 'comunidad', expiresIn: '15m' });
  res.json({ token, usuario: user });
}
export async function session(token: string): Promise<{ usuario: Person; sid: string; expiresAt: number }> {
  let payload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'], audience: 'comunidad' });
  } catch {
    throw invalid();
  }
  if (typeof payload === 'string' || !payload.sub || typeof payload.sid !== 'string' || !payload.exp) throw invalid();
  const [usuario] = await rows<Row & Person>(
    'SELECT u.id,u.nombre,u.correo,u.rol FROM sesiones s JOIN usuarios u ON u.id=s.usuario_id WHERE s.id=? AND u.id=? AND u.activo=TRUE AND s.vence_en>UTC_TIMESTAMP()',
    [payload.sid, Number(payload.sub)],
  );
  if (!usuario) throw invalid();
  return { usuario, sid: payload.sid, expiresAt: payload.exp * 1000 };
}
declare global {
  namespace Express {
    interface Request { usuario: Person; sid: string }
  }
}
export const authenticate: RequestHandler = async (req, _res, next) => {
  const token = req.headers.authorization?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) throw invalid();
  const result = await session(token);
  req.usuario = result.usuario;
  req.sid = result.sid;
  next();
};
export const allow = (...permitted: Role[]): RequestHandler => (req, _res, next) => {
  if (!permitted.includes(req.usuario.rol)) throw new HttpError(403, 'Tu cuenta no tiene permiso para esta acción.');
  next();
};
export const staff = ['administrador', 'operador'] as const;
export const isStaff = (user: Person) => user.rol === 'administrador' || user.rol === 'operador';

export const auth = Router();
auth.post('/register', authLimit, async (req, res) => {
  const values = register.parse(req.body);
  await run('INSERT INTO usuarios (nombre,correo,password_hash) VALUES (?,?,?)', [values.nombre, values.correo, await bcrypt.hash(values.clave, 12)]);
  res.status(201).json({ mensaje: 'Cuenta creada. Ya puedes iniciar sesión.' });
});
const dummy = '$2b$12$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';
auth.post('/login', authLimit, async (req, res) => {
  const { correo, clave } = login.parse(req.body);
  const [registro] = await rows<AuthRow>('SELECT ' + userFields + ',activo,password_hash FROM usuarios WHERE correo=?', [correo]);
  const correct = await bcrypt.compare(clave, registro?.password_hash ?? dummy);
  if (!correct || !registro?.activo) throw new HttpError(401, 'El correo o la contraseña no son válidos.');
  const { id, nombre, rol } = registro;
  const sid = randomUUID();
  const secret = randomBytes(32).toString('hex');
  await run('INSERT INTO sesiones (id,usuario_id,refresh_hash,vence_en) VALUES (?,?,?,UTC_TIMESTAMP()+INTERVAL 7 DAY)', [sid, id, sha(secret)]);
  issue(res, { id, nombre, correo, rol }, sid, secret);
});
auth.post('/refresh', async (req, res) => {
  const parsed = refreshParts.safeParse(cookie(req));
  if (!parsed.success) throw invalid();
  const [sid, secret] = parsed.data.split('.');
  const nextSecret = randomBytes(32).toString('hex');
  const result = await transaction(async db => {
    const [current] = await rows<Row & Person & { restantes: number }>(
      'SELECT u.id,u.nombre,u.correo,u.rol,TIMESTAMPDIFF(SECOND,UTC_TIMESTAMP(),s.vence_en) restantes FROM sesiones s JOIN usuarios u ON u.id=s.usuario_id WHERE s.id=? AND s.refresh_hash=? AND s.vence_en>UTC_TIMESTAMP() AND u.activo=TRUE FOR UPDATE',
      [sid, sha(secret)], db,
    );
    if (!current) throw invalid();
    await run('UPDATE sesiones SET refresh_hash=? WHERE id=?', [sha(nextSecret), sid], db);
    const { id, nombre, correo, rol, restantes } = current;
    return { usuario: { id, nombre, correo, rol }, restantes };
  });
  issue(res, result.usuario, sid, nextSecret, result.restantes * 1000);
});
auth.post('/logout', async (req, res) => {
  const parsed = refreshParts.safeParse(cookie(req));
  if (parsed.success) {
    const [sid, secret] = parsed.data.split('.');
    await run('DELETE FROM sesiones WHERE id=? AND refresh_hash=?', [sid, sha(secret)]);
  }
  res.clearCookie(cookieName, cookieOptions).status(204).end();
});
auth.get('/me', authenticate, (req, res) => res.json(req.usuario));
auth.patch('/me', authenticate, async (req, res) => {
  const { nombre } = z.object({ nombre: text(100, 2) }).strict().parse(req.body);
  await run('UPDATE usuarios SET nombre=? WHERE id=?', [nombre, req.usuario.id]);
  res.json({ ...req.usuario, nombre });
});

export const users = Router();
users.use(allow('administrador'));
users.get('/', async (req, res) => {
  const { page, limit, q } = pageQuery.parse(req.query);
  const pattern = '%' + (q ?? '') + '%';
  const [{ total }] = await rows<Row & { total: number }>('SELECT COUNT(*) total FROM usuarios WHERE nombre LIKE ? OR correo LIKE ?', [pattern, pattern]);
  const data = await rows('SELECT ' + userFields + ',activo FROM usuarios WHERE nombre LIKE ? OR correo LIKE ? ORDER BY id DESC LIMIT ? OFFSET ?', [pattern, pattern, String(limit), String((page - 1) * limit)]);
  res.json(pageResult(data, page, limit, total));
});
users.get('/:id', async (req, res) => {
  res.json(requireFound((await rows('SELECT ' + userFields + ',activo FROM usuarios WHERE id=?', [id.parse(req.params.id)]))[0]));
});
const updateUser = (stateOnly: boolean): RequestHandler => async (req, res) => {
  const target = id.parse(req.params.id);
  const changes = stateOnly
    ? z.object({ activo: z.boolean() }).strict().parse(req.body)
    : z.object({ nombre: text(100, 2).optional(), rol: z.enum(roles).optional(), activo: z.boolean().optional() }).strict().parse(req.body);
  await transaction(async db => {
    const user = requireFound((await rows<Row & Person & { activo: number }>('SELECT ' + userFields + ',activo FROM usuarios WHERE id=? FOR UPDATE', [target], db))[0]);
    const role = 'rol' in changes ? changes.rol ?? user.rol : user.rol;
    const active = changes.activo ?? Boolean(user.activo);
    if (target === req.usuario.id && (!active || role !== 'administrador')) throw new HttpError(409, 'Tu cuenta debe conservar el acceso de administrador.');
    await run('UPDATE usuarios SET nombre=?,rol=?,activo=? WHERE id=?', ['nombre' in changes ? changes.nombre ?? user.nombre : user.nombre, role, active, target], db);
    if (!active || role !== user.rol) await run('DELETE FROM sesiones WHERE usuario_id=?', [target], db);
    await audit(db, req.usuario.id, 'usuarios', target, 'actualizar');
  });
  res.status(204).end();
};
users.patch('/:id', updateUser(false));
users.patch('/:id/estado', updateUser(true));

export const auditLog = Router();
auditLog.get('/', allow('administrador'), async (req, res) => {
  const { page, limit } = pageQuery.parse(req.query);
  const [{ total }] = await rows<Row & { total: number }>('SELECT COUNT(*) total FROM auditorias');
  res.json(pageResult(await rows('SELECT a.*,u.nombre FROM auditorias a JOIN usuarios u ON u.id=a.usuario_id ORDER BY a.id DESC LIMIT ? OFFSET ?', [String(limit), String((page - 1) * limit)]), page, limit, total));
});
