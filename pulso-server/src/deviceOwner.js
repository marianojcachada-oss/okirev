import { query } from "./db.js";

// Una jornada abierta pertenece a la PC desde la que se inició (columna attendance.device = nombre
// de la PC). Devuelve true si el reporte viene de OTRA PC distinta de la dueña de la jornada.
// Si el tracker no informa su PC (versión vieja) o la jornada no tiene PC registrada, se acepta
// como siempre (no se descarta nada).
export async function isForeignDevice(employeeId, device) {
  if (typeof device !== "string" || !device.trim()) return false;
  const { rows } = await query(
    "select device from attendance where employee_id = $1 and check_out_at is null order by check_in_at desc limit 1",
    [employeeId]
  );
  const owner = rows[0]?.device;
  return !!owner && owner !== device.trim();
}
