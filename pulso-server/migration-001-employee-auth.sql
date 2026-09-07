-- Corré esto en el SQL Editor de Supabase UNA SOLA VEZ si ya habías creado las tablas antes
-- de esta entrega (con schema.sql). Si estás armando la base de datos por primera vez, no
-- hace falta: schema.sql ya incluye estas columnas.

alter table employees add column if not exists username text unique;
alter table employees add column if not exists email text;
alter table employees add column if not exists password_hash text;
