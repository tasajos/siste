USE mi_comunidad_segura;
CREATE TABLE IF NOT EXISTS migraciones (
  id VARCHAR(80) PRIMARY KEY, aplicada_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;
DROP PROCEDURE IF EXISTS aplicar_indices;
DELIMITER //
CREATE PROCEDURE aplicar_indices()
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='emergencias' AND index_name='ix_emergencias_filtros') THEN
    CREATE INDEX ix_emergencias_filtros ON emergencias (municipio_id, tipo, estado, fecha);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='emergencias' AND index_name='ix_emergencias_publicadas') THEN
    CREATE INDEX ix_emergencias_publicadas ON emergencias (alerta_publica, verificacion, fecha);
  END IF;
  INSERT IGNORE INTO migraciones (id) VALUES ('001_indices');
END//
DELIMITER ;
CALL aplicar_indices();
DROP PROCEDURE aplicar_indices;
