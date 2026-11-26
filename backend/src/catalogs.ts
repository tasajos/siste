import { Router } from 'express';
import { z } from 'zod';
import { allow, staff } from './auth.js';
import { audit, rows, run, transaction } from './db.js';
import { id, text } from './http.js';

export const catalogs = Router();
const basics = ['tipos_emergencia','prioridades','estados_emergencia','estados_verificacion','categorias_recursos','roles'] as const;
catalogs.get('/catalogos/:catalogo', async (req, res) => {
  const catalog = z.enum(basics).parse(req.params.catalogo);
  res.json(await rows('SELECT * FROM ' + catalog + ' ORDER BY nombre'));
});
catalogs.get('/departamentos', async (_req, res) => res.json(await rows('SELECT * FROM departamentos ORDER BY nombre')));
catalogs.get('/provincias', async (req, res) => {
  const department = id.optional().parse(req.query.departamento_id);
  res.json(await rows('SELECT * FROM provincias' + (department ? ' WHERE departamento_id=?' : '') + ' ORDER BY nombre', department ? [department] : []));
});
catalogs.get('/municipios', async (req, res) => {
  const province = id.optional().parse(req.query.provincia_id);
  res.json(await rows('SELECT m.*,p.nombre provincia,p.departamento_id FROM municipios m JOIN provincias p ON p.id=m.provincia_id' +
    (province ? ' WHERE m.provincia_id=?' : '') + ' ORDER BY m.nombre', province ? [province] : []));
});
catalogs.get('/comunidades', async (req, res) => {
  const municipality = id.optional().parse(req.query.municipio_id);
  res.json(await rows('SELECT * FROM comunidades' + (municipality ? ' WHERE municipio_id=?' : '') + ' ORDER BY nombre', municipality ? [municipality] : []));
});
catalogs.post('/comunidades', allow(...staff), async (req, res) => {
  const value = z.object({ municipio_id: id, nombre: text(100), fuente: z.url({ protocol: /^https?$/ }).max(500),
    latitud: z.number().min(-90).max(90).nullish(), longitud: z.number().min(-180).max(180).nullish(),
  }).strict().refine(loc => (loc.latitud == null) === (loc.longitud == null), 'Completa ambas coordenadas.').parse(req.body);
  const record = await transaction(async db => {
    const result = await run('INSERT INTO comunidades (municipio_id,nombre,fuente,latitud,longitud) VALUES (?,?,?,?,?)', [value.municipio_id, value.nombre, value.fuente, value.latitud ?? null, value.longitud ?? null], db);
    await audit(db, req.usuario.id, 'comunidades', result.insertId, 'crear');
    return result.insertId;
  });
  res.status(201).json({ id: record });
});
