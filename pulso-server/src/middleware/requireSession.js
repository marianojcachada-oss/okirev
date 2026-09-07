import { query } from "../db.js";

// Requires a valid dashboard session (Authorization: Bearer <token>). Attaches req.session
// with the employee's id/name/role so route handlers can check permissions if needed.
// This is separate from the desktop tracker's device token — the tracker keeps using that
// for check-in/check-out/activity ingestion.
export async function requireSession(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "No autenticado" });

  const { rows } = await query(
    `select s.employee_id, e.name, e.username, e.role_id, r.name as role_name, r.permissions
     from sessions s
     join employees e on e.id = s.employee_id
     left join roles r on r.id = e.role_id
     where s.token = $1 and s.expires_at > now()`,
    [token]
  );
  const session = rows[0];
  if (!session) return res.status(401).json({ error: "Sesión inválida o vencida. Iniciá sesión de nuevo." });

  req.session = {
    employeeId: session.employee_id,
    name: session.name,
    username: session.username,
    role: session.role_id ? { id: session.role_id, name: session.role_name, permissions: session.permissions || [] } : null,
  };
  next();
}

// Requires the session's role to have at least one of the given page permissions (checking
// both the plain page id and its ":own" scoped variant). Must run AFTER requireSession, since
// it reads req.session. Returns 403 (not 401) — the user IS authenticated, just not authorized
// for this particular resource.
export function requirePermission(...pageIds) {
  return (req, res, next) => {
    const perms = req.session?.role?.permissions || [];
    const allowed = pageIds.some((p) => perms.includes(p) || perms.includes(`${p}:own`));
    if (!allowed) {
      return res.status(403).json({ error: "Tu rol no tiene permiso para acceder a esto" });
    }
    next();
  };
}
