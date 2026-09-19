-- Corré esto en el SQL Editor de Supabase para sumar el nivel de "superadministrador",
-- separado de los roles normales — es el único que puede usar las herramientas de limpieza
-- masiva (desconectar a todos, reiniciar los contadores del día).

alter table employees add column if not exists is_super_admin boolean not null default false;

-- Marcate a vos mismo como superadministrador (reemplazá 'tu_usuario' por el tuyo real):
-- update employees set is_super_admin = true where username = 'tu_usuario';
