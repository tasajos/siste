import { randomBytes } from 'node:crypto';
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { allow, isStaff, staff, type Person } from './auth.js';
import { audit, rows, run, transaction, type Row } from './db.js';
import { HttpError, date, id, instant, pageQuery, pageResult, requireFound, text } from './http.js';
import { notify, publish, staffRecipients } from './notifications.js';

export const priorities = ['baja', 'media', 'alta', 'critica'] as const;
export const states = ['reportada', 'en_evaluacion', 'en_atencion', 'controlada', 'cerrada', 'cancelada'] as const;
export const verification = ['pendiente', 'en_revision', 'verificada', 'descartada'] as const;
export const incidentTypes = ['incendio_forestal', 'incendio_urbano', 'inundacion', 'deslizamiento', 'transito', 'medica', 'granizada', 'sequia', 'derrumbe', 'persona_desaparecida', 'otro'] as const;
export const code = (prefix: string) => prefix + '-' + randomBytes(6).toString('hex').toUpperCase();
const lat = z.number().min(-90).max(90);
const lng = z.number().min(-180).max(180);
const evidence = z.object({ mime: z.enum(['image/jpeg', 'image/png', 'image/webp']), contenido: z.base64().max(2796204) }).strict();
const incidentDetails = z.object({
  titulo: text(120, 4), tipo: z.enum(incidentTypes), descripcion: text(2500, 10),
  municipio_id: id, comunidad_id: id.nullable().optional(), direccion: text(240).nullable().optional(),
  latitud: lat.nullable().optional(), longitud: lng.nullable().optional(), fecha: instant, prioridad: z.enum(priorities),
}).strict();
const createIncident = incidentDetails.extend({ evidencia: evidence.optional() }).refine(
  value => (value.latitud == null) === (value.longitud == null), 'Completa ambas coordenadas.',
);
export const incidentFilters = z.object({
  ...pageQuery.shape, tipo: z.enum(incidentTypes).optional(), estado: z.enum(states).optional(),
  verificacion: z.enum(verification).optional(), prioridad: z.enum(priorities).optional(), municipio_id: id.optional(),
  provincia_id: id.optional(), desde: date.optional(), hasta: date.optional(),
}).refine(f => !f.desde || !f.hasta || f.desde <= f.hasta, 'El rango de fechas no es válido.');
type Filters = z.infer<typeof incidentFilters>;
type Incident = Row & {
  id: number; codigo: string; titulo: string; usuario_id: number; municipio_id: number; comunidad_id: number | null;
  latitud: number | null; longitud: number | null; prioridad: string; estado: string; verificacion: string;
  recomendaciones: string | null; alerta_publica: number; responsable_id: number | null;
  tipo_nombre: string; municipio: string; provincia: string; fecha: string; tipo: string;
};
export const incidentJoins = ' FROM emergencias e JOIN municipios m ON m.id=e.municipio_id JOIN provincias p ON p.id=m.provincia_id JOIN tipos_emergencia t ON t.clave=e.tipo';
const select = 'SELECT e.*,m.nombre municipio,p.nombre provincia,p.id provincia_id,t.nombre tipo_nombre,c.nombre comunidad';
const joins = incidentJoins + ' LEFT JOIN comunidades c ON c.id=e.comunidad_id';
function assigned(user: Person) {
  return user.rol === 'equipo'
    ? ' OR EXISTS (SELECT 1 FROM operaciones o JOIN operacion_equipos oe ON oe.operacion_id=o.id JOIN miembros_equipo me ON me.equipo_id=oe.equipo_id WHERE o.emergencia_id=e.id AND me.usuario_id=?)'
    : '';
}
export function incidentScope(user: Person) {
  if (isStaff(user)) return { where: 'TRUE', params: [] as number[] };
  const team = assigned(user);
  return {
    where: "(e.usuario_id=? OR (e.alerta_publica=TRUE AND e.verificacion='verificada')" + team + ')',
    params: team ? [user.id, user.id] : [user.id],
  };
}
export function whereIncidents(user: Person, f: Filters) {
  const scope = incidentScope(user);
  const clauses = [scope.where];
  const values: (string | number)[] = [...scope.params];
  for (const field of ['tipo', 'estado', 'verificacion', 'prioridad', 'municipio_id'] as const) {
    const value = f[field];
    if (value !== undefined) { clauses.push('e.' + field + '=?'); values.push(value); }
  }
  if (f.provincia_id) { clauses.push('p.id=?'); values.push(f.provincia_id); }
  if (f.desde) { clauses.push('e.fecha >= ?'); values.push(f.desde); }
  if (f.hasta) { clauses.push('e.fecha < DATE_ADD(?, INTERVAL 1 DAY)'); values.push(f.hasta); }
  if (f.q) {
    const pattern = '%' + f.q + '%';
    clauses.push(isStaff(user) ? '(e.codigo LIKE ? OR t.nombre LIKE ? OR m.nombre LIKE ? OR e.titulo LIKE ?)' :
      '(e.codigo LIKE ? OR t.nombre LIKE ? OR m.nombre LIKE ? OR (e.usuario_id=? AND e.titulo LIKE ?))');
    values.push(pattern, pattern, pattern);
    if (!isStaff(user)) values.push(user.id);
    values.push(pattern);
  }
  return { where: ' WHERE ' + clauses.join(' AND '), values };
}
function view(row: Incident, user: Person, teamAccess = false) {
  if (isStaff(user) || row.usuario_id === user.id || teamAccess) return row;
  return {
    id: row.id, codigo: row.codigo, titulo: row.tipo_nombre, tipo: row.tipo, tipo_nombre: row.tipo_nombre,
    municipio: row.municipio, provincia: row.provincia, municipio_id: row.municipio_id,
    latitud: row.latitud === null ? null : Number(row.latitud.toFixed(2)),
    longitud: row.longitud === null ? null : Number(row.longitud.toFixed(2)),
    fecha: row.fecha, prioridad: row.prioridad, estado: row.estado, verificacion: row.verificacion,
    recomendaciones: row.recomendaciones, alerta_publica: true,
  };
}
function decodeEvidence(file: z.infer<typeof evidence>) {
  const buffer = Buffer.from(file.contenido, 'base64');
  const signature = buffer.subarray(0, 12).toString('hex');
  const correct = file.mime === 'image/jpeg' ? signature.startsWith('ffd8ff') :
    file.mime === 'image/png' ? signature.startsWith('89504e470d0a1a0a') :
      signature.startsWith('52494646') && signature.slice(16) === '57454250';
  if (buffer.length > 2 * 1024 * 1024 || !correct) throw new HttpError(422, 'La fotografía debe ser JPEG, PNG o WebP y pesar hasta 2 MB.');
  return buffer;
}
export const emergencies = Router();
emergencies.get('/', async (req, res) => {
  const f = incidentFilters.parse(req.query);
  const { where, values } = whereIncidents(req.usuario, f);
  const [{ total }] = await rows<Row & { total: number }>('SELECT COUNT(*) total' + incidentJoins + where, values);
  const data = await rows<Incident>(select + joins + where + ' ORDER BY e.fecha DESC,e.id DESC LIMIT ? OFFSET ?',
    [...values, String(f.limit), String((f.page - 1) * f.limit)]);
  res.json(pageResult(data.map(row => view(row, req.usuario)), f.page, f.limit, total));
});
emergencies.get('/:id', async (req, res) => {
  const scope = incidentScope(req.usuario);
  const [row] = await rows<Incident>(select + joins + ' WHERE e.id=? AND ' + scope.where, [id.parse(req.params.id), ...scope.params]);
  const incident = requireFound(row);
  const team = assigned(req.usuario);
  const teamAccess = team && (await rows('SELECT e.id FROM emergencias e WHERE e.id=? AND (FALSE' + team + ')', [incident.id, req.usuario.id])).length > 0;
  const result = view(incident, req.usuario, Boolean(teamAccess));
  const evidenceVisible = isStaff(req.usuario) || incident.usuario_id === req.usuario.id;
  const photos = evidenceVisible ? await rows('SELECT id,mime FROM evidencias_emergencia WHERE emergencia_id=?', [incident.id]) : [];
  res.json({ ...result, evidencias: photos });
});
emergencies.get('/:id/evidencia', async (req, res) => {
  const clause = isStaff(req.usuario) ? '' : ' AND e.usuario_id=?';
  const values = [id.parse(req.params.id)];
  if (clause) values.push(req.usuario.id);
  const photo = requireFound((await rows<Row & { datos: Buffer; mime: string }>(
    'SELECT ev.datos,ev.mime FROM evidencias_emergencia ev JOIN emergencias e ON e.id=ev.emergencia_id WHERE e.id=?' + clause, values,
  ))[0]);
  res.type(photo.mime).send(photo.datos);
});
emergencies.get('/:id/historial', async (req, res) => {
  const target = id.parse(req.params.id);
  const clause = isStaff(req.usuario) ? '' : ' AND usuario_id=?';
  requireFound((await rows('SELECT id FROM emergencias WHERE id=?' + clause, clause ? [target, req.usuario.id] : [target]))[0]);
  res.json(await rows('SELECT id,detalle,creado_en FROM historial_emergencias WHERE emergencia_id=? ORDER BY id DESC LIMIT 100', [target]));
});
emergencies.post('/', async (req, res) => {
  const values = createIncident.parse(req.body);
  const data = values.evidencia ? decodeEvidence(values.evidencia) : null;
  const codigo = code('EM');
  const result = await transaction(async db => {
    const result = await run(
      'INSERT INTO emergencias (codigo,titulo,tipo,descripcion,municipio_id,comunidad_id,direccion,latitud,longitud,fecha,usuario_id,prioridad) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
      [codigo, values.titulo, values.tipo, values.descripcion, values.municipio_id, values.comunidad_id ?? null, values.direccion ?? null,
        values.latitud ?? null, values.longitud ?? null, values.fecha, req.usuario.id, values.prioridad], db);
    if (values.evidencia && data) await run('INSERT INTO evidencias_emergencia (emergencia_id,mime,datos) VALUES (?,?,?)', [result.insertId, values.evidencia.mime, data], db);
    await run('INSERT INTO historial_emergencias (emergencia_id,usuario_id,detalle) VALUES (?,?,?)',
      [result.insertId, req.usuario.id, JSON.stringify({ estado: 'reportada', verificacion: 'pendiente', prioridad: values.prioridad })], db);
    await audit(db, req.usuario.id, 'emergencias', result.insertId, 'crear');
    const recipients = values.prioridad === 'critica' ? await notify(db, await staffRecipients(db), {
      tipo: 'incidente_critico', titulo: 'Reporte crítico pendiente', mensaje: codigo + ' requiere revisión.', emergencia_id: result.insertId,
    }) : [];
    return { id: result.insertId, recipients };
  });
  publish(result.recipients);
  res.status(201).json({ id: result.id, codigo });
});
const staffFields = {
  estado: z.enum(states), verificacion: z.enum(verification), responsable_id: id.nullable(),
  observaciones: text(1000).nullable(), alerta_publica: z.boolean(), recomendaciones: text(500).nullable(),
};
const patchIncident = incidentDetails.extend(staffFields).partial().strict();
const changeIncident = (section?: 'estado' | 'verificacion'): RequestHandler => async (req, res) => {
  const target = id.parse(req.params.id);
  const patch: z.infer<typeof patchIncident> = section === 'estado' ? patchIncident.pick({ estado: true, observaciones: true }).parse(req.body)
    : section === 'verificacion' ? patchIncident.pick({ verificacion: true, observaciones: true, alerta_publica: true, recomendaciones: true }).parse(req.body)
      : patchIncident.parse(req.body);
  if (!Object.keys(patch).length) throw new HttpError(422, 'Indica al menos un cambio.');
  const recipients = await transaction(async db => {
    const before = requireFound((await rows<Incident>('SELECT * FROM emergencias WHERE id=? FOR UPDATE', [target], db))[0]);
    const next = { ...before, ...patch };
    if ((next.latitud === null) !== (next.longitud === null)) throw new HttpError(422, 'Completa ambas coordenadas.');
    if (next.alerta_publica && next.verificacion !== 'verificada') {
      if (patch.alerta_publica) throw new HttpError(409, 'Verifica el incidente antes de publicar la alerta.');
      patch.alerta_publica = false;
    } else if (next.alerta_publica && !next.recomendaciones) {
      throw new HttpError(422, 'Incluye instrucciones aprobadas para publicar la alerta.');
    }
    const entries = Object.entries(patch) as [string, string | number | boolean | null][];
    await run('UPDATE emergencias SET ' + entries.map(([key]) => key + '=?').join(',') + ' WHERE id=?', [...entries.map(([, v]) => v), target], db);
    await run('INSERT INTO historial_emergencias (emergencia_id,usuario_id,detalle) VALUES (?,?,?)',
      [target, req.usuario.id, JSON.stringify(Object.fromEntries(entries.filter(([key]) => ['estado','verificacion','prioridad','alerta_publica','observaciones','responsable_id'].includes(key))))], db);
    await audit(db, req.usuario.id, 'emergencias', target, section ?? 'actualizar');
    if (patch.alerta_publica && (!before.alerta_publica || (next.prioridad === 'critica' && before.prioridad !== 'critica'))) {
      const everyone = (await rows<Row & { id: number }>('SELECT id FROM usuarios WHERE activo=TRUE', [], db)).map(user => user.id);
      return notify(db, everyone, {
        tipo: next.prioridad === 'critica' ? 'alerta_critica' : 'alerta_publica',
        titulo: 'Alerta verificada · ' + before.codigo, mensaje: next.recomendaciones!, emergencia_id: target,
      });
    }
    if (next.estado !== before.estado || next.verificacion !== before.verificacion) {
      return notify(db, [before.usuario_id], {
        tipo: 'estado', titulo: 'Actualización de tu reporte', mensaje: before.codigo + ' tiene un cambio de estado o verificación.', emergencia_id: target,
      });
    }
    return [];
  });
  publish(recipients);
  res.status(204).end();
};
emergencies.patch('/:id', allow(...staff), changeIncident());
emergencies.patch('/:id/estado', allow(...staff), changeIncident('estado'));
emergencies.patch('/:id/verificacion', allow(...staff), changeIncident('verificacion'));
