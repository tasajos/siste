# Base de datos

MySQL 8, InnoDB y utf8mb4. Ejecuta schema.sql, seed.sql e indexes.sql en orden con una cuenta administrativa local. El script ops/ubuntu-app.sh crea una cuenta de aplicación limitada a SELECT, INSERT, UPDATE y DELETE sobre su esquema. Conserva el puerto de MySQL en 127.0.0.1. El catálogo de provincias y municipios usa los identificadores del [INE](https://anda.ine.gob.bo/index.php/catalog/82/variable/V80?name=s2_39deptocod).

## Respaldo

Genera el respaldo con permisos privados. Conserva los archivos de respaldo cifrados o en una ubicación protegida. Los respaldos pueden contener información personal.

```bash
umask 077
sudo mysqldump --single-transaction --no-tablespaces --set-gtid-purged=OFF --databases mi_comunidad_segura > database/backups/comunidad.sql
```

Antes de restaurar, valida el archivo en una instancia independiente. Para restaurar sobre la instancia de destino prevista, detén el servicio de aplicación durante la operación. El respaldo incluye sentencias de reemplazo de tablas.

```bash
sudo mysql < database/backups/comunidad.sql
```

El [modelo ER](modelo-er.dbml) describe las relaciones y [queries.sql](queries.sql) contiene las consultas agregadas de referencia.
