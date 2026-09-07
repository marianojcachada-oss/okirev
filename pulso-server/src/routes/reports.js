import { Router } from "express";
import { query, EFFECTIVE_CATEGORY_SQL } from "../db.js";
import { requireSession, requirePermission } from "../middleware/requireSession.js";

const router = Router();

const BROWSER_LIKE = ["chrome", "msedge", "edge", "firefox", "outlook", "teams", "slack", "whatsapp"];

// GET /api/reports/apps -> hours per app, aggregated from real activity records.
router.get("/apps", requireSession, requirePermission("informes-apps"), async (req, res) => {
  const { rows } = await query(
    `select a.app, ${EFFECTIVE_CATEGORY_SQL} as category, sum(a.duration_seconds) as seconds
     from activities a
     left join app_catalog ac on ac.app_label = a.app
     where ${EFFECTIVE_CATEGORY_SQL} in ('Productiva', 'Improductiva')
     group by a.app, ${EFFECTIVE_CATEGORY_SQL}
     order by seconds desc
     limit 20`
  );
  res.json(
    rows.map((r) => ({
      name: r.app,
      category: r.category,
      hours: Math.round((r.seconds / 3600) * 10) / 10,
    }))
  );
});

// GET /api/reports/web -> same idea, filtered to browser/communication-looking process names.
// NOTE: without a browser extension we only see the process name + window title, so this is
// an approximation until real domain-level tracking exists.
router.get("/web", requireSession, requirePermission("informes-web"), async (req, res) => {
  const { rows } = await query(
    `select a.app, ${EFFECTIVE_CATEGORY_SQL} as category, sum(a.duration_seconds) as seconds
     from activities a
     left join app_catalog ac on ac.app_label = a.app
     where lower(a.app) like any ($1)
     group by a.app, ${EFFECTIVE_CATEGORY_SQL}
     order by seconds desc
     limit 20`,
    [BROWSER_LIKE.map((s) => `%${s}%`)]
  );
  res.json(
    rows.map((r) => ({
      name: r.app,
      category: r.category === "Productiva" ? "Comunicación" : "No autorizada",
      hours: Math.round((r.seconds / 3600) * 10) / 10,
    }))
  );
});

// GET /api/reports/activity-chart -> hourly breakdown for today, used on the Inicio page.
router.get("/activity-chart", requireSession, requirePermission("inicio"), async (req, res) => {
  const { rows } = await query(
    `select date_trunc('hour', a.occurred_at at time zone 'America/New_York') as hour_bucket,
            ${EFFECTIVE_CATEGORY_SQL} as category,
            sum(a.duration_seconds) as seconds
     from activities a
     left join app_catalog ac on ac.app_label = a.app
     where (a.occurred_at at time zone 'America/New_York')::date = (now() at time zone 'America/New_York')::date
     group by hour_bucket, ${EFFECTIVE_CATEGORY_SQL}`
  );

  const byHour = {}; // hour (0-23) -> { productivo, neutral, inactivo } in seconds
  for (const row of rows) {
    const hour = new Date(row.hour_bucket).getUTCHours(); // hour_bucket is already the local wall-clock hour, stored tz-naive
    byHour[hour] = byHour[hour] || { productivo: 0, neutral: 0, inactivo: 0 };
    const seconds = Number(row.seconds);
    if (row.category === "Productiva") byHour[hour].productivo += seconds;
    else if (row.category === "Inactivo") byHour[hour].inactivo += seconds;
    else byHour[hour].neutral += seconds;
  }

  const currentHour = new Date().toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: "America/New_York" });
  const maxHour = parseInt(currentHour, 10) % 24;

  const result = [];
  for (let h = 0; h <= maxHour; h++) {
    const bucket = byHour[h] || { productivo: 0, neutral: 0, inactivo: 0 };
    const total = bucket.productivo + bucket.neutral + bucket.inactivo;
    result.push({
      hora: `${String(h).padStart(2, "0")}h`,
      productivo: total > 0 ? Math.round((bucket.productivo / total) * 100) : 0,
      neutral: total > 0 ? Math.round((bucket.neutral / total) * 100) : 0,
      inactivo: total > 0 ? Math.round((bucket.inactivo / total) * 100) : 0,
    });
  }
  res.json(result);
});

export default router;
