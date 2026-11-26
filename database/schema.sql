CREATE DATABASE IF NOT EXISTS mi_comunidad_segura CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE mi_comunidad_segura;

CREATE TABLE IF NOT EXISTS roles (
  clave VARCHAR(24) PRIMARY KEY, nombre VARCHAR(60) NOT NULL
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS usuarios (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, nombre VARCHAR(100) NOT NULL,
  correo VARCHAR(254) NOT NULL UNIQUE, password_hash VARCHAR(60) NOT NULL,
  rol VARCHAR(24) NOT NULL DEFAULT 'ciudadano',
  activo BOOLEAN NOT NULL DEFAULT TRUE, creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (rol) REFERENCES roles(clave)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS sesiones (
  id CHAR(36) PRIMARY KEY, usuario_id INT UNSIGNED NOT NULL,
  refresh_hash CHAR(64) NOT NULL, vence_en DATETIME NOT NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS auditorias (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, usuario_id INT UNSIGNED NOT NULL,
  entidad VARCHAR(50) NOT NULL, registro_id INT UNSIGNED NOT NULL, accion VARCHAR(32) NOT NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS departamentos (
  id INT UNSIGNED PRIMARY KEY, nombre VARCHAR(80) NOT NULL UNIQUE
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS provincias (
  id INT UNSIGNED PRIMARY KEY, departamento_id INT UNSIGNED NOT NULL,
  nombre VARCHAR(80) NOT NULL, UNIQUE (departamento_id, nombre),
  FOREIGN KEY (departamento_id) REFERENCES departamentos(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS municipios (
  id INT UNSIGNED PRIMARY KEY, provincia_id INT UNSIGNED NOT NULL,
  nombre VARCHAR(80) NOT NULL, UNIQUE (provincia_id, nombre),
  FOREIGN KEY (provincia_id) REFERENCES provincias(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS comunidades (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, municipio_id INT UNSIGNED NOT NULL,
  nombre VARCHAR(100) NOT NULL, fuente VARCHAR(500) NOT NULL,
  latitud DECIMAL(9,6), longitud DECIMAL(9,6), UNIQUE (municipio_id, nombre),
  CHECK ((latitud IS NULL AND longitud IS NULL) OR (latitud BETWEEN -90 AND 90 AND longitud BETWEEN -180 AND 180 AND latitud IS NOT NULL AND longitud IS NOT NULL)),
  UNIQUE (id, municipio_id),
  FOREIGN KEY (municipio_id) REFERENCES municipios(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS tipos_emergencia (
  clave VARCHAR(40) PRIMARY KEY, nombre VARCHAR(75) NOT NULL
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS prioridades (
  clave VARCHAR(24) PRIMARY KEY, nombre VARCHAR(50) NOT NULL
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS estados_emergencia (
  clave VARCHAR(24) PRIMARY KEY, nombre VARCHAR(50) NOT NULL
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS estados_verificacion (
  clave VARCHAR(24) PRIMARY KEY, nombre VARCHAR(50) NOT NULL
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS emergencias (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, codigo CHAR(15) NOT NULL UNIQUE,
  titulo VARCHAR(120) NOT NULL, tipo VARCHAR(40) NOT NULL,
  descripcion TEXT NOT NULL, municipio_id INT UNSIGNED NOT NULL,
  comunidad_id INT UNSIGNED, direccion VARCHAR(240),
  latitud DECIMAL(9,6), longitud DECIMAL(9,6), fecha DATETIME NOT NULL,
  usuario_id INT UNSIGNED NOT NULL,
  prioridad VARCHAR(24) NOT NULL,
  estado VARCHAR(24) NOT NULL DEFAULT 'reportada',
  verificacion VARCHAR(24) NOT NULL DEFAULT 'pendiente',
  responsable_id INT UNSIGNED, observaciones VARCHAR(1000),
  alerta_publica BOOLEAN NOT NULL DEFAULT FALSE,
  recomendaciones VARCHAR(500),
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (comunidad_id, municipio_id) REFERENCES comunidades(id, municipio_id),
  CHECK ((latitud IS NULL AND longitud IS NULL) OR (latitud BETWEEN -90 AND 90 AND longitud BETWEEN -180 AND 180 AND latitud IS NOT NULL AND longitud IS NOT NULL)),
  FOREIGN KEY (tipo) REFERENCES tipos_emergencia(clave),
  FOREIGN KEY (municipio_id) REFERENCES municipios(id),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
  FOREIGN KEY (prioridad) REFERENCES prioridades(clave),
  FOREIGN KEY (estado) REFERENCES estados_emergencia(clave),
  FOREIGN KEY (verificacion) REFERENCES estados_verificacion(clave),
  FOREIGN KEY (responsable_id) REFERENCES usuarios(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS evidencias_emergencia (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, emergencia_id INT UNSIGNED NOT NULL UNIQUE,
  mime VARCHAR(20) NOT NULL, datos MEDIUMBLOB NOT NULL, creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (emergencia_id) REFERENCES emergencias(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS historial_emergencias (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, emergencia_id INT UNSIGNED NOT NULL,
  usuario_id INT UNSIGNED NOT NULL, detalle JSON NOT NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (emergencia_id) REFERENCES emergencias(id),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS personas_reportadas (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, codigo CHAR(15) NOT NULL UNIQUE,
  emergencia_id INT UNSIGNED NOT NULL, nombre VARCHAR(120) NOT NULL,
  edad TINYINT UNSIGNED, ubicacion VARCHAR(240) NOT NULL, fecha DATETIME NOT NULL,
  estado ENUM('reportada','no_localizada','localizada','evacuada','en_refugio','derivada','cerrada') NOT NULL DEFAULT 'reportada',
  verificacion VARCHAR(24) NOT NULL DEFAULT 'pendiente',
  responsable_id INT UNSIGNED, observaciones VARCHAR(1000), contacto VARCHAR(120),
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CHECK (edad IS NULL OR edad <= 120),
  FOREIGN KEY (emergencia_id) REFERENCES emergencias(id),
  FOREIGN KEY (verificacion) REFERENCES estados_verificacion(clave),
  FOREIGN KEY (responsable_id) REFERENCES usuarios(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS seguimiento_personas (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, persona_id INT UNSIGNED NOT NULL,
  usuario_id INT UNSIGNED NOT NULL, estado VARCHAR(30) NOT NULL,
  verificacion VARCHAR(24) NOT NULL,
  observaciones VARCHAR(1000) NOT NULL, creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (persona_id) REFERENCES personas_reportadas(id),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
  FOREIGN KEY (verificacion) REFERENCES estados_verificacion(clave)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS instituciones (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, nombre VARCHAR(100) NOT NULL UNIQUE,
  tipo ENUM('bomberos','policia','salud','defensa_civil','rescate','logistica','comunitaria') NOT NULL
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS equipos (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, nombre VARCHAR(100) NOT NULL,
  institucion_id INT UNSIGNED NOT NULL,
  responsable VARCHAR(100) NOT NULL, telefono VARCHAR(35), municipio_id INT UNSIGNED NOT NULL,
  especialidad VARCHAR(100), integrantes SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  estado ENUM('disponible','asignado','en_operacion','no_disponible') NOT NULL DEFAULT 'disponible',
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (institucion_id) REFERENCES instituciones(id),
  FOREIGN KEY (municipio_id) REFERENCES municipios(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS miembros_equipo (
  usuario_id INT UNSIGNED NOT NULL, equipo_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (usuario_id, equipo_id),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
  FOREIGN KEY (equipo_id) REFERENCES equipos(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS operaciones (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, codigo CHAR(15) NOT NULL UNIQUE,
  emergencia_id INT UNSIGNED NOT NULL, nombre VARCHAR(120) NOT NULL,
  descripcion VARCHAR(1200) NOT NULL, responsable_id INT UNSIGNED NOT NULL,
  inicio DATETIME, fin DATETIME,
  estado ENUM('planificada','en_ejecucion','suspendida','finalizada','cancelada') NOT NULL DEFAULT 'planificada',
  observaciones VARCHAR(1000), creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CHECK (fin IS NULL OR (inicio IS NOT NULL AND fin >= inicio)),
  FOREIGN KEY (emergencia_id) REFERENCES emergencias(id),
  FOREIGN KEY (responsable_id) REFERENCES usuarios(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS operacion_equipos (
  operacion_id INT UNSIGNED NOT NULL, equipo_id INT UNSIGNED NOT NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (operacion_id, equipo_id),
  FOREIGN KEY (operacion_id) REFERENCES operaciones(id),
  FOREIGN KEY (equipo_id) REFERENCES equipos(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS avances_operaciones (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, operacion_id INT UNSIGNED NOT NULL,
  usuario_id INT UNSIGNED NOT NULL, detalle VARCHAR(1500) NOT NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (operacion_id) REFERENCES operaciones(id),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS categorias_recursos (
  clave VARCHAR(36) PRIMARY KEY, nombre VARCHAR(80) NOT NULL
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS recursos (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, nombre VARCHAR(100) NOT NULL,
  categoria VARCHAR(36) NOT NULL, cantidad INT UNSIGNED NOT NULL DEFAULT 0,
  minimo INT UNSIGNED NOT NULL DEFAULT 0, unidad VARCHAR(35) NOT NULL,
  ubicacion VARCHAR(160) NOT NULL, responsable VARCHAR(100) NOT NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (categoria) REFERENCES categorias_recursos(clave)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS movimientos_recursos (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, recurso_id INT UNSIGNED NOT NULL,
  usuario_id INT UNSIGNED NOT NULL, operacion_id INT UNSIGNED,
  tipo ENUM('entrada','salida','asignacion') NOT NULL, cantidad INT UNSIGNED NOT NULL CHECK (cantidad > 0),
  detalle VARCHAR(300), creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (recurso_id) REFERENCES recursos(id),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
  FOREIGN KEY (operacion_id) REFERENCES operaciones(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS operacion_recursos (
  operacion_id INT UNSIGNED NOT NULL, recurso_id INT UNSIGNED NOT NULL,
  cantidad INT UNSIGNED NOT NULL CHECK (cantidad > 0), PRIMARY KEY (operacion_id, recurso_id),
  FOREIGN KEY (operacion_id) REFERENCES operaciones(id),
  FOREIGN KEY (recurso_id) REFERENCES recursos(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS refugios (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, nombre VARCHAR(120) NOT NULL,
  municipio_id INT UNSIGNED NOT NULL, comunidad_id INT UNSIGNED,
  direccion VARCHAR(200) NOT NULL, latitud DECIMAL(9,6) NOT NULL CHECK (latitud BETWEEN -90 AND 90),
  longitud DECIMAL(9,6) NOT NULL CHECK (longitud BETWEEN -180 AND 180),
  capacidad INT UNSIGNED NOT NULL CHECK (capacidad > 0), ocupacion INT UNSIGNED NOT NULL DEFAULT 0,
  responsable VARCHAR(100) NOT NULL, telefono VARCHAR(35), servicios VARCHAR(500),
  activo BOOLEAN NOT NULL DEFAULT TRUE, revision_ocupacion VARCHAR(500),
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (comunidad_id, municipio_id) REFERENCES comunidades(id, municipio_id),
  CHECK (ocupacion <= capacidad OR revision_ocupacion IS NOT NULL),
  FOREIGN KEY (municipio_id) REFERENCES municipios(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS evacuaciones (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, emergencia_id INT UNSIGNED NOT NULL,
  origen VARCHAR(180) NOT NULL, destino VARCHAR(180) NOT NULL, refugio_id INT UNSIGNED,
  personas INT UNSIGNED NOT NULL CHECK (personas > 0), equipo_id INT UNSIGNED NOT NULL,
  fecha DATETIME NOT NULL, estado ENUM('registrada','en_curso','completada','cancelada') NOT NULL,
  observaciones VARCHAR(1000), creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (emergencia_id) REFERENCES emergencias(id),
  FOREIGN KEY (refugio_id) REFERENCES refugios(id),
  FOREIGN KEY (equipo_id) REFERENCES equipos(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS contactos_emergencia (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, nombre VARCHAR(120) NOT NULL,
  categoria ENUM('bomberos','policia','hospital','centro_salud','ambulancia','defensa_civil','municipio','apoyo') NOT NULL,
  telefono VARCHAR(35) NOT NULL, direccion VARCHAR(180), cobertura VARCHAR(180) NOT NULL,
  web VARCHAR(500), fuente VARCHAR(500) NOT NULL, fecha_verificacion DATE,
  latitud DECIMAL(9,6), longitud DECIMAL(9,6),
  CHECK ((latitud IS NULL AND longitud IS NULL) OR (latitud BETWEEN -90 AND 90 AND longitud BETWEEN -180 AND 180 AND latitud IS NOT NULL AND longitud IS NOT NULL)),
  verificado BOOLEAN NOT NULL DEFAULT FALSE,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CHECK (verificado = FALSE OR fecha_verificacion IS NOT NULL)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS notificaciones (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, usuario_id INT UNSIGNED NOT NULL,
  tipo VARCHAR(30) NOT NULL, titulo VARCHAR(180) NOT NULL, mensaje VARCHAR(400) NOT NULL,
  emergencia_id INT UNSIGNED, leida BOOLEAN NOT NULL DEFAULT FALSE,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (usuario_id, leida, id),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
  FOREIGN KEY (emergencia_id) REFERENCES emergencias(id)
) ENGINE=InnoDB;
