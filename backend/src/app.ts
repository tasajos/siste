import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express, { type ErrorRequestHandler } from 'express';
import helmet from 'helmet';
import { ZodError } from 'zod';
import { authenticate, auditLog, auth, users } from './auth.js';
import { catalogs } from './catalogs.js';
import { origins, rows } from './db.js';
import { emergencies } from './emergencies.js';
import { HttpError, noCache } from './http.js';
import { notifications } from './notifications.js';
import { operations } from './operations.js';
import { reports } from './reports.js';

export const app = express();
app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      'img-src': ["'self'", 'blob:', 'data:', 'https://tile.openstreetmap.org'],
      'connect-src': ["'self'", 'https://tile.openstreetmap.org'],
      'style-src': ["'self'", "'unsafe-inline'"], 'upgrade-insecure-requests': null,
    },
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  strictTransportSecurity: false,
}));
app.use('/api', cors({ origin: origins, credentials: true }), noCache);
app.use('/api', (req, _res, next) => {
  const origin = req.headers.origin;
  if (origin && !['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !origins.includes(origin) && origin !== req.protocol + '://' + req.get('host')) {
    throw new HttpError(403, 'El origen de la solicitud no está autorizado.');
  }
  next();
});
app.use('/api', express.json({ limit: '3mb' }));
const router = express.Router();
router.get('/health', async (_req, res) => {
  try { await rows('SELECT 1'); } catch { throw new HttpError(503, 'MySQL no está disponible.'); }
  res.json({ estado: 'ok', database: 'mysql' });
});
router.get('/openapi.json', (_req, res) => res.sendFile(fileURLToPath(new URL('../openapi.json', import.meta.url))));
router.use('/auth', auth);
router.use(authenticate);
router.use('/emergencias', emergencies);
router.use('/usuarios', users);
router.use('/auditorias', auditLog);
router.use('/notificaciones', notifications);
router.use(catalogs, operations, reports);
app.use('/api/v1', router);
app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Ruta no encontrada.')));

const web = fileURLToPath(new URL('../../frontend/dist/', import.meta.url));
if (existsSync(web)) {
  app.use(express.static(web, { index: false }));
  app.get(/^(?!.*\.[a-z0-9]{2,8}$).*/i, (_req, res) => res.sendFile(web + 'index.html'));
}
app.use((_req, _res, next) => next(new HttpError(404, 'Ruta no encontrada.')));
const errors: ErrorRequestHandler = (error, _req, res, next) => {
  if (res.headersSent) { next(error); return; }
  if (error instanceof ZodError) {
    res.status(422).json({ error: 'Revisa los campos indicados.', campos: error.issues.map(issue => ({ campo: issue.path.join('.'), mensaje: issue.message })) });
    return;
  }
  if (error instanceof HttpError) { res.status(error.status).json({ error: error.message }); return; }
  if (error?.code === 'ER_DUP_ENTRY') { res.status(409).json({ error: 'El registro ya existe.' }); return; }
  if (error?.code === 'ER_NO_REFERENCED_ROW_2' || error?.code === 'ER_CHECK_CONSTRAINT_VIOLATED') {
    res.status(422).json({ error: 'Revisa las relaciones entre registros y los valores seleccionados.' }); return;
  }
  if (error?.type === 'entity.too.large') { res.status(413).json({ error: 'El contenido supera el tamaño permitido.' }); return; }
  if (error?.type === 'entity.parse.failed') { res.status(400).json({ error: 'El cuerpo JSON no es válido.' }); return; }
  console.error('Error de API:', error?.code ?? error?.name ?? 'desconocido');
  res.status(500).json({ error: 'Ocurrió un error al procesar la solicitud.' });
};
app.use(errors);
