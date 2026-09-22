-- Corré esto en el SQL Editor de Supabase para sumar la grabación de pantalla.
--
-- IMPORTANTE: esto solo prepara la base de datos. Todavía hace falta crear un bucket de
-- Storage en Supabase para guardar los videos — instrucciones aparte, esto no lo hace solo.

alter table settings add column if not exists recording_enabled boolean not null default false;
alter table settings add column if not exists recording_fps integer not null default 3;
alter table settings add column if not exists recording_quality text not null default 'medium';
alter table settings add column if not exists recording_chunk_minutes integer not null default 5;
alter table settings add column if not exists recording_retention_days integer not null default 30;
alter table settings add column if not exists recording_max_width integer not null default 1280;
alter table settings add column if not exists recording_preset text not null default 'balanceado';
alter table settings add column if not exists recording_audio_enabled boolean not null default false;
alter table settings add column if not exists recording_priority_site text;
alter table settings add column if not exists recording_priority_width integer not null default 1280;
alter table settings add column if not exists recording_secondary_width integer not null default 960;

create table if not exists screen_recordings (
  id text primary key,
  employee_id text not null references employees(id) on delete cascade,
  employee_name text not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  storage_path text not null,
  file_size_bytes bigint,
  duration_seconds integer,
  created_at timestamptz not null default now()
);
create index if not exists idx_recordings_employee_date on screen_recordings(employee_id, started_at);
alter table screen_recordings add column if not exists thumbnail text;
alter table screen_recordings add column if not exists screen_index integer not null default 0;
