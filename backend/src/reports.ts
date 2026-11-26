import { Router } from 'express';
import { z } from 'zod';
import { allow, isStaff, staff } from './auth.js';
import { rows } from './db.js';
import { incidentFilters, incidentJoins, whereIncidents } from './emergencies.js';
import { date, id, pageQuery, pageResult } from './http.js';

export const reports = Router();
reports.get(['/reportes/resumen','/centro-operaciones/resumen'], async (req, res) => {
  const { where, values } = whereIncidents(req.usuario, incidentFilters.parse(req.query));
  const [count, chart, latest, active, facilities, resources] = await Promise.all([
    rows(`SELECT COUNT(*) total,
      COALESCE(SUM(e.estado NOT IN ('cerrada','cancelada','controlada')),0)+0 activas,
      COALESCE(SUM(e.prioridad='critica' AND e.estado NOT IN ('cerrada','cancelada','controlada')),0)+0 criticas,
      COALESCE(SUM(e.verificacion IN ('pendiente','en_revision')),0)+0 pendientes,
      COALESCE(SUM(e.estado IN ('controlada','cerrada')),0)+0 atendidas` + incidentJoins + where, values),
    rows('SELECT t.nombre AS nombre, COUNT(*) total' + incidentJoins + where + ' GROUP BY t.clave ORDER BY total DESC,nombre', values),
    rows("SELECT e.id,e.codigo,t.nombre tipo,m.nombre municipio,e.fecha,e.prioridad,e.verificacion,e.recomendaciones" + incidentJoins + where +
      " AND e.alerta_publica=TRUE AND e.verificacion='verificada' ORDER BY e.actualizado_en DESC LIMIT 5", values),
    isStaff(req.usuario) ? rows("SELECT e.id,e.codigo,e.titulo,m.nombre municipio,e.estado,e.prioridad,u.nombre responsable" +
      incidentJoins + " LEFT JOIN usuarios u ON u.id=e.responsable_id" + where + " AND e.estado IN ('reportada','en_evaluacion','en_atencion') ORDER BY FIELD(e.prioridad,'critica','alta','media','baja'),e.fecha DESC LIMIT 8", values) : [],
    isStaff(req.usuario) ? rows(`SELECT
      (SELECT COUNT(*) FROM personas_reportadas) personas,
      (SELECT COUNT(*) FROM equipos WHERE estado='disponible') equipos,
      (SELECT COUNT(*) FROM operaciones WHERE estado='en_ejecucion') operaciones,
      (SELECT COUNT(*) FROM refugios WHERE activo=TRUE) refugios,
      (SELECT COUNT(*) FROM recursos) recursos,
      (SELECT COUNT(*) FROM contactos_emergencia WHERE verificado=TRUE) contactos`) : [],
    isStaff(req.usuario) ? rows('SELECT nombre,cantidad,unidad FROM recursos WHERE cantidad<=minimo ORDER BY cantidad LIMIT 5') : [],
  ]);
  res.json({ indicadores: { ...count[0], ...facilities[0] }, porTipo: chart, alertas: latest, activas: active, recursosBajos: resources });
});
reports.get('/reportes/emergencias', allow(...staff), async (req, res) => {
  const f = incidentFilters.parse(req.query);
  const { where, values } = whereIncidents(req.usuario, f);
  const group = 'SELECT p.nombre provincia,m.nombre municipio,t.nombre tipo,e.prioridad,e.estado,COUNT(*) total' + incidentJoins + where +
    ' GROUP BY p.id,m.id,t.clave,e.prioridad,e.estado';
  const [{ total }] = await rows<RowCount>('SELECT COUNT(*) total FROM (' + group + ') grupos', values);
  res.json(pageResult(await rows(group + ' ORDER BY provincia,municipio,tipo,e.prioridad,e.estado LIMIT ? OFFSET ?',
    [...values, String(f.limit), String((f.page - 1) * f.limit)]), f.page, f.limit, total));
});
type RowCount = import('./db.js').Row & { total: number };
reports.get('/reportes/personas', allow(...staff), async (req, res) => {
  const f = z.object({ municipio_id: id.optional(), desde: date.optional(), hasta: date.optional() })
    .refine(value => !value.desde || !value.hasta || value.desde <= value.hasta, 'El rango de fechas no es válido.').parse(req.query);
  res.json(await rows(`SELECT pe.estado,pe.verificacion,COUNT(*) total FROM personas_reportadas pe
    JOIN emergencias e ON e.id=pe.emergencia_id
    WHERE (? IS NULL OR e.municipio_id=?) AND (? IS NULL OR pe.fecha>=?) AND (? IS NULL OR pe.fecha<DATE_ADD(?,INTERVAL 1 DAY))
    GROUP BY pe.estado,pe.verificacion ORDER BY pe.estado,pe.verificacion`,
    [f.municipio_id ?? null, f.municipio_id ?? null, f.desde ?? null, f.desde ?? null, f.hasta ?? null, f.hasta ?? null]));
});
reports.get('/reportes/recursos', allow(...staff), async (_req, res) => {
  res.json(await rows('SELECT c.nombre categoria,r.unidad,COUNT(*) registros,SUM(r.cantidad)+0 total FROM recursos r JOIN categorias_recursos c ON c.clave=r.categoria GROUP BY c.clave,r.unidad ORDER BY categoria,r.unidad'));
});
reports.get('/reportes/operaciones', allow(...staff), async (req, res) => {
  const municipio = id.optional().parse(req.query.municipio_id);
  res.json(await rows('SELECT o.estado,COUNT(*) total FROM operaciones o JOIN emergencias e ON e.id=o.emergencia_id WHERE (? IS NULL OR e.municipio_id=?) GROUP BY o.estado ORDER BY o.estado', [municipio ?? null, municipio ?? null]));
});
reports.get('/reportes/refugios', allow(...staff), async (req, res) => {
  const { page, limit } = pageQuery.parse(req.query);
  const municipio = id.optional().parse(req.query.municipio_id);
  const where = ' WHERE (? IS NULL OR r.municipio_id=?)';
  const [{ total }] = await rows<RowCount>('SELECT COUNT(*) total FROM refugios r' + where, [municipio ?? null, municipio ?? null]);
  res.json(pageResult(await rows('SELECT r.nombre,m.nombre municipio,r.capacidad,r.ocupacion,GREATEST(0,CAST(r.capacidad AS SIGNED)-CAST(r.ocupacion AS SIGNED)) disponibles,r.activo FROM refugios r JOIN municipios m ON m.id=r.municipio_id' + where + ' ORDER BY m.nombre,r.nombre LIMIT ? OFFSET ?',
    [municipio ?? null, municipio ?? null, String(limit), String((page - 1) * limit)]), page, limit, total));
});
