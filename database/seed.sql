USE mi_comunidad_segura;
INSERT IGNORE INTO roles VALUES
 ('administrador','Administrador'),('operador','Operador'),('equipo','Equipo autorizado'),('ciudadano','Ciudadano');
INSERT IGNORE INTO prioridades VALUES ('baja','Baja'),('media','Media'),('alta','Alta'),('critica','Crítica');
INSERT IGNORE INTO estados_emergencia VALUES
 ('reportada','Reportada'),('en_evaluacion','En evaluación'),('en_atencion','En atención'),
 ('controlada','Controlada'),('cerrada','Cerrada'),('cancelada','Cancelada');
INSERT IGNORE INTO estados_verificacion VALUES
 ('pendiente','Pendiente'),('en_revision','En revisión'),('verificada','Verificada'),('descartada','Descartada');
INSERT IGNORE INTO tipos_emergencia VALUES
 ('incendio_forestal','Incendio forestal'),('incendio_urbano','Incendio urbano'),('inundacion','Inundación'),
 ('deslizamiento','Deslizamiento'),('transito','Accidente de tránsito'),('medica','Emergencia médica'),
 ('granizada','Granizada'),('sequia','Sequía'),('derrumbe','Derrumbe'),
 ('persona_desaparecida','Persona desaparecida'),('otro','Otro');
INSERT IGNORE INTO categorias_recursos VALUES
 ('agua','Agua'),('alimentos','Alimentos'),('medicos','Medicamentos e insumos médicos'),
 ('proteccion','Protección'),('vehiculos','Vehículos'),('herramientas','Herramientas'),
 ('rescate','Rescate'),('abrigo','Abrigo'),('comunicaciones','Comunicaciones');

INSERT IGNORE INTO departamentos VALUES (3,'Cochabamba');
-- Catálogo territorial de INE Bolivia. No contiene datos personales.
INSERT IGNORE INTO provincias VALUES
 (301,3,'Cercado'), (302,3,'Campero'), (303,3,'Ayopaya'), (304,3,'Esteban Arce'),
 (305,3,'Arani'), (306,3,'Arque'), (307,3,'Capinota'), (308,3,'Germán Jordán'),
 (309,3,'Quillacollo'), (310,3,'Chapare'), (311,3,'Tapacarí'), (312,3,'Carrasco'),
 (313,3,'Mizque'), (314,3,'Punata'), (315,3,'Bolívar'), (316,3,'Tiraque');
INSERT IGNORE INTO municipios VALUES
 (30101,301,'Cochabamba'), (30201,302,'Aiquile'), (30202,302,'Pasorapa'), (30203,302,'Omereque'),
 (30301,303,'Independencia'), (30302,303,'Morochata'), (30303,303,'Cocapata'),
 (30401,304,'Tarata'), (30402,304,'Anzaldo'), (30403,304,'Arbieto'), (30404,304,'Sacabamba'),
 (30501,305,'Arani'), (30502,305,'Vacas'), (30601,306,'Arque'), (30602,306,'Tacopaya'),
 (30701,307,'Capinota'), (30702,307,'Santiváñez'), (30703,307,'Sicaya'),
 (30801,308,'Cliza'), (30802,308,'Toco'), (30803,308,'Tolata'),
 (30901,309,'Quillacollo'), (30902,309,'Sipe Sipe'), (30903,309,'Tiquipaya'), (30904,309,'Vinto'), (30905,309,'Colcapirhua'),
 (31001,310,'Sacaba'), (31002,310,'Colomi'), (31003,310,'Villa Tunari'), (31101,311,'Tapacarí'),
 (31201,312,'Totora'), (31202,312,'Pojo'), (31203,312,'Pocona'), (31204,312,'Chimoré'),
 (31205,312,'Puerto Villarroel'), (31206,312,'Entre Ríos'),
 (31301,313,'Mizque'), (31302,313,'Vila Vila'), (31303,313,'Alalay'),
 (31401,314,'Punata'), (31402,314,'Villa Rivero'), (31403,314,'San Benito'),
 (31404,314,'Tacachi'), (31405,314,'Cuchumuela'), (31501,315,'Bolívar'),
 (31601,316,'Tiraque'), (31602,316,'Shinahota');
