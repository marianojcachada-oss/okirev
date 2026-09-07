import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { query, newId } from "../db.js";
import { requireSession } from "../middleware/requireSession.js";

const router = Router();

function makeToken() {
  return crypto.randomBytes(24).toString("hex");
}

async function buildAuthResponse(employee) {
  const roleResult = employee.role_id
    ? await query("select id, name, permissions from roles where id = $1", [employee.role_id])
    : { rows: [] };
  const role = roleResult.rows[0] || null;

  const token = makeToken();
  await query("insert into sessions (token, employee_id) values ($1, $2)", [token, employee.id]);

  return {
    id: employee.id,
    name: employee.name,
    team: employee.team_name,
    username: employee.username,
    role: role ? { id: role.id, name: role.name, permissions: role.permissions || [] } : null,
    token,
  };
}

// POST /api/auth/login  { username, password }
// Used by both the desktop tracker (no role needed) and the dashboard (role determines
// which pages are visible). There is no self-service password reset — only an administrator
// can set or change a password (via POST /employees/:id/password).
router.post("/login", async (req, res) => {
  const { username, password, hostname } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Falta usuario o contraseña" });
  }

  const { rows } = await query(
    `select e.*, t.name as team_name
     from employees e
     left join teams t on t.id = e.team_id
     where lower(e.username) = lower($1)`,
    [username]
  );
  const employee = rows[0];

  if (!employee || !employee.password_hash) {
    return res.status(401).json({ error: "Usuario o contraseña incorrectos" });
  }

  const valid = await bcrypt.compare(password, employee.password_hash);
  if (!valid) {
    return res.status(401).json({ error: "Usuario o contraseña incorrectos" });
  }

  if (hostname && hostname.trim()) {
    await query(
      `insert into employee_devices (id, employee_id, hostname, first_seen_at, last_seen_at)
       values ($1, $2, $3, now(), now())
       on conflict (employee_id, hostname) do update set last_seen_at = now()`,
      [newId("dev"), employee.id, hostname.trim()]
    );
  }

  res.json(await buildAuthResponse(employee));
});

// GET /api/auth/me -- validates the current token and returns fresh employee/role info.
// Used by the dashboard on load, and by the "auto-login" link the tracker opens.
router.get("/me", requireSession, async (req, res) => {
  const { rows } = await query(
    `select e.*, t.name as team_name from employees e left join teams t on t.id = e.team_id where e.id = $1`,
    [req.session.employeeId]
  );
  const employee = rows[0];
  if (!employee) return res.status(404).json({ error: "Empleado no encontrado" });

  const token = req.headers.authorization.slice(7);
  res.json({
    id: employee.id,
    name: employee.name,
    team: employee.team_name,
    username: employee.username,
    role: req.session.role,
    token,
  });
});

// POST /api/auth/logout
router.post("/logout", requireSession, async (req, res) => {
  const token = req.headers.authorization.slice(7);
  await query("delete from sessions where token = $1", [token]);
  res.json({ ok: true });
});

export default router;
