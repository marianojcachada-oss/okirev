-- Corré esto en el SQL Editor de Supabase para sumar las alertas de ausencia y de apps/sitios
-- prohibidos.

alter table settings add column if not exists prohibited_apps_alerts_enabled boolean not null default false;

alter table employees add column if not exists expected_checkin_time time;
alter table employees add column if not exists expected_checkin_days integer[] not null default '{1,2,3,4,5}';
