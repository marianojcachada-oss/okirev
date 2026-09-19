import { query, newId, nowHM } from "./db.js";

// Busca empleados con una hora de check-in esperada configurada (opt-in, por persona) que ya
// pasaron esa hora + 15 minutos de gracia, no marcaron ningún check-in hoy, y todavía no
// tienen una alerta de ausencia generada hoy — y les crea una.
export async function checkAbsences() {
  const { rows } = await query(`
    select e.id, e.name from employees e
    where e.expected_checkin_time is not null
      and extract(dow from (now() at time zone 'America/New_York')) = any(e.expected_checkin_days)
      and (now() at time zone 'America/New_York')::time >= e.expected_checkin_time + interval '15 minutes'
      and not exists (
        select 1 from attendance a
        where a.employee_id = e.id and a.date = (now() at time zone 'America/New_York')::date
      )
      and not exists (
        select 1 from alerts al
        where al.employee_id = e.id and al.type = 'ausencia'
          and (al.created_at at time zone 'America/New_York')::date = (now() at time zone 'America/New_York')::date
      )
  `);

  for (const emp of rows) {
    await query(
      `insert into alerts (id, severity, type, employee_id, employee_name, detail, time, status)
       values ($1, 'critica', 'ausencia', $2, $3, 'Ausencia sin aviso', $4, 'abierta')`,
      [newId("al"), emp.id, emp.name, nowHM()]
    );
  }
  return rows.length;
}

// Corre el chequeo cada 5 minutos. El servidor tiene que seguir despierto para que esto
// funcione — si ya tenés un ping externo (UptimeRobot, cron-job.org) pegándole a /api/health
// para evitar que Render lo duerma, este chequeo se aprovecha de eso mismo.
export function startAbsenceChecker() {
  setInterval(() => {
    checkAbsences().catch((err) => console.error("Error chequeando ausencias:", err.message));
  }, 5 * 60 * 1000);
}
