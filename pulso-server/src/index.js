import express from "express";
import cors from "cors";
import "express-async-errors";

import employeesRouter from "./routes/employees.js";
import teamsRouter from "./routes/teams.js";
import alertsRouter from "./routes/alerts.js";
import attendanceRouter from "./routes/attendance.js";
import activitiesRouter from "./routes/activities.js";
import projectsRouter from "./routes/projects.js";
import reportsRouter from "./routes/reports.js";
import settingsRouter from "./routes/settings.js";
import authRouter from "./routes/auth.js";
import rolesRouter from "./routes/roles.js";
import trackingConfigsRouter from "./routes/trackingConfigs.js";
import breaksRouter from "./routes/breaks.js";
import catalogRouter from "./routes/catalog.js";
import { pool } from "./db.js";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/api/health", async (req, res) => {
  try {
    await pool.query("select 1");
    res.json({ ok: true, database: "connected" });
  } catch (err) {
    res.status(503).json({ ok: false, database: "unreachable", error: err.message });
  }
});

app.use("/api/employees", employeesRouter);
app.use("/api/teams", teamsRouter);
app.use("/api/alerts", alertsRouter);
app.use("/api/attendance", attendanceRouter);
app.use("/api/activities", activitiesRouter);
app.use("/api/projects", projectsRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/auth", authRouter);
app.use("/api/roles", rolesRouter);
app.use("/api/tracking-configs", trackingConfigsRouter);
app.use("/api/breaks", breaksRouter);
app.use("/api/catalog", catalogRouter);

app.use((req, res) => {
  res.status(404).json({ error: `Ruta no encontrada: ${req.method} ${req.path}` });
});

// Catches errors thrown by any async route handler (via express-async-errors)
// so a failed query returns a clean 500 instead of hanging the request.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Error interno del servidor", detail: err.message });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`OKlrev API escuchando en http://localhost:${PORT}`);
});
