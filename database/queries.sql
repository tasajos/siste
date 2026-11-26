USE mi_comunidad_segura;
-- Consultas administrativas. Aplicar autorización antes de exponer resultados.
SELECT p.nombre AS provincia, m.nombre AS municipio, e.tipo, e.prioridad, e.estado, COUNT(*) AS cantidad
FROM emergencias e JOIN municipios m ON m.id=e.municipio_id JOIN provincias p ON p.id=m.provincia_id
GROUP BY p.id,m.id,e.tipo,e.prioridad,e.estado;
SELECT estado, COUNT(*) AS cantidad FROM personas_reportadas GROUP BY estado;
SELECT categoria, unidad, SUM(cantidad) AS existencias FROM recursos GROUP BY categoria,unidad;
SELECT nombre, capacidad, ocupacion, GREATEST(0, CAST(capacidad AS SIGNED)-CAST(ocupacion AS SIGNED)) AS disponibles FROM refugios;
