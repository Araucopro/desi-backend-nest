-- Se ejecuta una sola vez, cuando el contenedor inicializa su volumen
-- (docker-entrypoint-initdb.d). Si el volumen ya existe, este script no corre;
-- en ese caso el arnés de tests crea la base por su cuenta
-- (src/test/ensure-database.ts).
--
-- La base de la aplicación (`d3si_test`) la crea POSTGRES_DB. Aquí se agrega la
-- extensión que usan las migraciones: ninguna la declara, es un prerrequisito
-- del entorno y los `uuid_generate_v4()` de las tablas fallan sin ella.
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
