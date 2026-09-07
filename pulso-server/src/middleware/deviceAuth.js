import { query } from "../db.js";

// If no desktop token has been generated yet, requests pass through unauthenticated
// (useful while developing locally before the desktop app is connected). Once a token
// exists in Ajustes, callers must send it as: Authorization: Bearer <token>
export async function requireDeviceToken(req, res, next) {
  const { rows } = await query("select desktop_token from settings where id = 1");
  const token = rows[0]?.desktop_token;
  if (!token) return next();

  const header = req.headers.authorization || "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (provided !== token) {
    return res.status(401).json({ error: "Token inválido o ausente. Revisá el token generado en Ajustes." });
  }
  next();
}
