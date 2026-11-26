import { Router } from 'express';
import { z } from 'zod';
import type { PoolConnection } from 'mysql2/promise';
import { allow, isStaff, staff, type Person } from './auth.js';
import { audit, rows, run, transaction, type Row } from './db.js';
import { code, verification } from './emergencies.js';
import { HttpError, date, id, instant, pageQuery, pageResult, requireFound, text } from './http.js';
import { notify, publish, staffRecipients } from './notifications.js';

const personStates = ['reportada','no_localizada','localizada','evacuada','en_refugio','derivada','cerrada'] as const;
const teamStates = ['disponible','asignado','en_operacion','no_disponible'] as const;
const opStates = ['planificada','en_ejecucion','suspendida','finalizada','cancelada'] as const;
const kind = ['bomberos','policia','salud','defensa_civil','rescate','logistica','comunitaria'] as const;
const contactKinds = ['bomberos','policia','hospital','centro_salud','ambulancia','defensa_civil','municipio','apoyo'] as const;
const natural = z.number().int().min(0).max(100000000);
const positive = natural.min(1);
const optional = (max: number) => text(max).nullable().optional();
const url = z.url({ protocol: /^https?$/ }).max(500);
const phone = text(35).regex(/^[+\d\s()\-./]+$/);
type Value = string | number | boolean | null;
const definitions = {
  personas: {
    table: 'personas_reportadas', label: 'nombre', code: 'PE',
    form: z.object({
      emergencia_id: id, nombre: text(120), edad: z.number().int().min(0).max(120).nullable().optional(),
      ubicacion: text(240), fecha: instant, estado: z.enum(personStates).optional(), verificacion: z.enum(verification).optional(),
      responsable_id: id.nullable().optional(), contacto: optional(120), observaciones: optional(1000),
    }).strict(),
  },
  instituciones: {
    table: 'instituciones', label: 'nombre',
    form: z.object({ nombre: text(100), tipo: z.enum(kind) }).strict(),
  },
  equipos: {
    table: 'equipos', label: 'nombre',
    form: z.object({
      nombre: text(100), institucion_id: id, responsable: text(100), telefono: phone.nullable().optional(),
      municipio_id: id, especialidad: optional(100), integrantes: z.number().int().min(1).max(65535), estado: z.enum(teamStates).optional(),
    }).strict(),
  },
  operaciones: {
    table: 'operaciones', label: 'nombre', code: 'OP',
    form: z.object({
      emergencia_id: id, nombre: text(120), descripcion: text(1200), responsable_id: id,
      inicio: instant.nullable().optional(), fin: instant.nullable().optional(), estado: z.enum(opStates).optional(),
      observaciones: optional(1000),
    }).strict(),
  },
  recursos: {
    table: 'recursos', label: 'nombre',
    form: z.object({
      nombre: text(100), categoria: z.enum(['agua','alimentos','medicos','proteccion','vehiculos','herramientas','rescate','abrigo','comunicaciones']),
      minimo: natural, unidad: text(35), ubicacion: text(160), responsable: text(100),
    }).strict(),
  },
  refugios: {
    table: 'refugios', label: 'nombre',
    form: z.object({
      nombre: text(120), municipio_id: id, comunidad_id: id.nullable().optional(), direccion: text(200),
      latitud: z.number().min(-90).max(90), longitud: z.number().min(-180).max(180),
      capacidad: positive, ocupacion: natural, responsable: text(100), telefono: phone.nullable().optional(),
      servicios: optional(500), activo: z.boolean(), revision_ocupacion: optional(500),
    }).strict(),
  },
  evacuaciones: {
    table: 'evacuaciones', label: 'destino',
    form: z.object({
      emergencia_id: id, origen: text(180), destino: text(180), refugio_id: id.nullable().optional(),
      personas: positive, equipo_id: id, fecha: instant,
      estado: z.enum(['registrada','en_curso','completada','cancelada']), observaciones: optional(1000),
    }).strict(),
  },
  contactos: {
    table: 'contactos_emergencia', label: 'nombre',
    form: z.object({
      nombre: text(120), categoria: z.enum(contactKinds), telefono: phone, direccion: optional(180),
      cobertura: text(180), web: url.nullable().optional(), fuente: url,
      fecha_verificacion: date.nullable().optional(), verificado: z.boolean(),
      latitud: z.number().min(-90).max(90).nullish(), longitud: z.number().min(-180).max(180).nullish(),
    }).strict(),
  },
} as const;
type Module = keyof typeof definitions;
function visibility(module: Module, person: Person) {
  if (isStaff(person)) return { filter: 'TRUE', params: [] as number[], columns: 'a.*' };
  if (module === 'contactos') return { filter: 'a.verificado=TRUE', params: [], columns: 'a.*' };
  if (module === 'refugios') return { filter: 'a.activo=TRUE', params: [], columns: 'a.id,a.nombre,a.municipio_id,a.comunidad_id,a.direccion,a.latitud,a.longitud,a.capacidad,a.ocupacion,a.servicios,a.activo' };
  if (person.rol === 'equipo' && module === 'equipos') {
    return { filter: 'EXISTS (SELECT 1 FROM miembros_equipo m WHERE m.equipo_id=a.id AND m.usuario_id=?)', params: [person.id], columns: 'a.*' };
  }
  if (person.rol === 'equipo' && module === 'operaciones') {
    return {
      filter: 'EXISTS (SELECT 1 FROM operacion_equipos o JOIN miembros_equipo m ON m.equipo_id=o.equipo_id WHERE o.operacion_id=a.id AND m.usuario_id=?)',
      params: [person.id], columns: 'a.*',
    };
  }
  throw new HttpError(403, 'Tu cuenta no tiene permiso para este módulo.');
}
async function checkReference(db: PoolConnection, table: string, target: number) {
  requireFound((await rows('SELECT id FROM ' + table + ' WHERE id=?', [target], db))[0]);
}
function enforce(module: Module, values: Record<string, Value>, previous?: Row) {
  const next = { ...previous, ...values };
  if (module === 'refugios' && Number(next.ocupacion) > Number(next.capacidad) &&
      (!next.revision_ocupacion || (previous && (values.ocupacion !== undefined || values.capacidad !== undefined) &&
        (Number(previous.ocupacion) !== Number(next.ocupacion) || Number(previous.capacidad) !== Number(next.capacidad)) && !values.revision_ocupacion))) {
    throw new HttpError(409, 'La ocupación supera la capacidad. Registra la revisión autorizada para continuar.');
  }
  if (module === 'contactos' && (next.latitud == null) !== (next.longitud == null)) {
    throw new HttpError(422, 'Completa ambas coordenadas.');
  }
  if (module === 'contactos' && next.verificado && !next.fecha_verificacion) {
    throw new HttpError(422, 'Registra la fecha de verificación.');
  }
  if (module === 'operaciones' && next.fin && (!next.inicio || String(next.inicio) > String(next.fin))) {
    throw new HttpError(422, 'El fin de la operación debe ser posterior a su inicio.');
  }
  if (module === 'personas' && previous &&
      ((values.estado !== undefined && values.estado !== previous.estado) || (values.verificacion !== undefined && values.verificacion !== previous.verificacion))) {
    throw new HttpError(409, 'Registra el cambio de estado o verificación mediante el seguimiento de la persona.');
  }
}
type Capacity = Pick<Row, string> & { ocupacion: number; capacidad: number };
async function capacityNotices(db: PoolConnection, next: Capacity, name: string, before?: Capacity) {
  if (next.ocupacion < next.capacidad || (before && before.ocupacion >= before.capacidad)) return [];
  return notify(db, await staffRecipients(db), {
    tipo: 'capacidad_refugio', titulo: 'Capacidad de refugio alcanzada',
    mensaje: name + ' alcanzó o superó su capacidad registrada.',
  });
}
export const operations = Router();
for (const module of Object.keys(definitions) as Module[]) {
  const { table, label, form } = definitions[module];
  operations.get('/' + module, async (req, res) => {
    const { page, limit, q } = pageQuery.parse(req.query);
    const permission = visibility(module, req.usuario);
    const where = ' FROM ' + table + ' a WHERE ' + permission.filter + ' AND a.' + label + ' LIKE ?';
    const params = [...permission.params, '%' + (q ?? '') + '%'];
    const [{ total }] = await rows<Row & { total: number }>('SELECT COUNT(*) total' + where, params);
    res.json(pageResult(await rows('SELECT ' + permission.columns + where + ' ORDER BY a.id DESC LIMIT ? OFFSET ?',
      [...params, String(limit), String((page - 1) * limit)]), page, limit, total));
  });
  operations.get('/' + module + '/:id', async (req, res) => {
    const permission = visibility(module, req.usuario);
    res.json(requireFound((await rows('SELECT ' + permission.columns + ' FROM ' + table + ' a WHERE a.id=? AND ' + permission.filter,
      [id.parse(req.params.id), ...permission.params]))[0]));
  });
  operations.post('/' + module, allow(...staff), async (req, res) => {
    const definition = definitions[module];
    const values: Record<string, Value> = form.parse(req.body);
    if ('code' in definition) values.codigo = code(definition.code);
    enforce(module, values);
    const fields = Object.keys(values);
    const result = await transaction(async db => {
      const created = await run('INSERT INTO ' + table + ' (' + fields.join(',') + ') VALUES (' + fields.map(() => '?').join(',') + ')',
        Object.values(values), db);
      const target = created.insertId;
      if (module === 'personas') await run(
        'INSERT INTO seguimiento_personas (persona_id,usuario_id,estado,verificacion,observaciones) VALUES (?,?,?,?,?)',
        [target, req.usuario.id, values.estado ?? 'reportada', values.verificacion ?? 'pendiente', 'Registro inicial'], db);
      const recipients = module === 'refugios'
        ? await capacityNotices(db, values as Capacity, String(values.nombre)) : [];
      await audit(db, req.usuario.id, table, target, 'crear');
      return { id: target, recipients };
    });
    publish(result.recipients);
    res.status(201).json({ id: result.id });
  });
  operations.patch('/' + module + '/:id', allow(...staff), async (req, res) => {
    const target = id.parse(req.params.id);
    const values: Record<string, Value> = form.partial().parse(req.body);
    if (!Object.keys(values).length) throw new HttpError(422, 'Indica al menos un cambio.');
    const recipients = await transaction(async db => {
      const previous = requireFound((await rows('SELECT * FROM ' + table + ' WHERE id=? FOR UPDATE', [target], db))[0]);
      enforce(module, values, previous);
      if (module === 'equipos' && values.estado === 'disponible' && (await rows(
        "SELECT oe.operacion_id FROM operacion_equipos oe JOIN operaciones o ON o.id=oe.operacion_id WHERE oe.equipo_id=? AND o.estado IN ('planificada','en_ejecucion','suspendida') LIMIT 1", [target], db)).length) {
        throw new HttpError(409, 'El equipo participa en una operación abierta.');
      }
      if (module === 'operaciones' && ['finalizada','cancelada'].includes(String(previous.estado)) && values.estado && values.estado !== previous.estado) {
        throw new HttpError(409, 'La operación ya se cerró.');
      }
      await run('UPDATE ' + table + ' SET ' + Object.keys(values).map(field => field + '=?').join(',') + ' WHERE id=?',
        [...Object.values(values), target], db);
      if (module === 'operaciones' && values.estado && values.estado !== previous.estado) {
        await run('INSERT INTO avances_operaciones (operacion_id,usuario_id,detalle) VALUES (?,?,?)',
          [target, req.usuario.id, 'Estado: ' + String(values.estado)], db);
        if (['finalizada','cancelada','en_ejecucion'].includes(String(values.estado))) {
          await run("UPDATE equipos e JOIN operacion_equipos oe ON oe.equipo_id=e.id SET e.estado=? WHERE oe.operacion_id=? AND e.estado IN ('asignado','en_operacion')",
            [values.estado === 'en_ejecucion' ? 'en_operacion' : 'disponible', target], db);
        }
      }
      await audit(db, req.usuario.id, table, target, 'actualizar');
      if (module !== 'refugios') return [];
      return capacityNotices(db, { ...previous, ...values } as Capacity, String(values.nombre ?? previous.nombre), previous as Capacity);
    });
    publish(recipients);
    res.status(204).end();
  });
}
operations.get('/personas/:id/seguimiento', allow(...staff), async (req, res) => {
  res.json(await rows('SELECT s.*,u.nombre responsable FROM seguimiento_personas s JOIN usuarios u ON u.id=s.usuario_id WHERE s.persona_id=? ORDER BY s.id DESC LIMIT 100',
    [id.parse(req.params.id)]));
});
operations.post('/personas/:id/seguimiento', allow(...staff), async (req, res) => {
  const person = id.parse(req.params.id);
  const value = z.object({ estado: z.enum(personStates), verificacion: z.enum(verification), observaciones: text(1000) }).strict().parse(req.body);
  await transaction(async db => {
    requireFound((await rows('SELECT id FROM personas_reportadas WHERE id=? FOR UPDATE', [person], db))[0]);
    await run('UPDATE personas_reportadas SET estado=?,verificacion=?,responsable_id=?,observaciones=? WHERE id=?',
      [value.estado, value.verificacion, req.usuario.id, value.observaciones, person], db);
    await run('INSERT INTO seguimiento_personas (persona_id,usuario_id,estado,verificacion,observaciones) VALUES (?,?,?,?,?)',
      [person, req.usuario.id, value.estado, value.verificacion, value.observaciones], db);
    await audit(db, req.usuario.id, 'personas_reportadas', person, 'seguimiento');
  });
  res.status(201).end();
});
operations.post('/equipos/:id/integrantes', allow(...staff), async (req, res) => {
  const team = id.parse(req.params.id);
  const { usuario_id } = z.object({ usuario_id: id }).strict().parse(req.body);
  await transaction(async db => {
    const user = requireFound((await rows("SELECT id FROM usuarios WHERE id=? AND rol='equipo' AND activo=TRUE", [usuario_id], db))[0]);
    await run('INSERT INTO miembros_equipo (usuario_id,equipo_id) VALUES (?,?)', [Number(user.id), team], db);
    await audit(db, req.usuario.id, 'equipos', team, 'agregar_integrante');
  });
  res.status(201).end();
});
operations.patch('/equipos/:id/disponibilidad', allow('equipo'), async (req, res) => {
  const team = id.parse(req.params.id);
  const { estado } = z.object({ estado: z.enum(['disponible','no_disponible']) }).strict().parse(req.body);
  await transaction(async db => {
    const current = requireFound((await rows('SELECT e.estado FROM equipos e JOIN miembros_equipo m ON m.equipo_id=e.id WHERE e.id=? AND m.usuario_id=? FOR UPDATE', [team, req.usuario.id], db))[0]);
    if (!['disponible','no_disponible'].includes(String(current.estado))) throw new HttpError(409, 'El equipo tiene una asignación activa.');
    await run('UPDATE equipos SET estado=? WHERE id=?', [estado, team], db);
    await audit(db, req.usuario.id, 'equipos', team, 'disponibilidad');
  });
  res.status(204).end();
});
async function activeOperation(db: PoolConnection, operation: number) {
  const current = requireFound((await rows('SELECT id,nombre,estado FROM operaciones WHERE id=? FOR UPDATE', [operation], db))[0]);
  if (['finalizada','cancelada'].includes(String(current.estado))) throw new HttpError(409, 'La operación ya se cerró.');
  return current;
}
operations.post('/operaciones/:id/equipos', allow(...staff), async (req, res) => {
  const operation = id.parse(req.params.id);
  const { equipo_id } = z.object({ equipo_id: id }).strict().parse(req.body);
  const recipients = await transaction(async db => {
    const current = await activeOperation(db, operation);
    const team = requireFound((await rows('SELECT estado FROM equipos WHERE id=? FOR UPDATE', [equipo_id], db))[0]);
    if (team.estado !== 'disponible') throw new HttpError(409, 'El equipo no está disponible.');
    await run('INSERT INTO operacion_equipos (operacion_id,equipo_id) VALUES (?,?)', [operation, equipo_id], db);
    await run('UPDATE equipos SET estado=? WHERE id=?', [current.estado === 'en_ejecucion' ? 'en_operacion' : 'asignado', equipo_id], db);
    await audit(db, req.usuario.id, 'operaciones', operation, 'asignar_equipo');
    const members = await rows<Row & { usuario_id: number }>("SELECT m.usuario_id FROM miembros_equipo m JOIN usuarios u ON u.id=m.usuario_id WHERE m.equipo_id=? AND u.rol='equipo' AND u.activo=TRUE", [equipo_id], db);
    return notify(db, members.map(member => member.usuario_id), {
      tipo: 'asignacion', titulo: 'Nueva asignación de equipo', mensaje: String(current.nombre),
    });
  });
  publish(recipients);
  res.status(201).end();
});
async function stockChange(db: PoolConnection, resource: number, actor: number, type: 'entrada' | 'salida' | 'asignacion', quantity: number, detail: string | null, operation: number | null) {
  const row = requireFound((await rows<Row & { cantidad: number; minimo: number; nombre: string }>('SELECT nombre,cantidad,minimo FROM recursos WHERE id=? FOR UPDATE', [resource], db))[0]);
  const next = row.cantidad + (type === 'entrada' ? quantity : -quantity);
  if (next < 0) throw new HttpError(409, 'La cantidad supera la existencia disponible.');
  await run('UPDATE recursos SET cantidad=? WHERE id=?', [next, resource], db);
  await run('INSERT INTO movimientos_recursos (recurso_id,usuario_id,tipo,cantidad,detalle,operacion_id) VALUES (?,?,?,?,?,?)',
    [resource, actor, type, quantity, detail, operation], db);
  await audit(db, actor, 'recursos', resource, type);
  if (next > row.minimo || next >= row.cantidad) return [];
  return notify(db, await staffRecipients(db), { tipo: 'existencias', titulo: 'Existencias bajas', mensaje: row.nombre + ' · Existencia: ' + next });
}
operations.get('/recursos/:id/movimientos', allow(...staff), async (req, res) => {
  res.json(await rows('SELECT * FROM movimientos_recursos WHERE recurso_id=? ORDER BY id DESC LIMIT 100', [id.parse(req.params.id)]));
});
operations.post('/recursos/:id/movimientos', allow(...staff), async (req, res) => {
  const resource = id.parse(req.params.id);
  const { tipo, cantidad, detalle } = z.object({ tipo: z.enum(['entrada','salida']), cantidad: positive, detalle: optional(300) }).strict().parse(req.body);
  publish(await transaction(db => stockChange(db, resource, req.usuario.id, tipo, cantidad, detalle ?? null, null)));
  res.status(201).end();
});
operations.post('/operaciones/:id/recursos', allow(...staff), async (req, res) => {
  const operation = id.parse(req.params.id);
  const { recurso_id, cantidad } = z.object({ recurso_id: id, cantidad: positive }).strict().parse(req.body);
  const recipients = await transaction(async db => {
    await activeOperation(db, operation);
    const recipients = await stockChange(db, recurso_id, req.usuario.id, 'asignacion', cantidad, null, operation);
    await run('INSERT INTO operacion_recursos (operacion_id,recurso_id,cantidad) VALUES (?,?,?) ON DUPLICATE KEY UPDATE cantidad=cantidad+?',
      [operation, recurso_id, cantidad, cantidad], db);
    return recipients;
  });
  publish(recipients);
  res.status(201).end();
});
operations.get('/operaciones/:id/asignaciones', async (req, res) => {
  const operation = id.parse(req.params.id);
  const access = visibility('operaciones', req.usuario);
  requireFound((await rows('SELECT a.id FROM operaciones a WHERE a.id=? AND ' + access.filter, [operation, ...access.params]))[0]);
  const [equipos, recursos, avances] = await Promise.all([
    rows('SELECT e.id,e.nombre,e.estado FROM operacion_equipos oe JOIN equipos e ON e.id=oe.equipo_id WHERE oe.operacion_id=?', [operation]),
    rows('SELECT r.id,r.nombre,r.unidad,rr.cantidad FROM operacion_recursos rr JOIN recursos r ON r.id=rr.recurso_id WHERE rr.operacion_id=?', [operation]),
    rows('SELECT id,detalle,creado_en FROM avances_operaciones WHERE operacion_id=? ORDER BY id DESC LIMIT 100', [operation]),
  ]);
  res.json({ equipos, recursos, avances });
});
operations.post('/operaciones/:id/avances', async (req, res) => {
  const operation = id.parse(req.params.id);
  const { detalle } = z.object({ detalle: text(1500) }).strict().parse(req.body);
  const access = visibility('operaciones', req.usuario);
  await transaction(async db => {
    requireFound((await rows('SELECT a.id FROM operaciones a WHERE a.id=? AND ' + access.filter, [operation, ...access.params], db))[0]);
    await activeOperation(db, operation);
    await run('INSERT INTO avances_operaciones (operacion_id,usuario_id,detalle) VALUES (?,?,?)', [operation, req.usuario.id, detalle], db);
    await audit(db, req.usuario.id, 'operaciones', operation, 'registrar_avance');
  });
  res.status(201).end();
});
operations.get('/responsables', allow(...staff), async (_req, res) => {
  res.json(await rows("SELECT id,nombre FROM usuarios WHERE activo=TRUE AND rol IN ('administrador','operador') ORDER BY nombre"));
});
operations.get('/usuarios-equipo', allow(...staff), async (_req, res) => {
  res.json(await rows("SELECT id,nombre FROM usuarios WHERE activo=TRUE AND rol='equipo' ORDER BY nombre"));
});
