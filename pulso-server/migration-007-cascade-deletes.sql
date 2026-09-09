-- Corré esto en el SQL Editor de Supabase. Arregla que hoy no te deja borrar un empleado
-- si ya tiene asistencia, actividad, alertas o breaks cargados (la base de datos lo bloqueaba
-- para "protegerte", pero en este caso lo que queremos es justamente poder borrarlo con todo
-- lo que tenga colgado).

alter table attendance drop constraint if exists attendance_employee_id_fkey;
alter table attendance add constraint attendance_employee_id_fkey
  foreign key (employee_id) references employees(id) on delete cascade;

alter table activities drop constraint if exists activities_employee_id_fkey;
alter table activities add constraint activities_employee_id_fkey
  foreign key (employee_id) references employees(id) on delete cascade;

alter table alerts drop constraint if exists alerts_employee_id_fkey;
alter table alerts add constraint alerts_employee_id_fkey
  foreign key (employee_id) references employees(id) on delete cascade;

alter table breaks drop constraint if exists breaks_employee_id_fkey;
alter table breaks add constraint breaks_employee_id_fkey
  foreign key (employee_id) references employees(id) on delete cascade;

alter table breaks drop constraint if exists breaks_attendance_id_fkey;
alter table breaks add constraint breaks_attendance_id_fkey
  foreign key (attendance_id) references attendance(id) on delete cascade;
