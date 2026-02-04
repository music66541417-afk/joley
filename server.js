// server.js
import "dotenv/config";
import express from "express";
import http from "http";
import { Server } from "socket.io";

import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import bcrypt from "bcrypt";

import pg from "pg";
const { Pool } = pg;

// =======================
// PostgreSQL (Railway)
// =======================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  options: "-c search_path=public",
});

pool.on("error", (err) => {
  console.log("⚠️ PG pool error:", err.message);
});

pool
  .query("SELECT 1 as ok")
  .then(() => console.log("✅ DB conectada"))
  .catch((e) => console.log("⚠️ DB aún no responde:", e.message));

// =======================
// App / Server
// =======================
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());

// =======================
// Sessions (PostgreSQL)
// =======================
const PgSession = connectPgSimple(session);

app.use(
  session({
    store: new PgSession({
      pool,
      tableName: "session",
    }),
    secret: process.env.SESSION_SECRET || "dev_secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 12, // 12h
    },
  })
);

// =======================
// Bloquear acceso directo a HTML sensibles
// =======================
app.use((req, res, next) => {
  const blocked = new Set(["/dj.html", "/dj2.html", "/admin.html"]);
  if (!blocked.has(req.path)) return next();

  if (!req.session?.user) {
    return res.redirect("/login?next=" + encodeURIComponent(req.originalUrl));
  }

  const map = {
    "/dj.html": "/dj",
    "/dj2.html": "/dj2",
    "/admin.html": "/admin",
  };
  return res.redirect(map[req.path] || "/");
});

// Static después de session
app.use(express.static("public", { index: false }));

// =======================
// Middleware auth
// =======================
function requireDjRoute(route) {
  return (req, res, next) => {
    if (!req.session?.user) {
      return res.redirect("/login?next=" + encodeURIComponent(req.originalUrl));
    }
    if (req.session.user.dj_route && req.session.user.dj_route !== route) {
      return res.redirect(req.session.user.dj_route);
    }
    return next();
  };
}

function requireAdmin(req, res, next) {
  if (!req.session?.user) {
    return res.status(401).json({ ok: false, error: "No logueado" });
  }
  if (req.session.user.dj_route !== "/admin") {
    return res.status(403).json({ ok: false, error: "Solo admin" });
  }
  return next();
}

// =======================
// Helpers DB -> payload UI
// =======================
function rowToRequest(r) {
  return {
    id: Number(r.id),
    table: r.table_no,
    name: r.name,
    artist: r.artist,
    song: r.song,
    createdAt: r.created_at,
    status: "Pendiente",
  };
}

async function getRequestsPiso1() {
  const q = await pool.query(
    "SELECT id, table_no, name, artist, song, created_at FROM requests ORDER BY id ASC"
  );
  return q.rows.map(rowToRequest);
}

async function getRequestsPiso2() {
  const q = await pool.query(
    "SELECT id, table_no, name, artist, song, created_at FROM requests2 ORDER BY id ASC"
  );
  return q.rows.map(rowToRequest);
}

async function emitRequests() {
  const [r1, r2] = await Promise.all([getRequestsPiso1(), getRequestsPiso2()]);
  io.emit("requests:update", r1);
  io.emit("requests2:update", r2);
}

// =======================
// Estado pedidos (DB: orders_status)
// =======================
let ordersOpen = { piso1: true, piso2: true };

async function loadOrdersStatus() {
  try {
    const q = await pool.query(
      "SELECT piso1, piso2 FROM orders_status WHERE id=1"
    );
    if (q.rowCount) {
      ordersOpen = { piso1: !!q.rows[0].piso1, piso2: !!q.rows[0].piso2 };
    } else {
      await pool.query(
        "INSERT INTO orders_status (id, piso1, piso2) VALUES (1, TRUE, TRUE) ON CONFLICT (id) DO NOTHING"
      );
      ordersOpen = { piso1: true, piso2: true };
    }
  } catch (e) {
    console.log("⚠️ No pude cargar orders_status:", e.message);
    ordersOpen = { piso1: true, piso2: true };
  }
}

function emitOrdersStatus() {
  io.emit("orders:status", ordersOpen);
}

// Endpoint público
app.get("/api/orders-status", async (req, res) => {
  await loadOrdersStatus();
  res.json({ ok: true, ordersOpen });
});

// Endpoint admin
app.post("/api/admin/orders", requireAdmin, async (req, res) => {
  const { piso1, piso2 } = req.body || {};

  if (typeof piso1 !== "boolean" && typeof piso2 !== "boolean") {
    return res.status(400).json({ ok: false, error: "Payload inválido" });
  }

  await loadOrdersStatus();

  const newStatus = {
    piso1: typeof piso1 === "boolean" ? piso1 : ordersOpen.piso1,
    piso2: typeof piso2 === "boolean" ? piso2 : ordersOpen.piso2,
  };

  try {
    await pool.query(
      "UPDATE orders_status SET piso1=$1, piso2=$2, updated_at=NOW() WHERE id=1",
      [newStatus.piso1, newStatus.piso2]
    );
    ordersOpen = newStatus;
    emitOrdersStatus();
    return res.json({ ok: true, ordersOpen });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// =======================
// Health check
// =======================
app.get("/health/db", async (req, res) => {
  try {
    const r = await pool.query("SELECT 1 as ok");
    res.json({ ok: true, db: r.rows[0].ok });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// =======================
// Horarios por piso (Servidor Chile)
// =======================
const TZ_CHILE = process.env.TZ_CHILE || "America/Santiago";
const CUTOFF_PISO1_HHMM = process.env.CUTOFF_PISO1 || "03:30";
const CUTOFF_PISO2_HHMM = process.env.CUTOFF_PISO2 || "02:30";
const RESET_HHMM = process.env.RESET_HHMM || "12:00";

function hhmmToMinutes(hhmm) {
  const m = String(hhmm || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

const cutoffPiso1 = hhmmToMinutes(CUTOFF_PISO1_HHMM) ?? 3 * 60 + 30;
const cutoffPiso2 = hhmmToMinutes(CUTOFF_PISO2_HHMM) ?? 2 * 60 + 30;
const resetMin = hhmmToMinutes(RESET_HHMM) ?? 12 * 60;

function getChileMinutesNow() {
  const parts = new Intl.DateTimeFormat("es-CL", {
    timeZone: TZ_CHILE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  const hh = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const mm = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return hh * 60 + mm;
}

function isClosed(nowMin, cutoffMin) {
  return nowMin >= cutoffMin && nowMin < resetMin;
}

function rejectIfClosedForFloor(floor) {
  const nowMin = getChileMinutesNow();
  const cutoffMin = floor === 2 ? cutoffPiso2 : cutoffPiso1;

  if (isClosed(nowMin, cutoffMin)) {
    return {
      ok: false,
      error: "Las solicitudes no están disponibles en este horario.",
      floor,
      tz: TZ_CHILE,
      nowMinutes: nowMin,
      cutoff: floor === 2 ? CUTOFF_PISO2_HHMM : CUTOFF_PISO1_HHMM,
      reset: RESET_HHMM,
      reason: "schedule",
    };
  }
  return null;
}

function rejectIfAdminClosed(floor) {
  if (floor === 1 && !ordersOpen.piso1) {
    return {
      ok: false,
      error: "Lo sentimos, pedidos no disponibles.",
      floor: 1,
      reason: "admin",
    };
  }
  if (floor === 2 && !ordersOpen.piso2) {
    return {
      ok: false,
      error: "Lo sentimos, pedidos no disponibles.",
      floor: 2,
      reason: "admin",
    };
  }
  return null;
}

app.get("/api/hours", (req, res) => {
  const nowMin = getChileMinutesNow();
  res.json({
    ok: true,
    tz: TZ_CHILE,
    nowMinutes: nowMin,
    piso1: { cutoff: CUTOFF_PISO1_HHMM, closed: isClosed(nowMin, cutoffPiso1) },
    piso2: { cutoff: CUTOFF_PISO2_HHMM, closed: isClosed(nowMin, cutoffPiso2) },
    reset: RESET_HHMM,
  });
});

// =======================
// Rutas páginas
// =======================
app.get("/", (req, res) => {
  if (req.session?.user?.dj_route) return res.redirect(req.session.user.dj_route);
  return res.redirect("/login");
});

app.get("/login", (req, res) => res.sendFile(process.cwd() + "/public/login.html"));
app.get("/piso1", (req, res) => res.sendFile(process.cwd() + "/public/index.html"));
app.get("/piso2", (req, res) => res.sendFile(process.cwd() + "/public/arriba.html"));

app.get("/dj", requireDjRoute("/dj"), (req, res) =>
  res.sendFile(process.cwd() + "/public/dj.html")
);
app.get("/dj2", requireDjRoute("/dj2"), (req, res) =>
  res.sendFile(process.cwd() + "/public/dj2.html")
);
app.get("/admin", requireDjRoute("/admin"), (req, res) =>
  res.sendFile(process.cwd() + "/public/admin.html")
);

// =======================
// Login / Auth
// =======================
app.post("/auth/login", async (req, res) => {
  const { username, password } = req.body;

  const q = await pool.query(
    "SELECT id, username, password_hash, dj_route FROM dj_users WHERE username=$1",
    [username]
  );

  if (!q.rowCount) return res.json({ ok: false, error: "Usuario incorrecto" });

  const user = q.rows[0];
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.json({ ok: false, error: "Clave incorrecta" });

  req.session.user = {
    id: user.id,
    username: user.username,
    dj_route: user.dj_route,
  };

  return res.json({ ok: true, next: user.dj_route });
});

app.post("/auth/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// =======================
// Validación payload
// =======================
function validatePayload({ table, name, artist, song }) {
  if (!/^\d{1,3}$/.test(String(table ?? ""))) return "Mesa inválida";
  if (!name || name.length > 40) return "Nombre inválido";
  if (!artist || artist.length > 40) return "Artista inválido";
  if (!song || song.length > 40) return "Canción inválida";
  return null;
}

// =======================
// ✅ Anti-spam SERVIDOR (regla real)
// 15s por mesa y por piso (aunque refresquen)
// =======================
const REQUEST_COOLDOWN_MS = 15000;
const lastRequestByKey = new Map(); // key -> timestamp(ms)

function checkCooldownOrNull(key) {
  const now = Date.now();
  const last = lastRequestByKey.get(key) || 0;
  const diff = now - last;

  if (diff < REQUEST_COOLDOWN_MS) {
    const wait = Math.ceil((REQUEST_COOLDOWN_MS - diff) / 1000);
    return { wait };
  }

  lastRequestByKey.set(key, now);

  if (lastRequestByKey.size > 8000) {
    const cutoff = now - 10 * 60 * 1000;
    for (const [k, ts] of lastRequestByKey.entries()) {
      if (ts < cutoff) lastRequestByKey.delete(k);
    }
    if (lastRequestByKey.size > 12000) lastRequestByKey.clear();
  }

  return null;
}

// =======================
// ✅ song_key (para plays.song_key NOT NULL)
// =======================
// =======================
// ✅ keys (para plays.song_key / plays.artist_key NOT NULL)
// =======================
function normalizeKey(x) {
  return String(x ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function makeSongKey(song, artist) {
  const s = normalizeKey(song);
  const a = normalizeKey(artist);
  const key = `${s}|${a}`.trim();
  return key || "unknown_song";
}

function makeArtistKey(artist) {
  const a = normalizeKey(artist);
  return a || "unknown_artist";
}

// Inserta en plays intentando con song_key + artist_key;
// si alguna columna no existe en otro ambiente, hace fallback
async function insertPlaySafe({ piso, table_no, name, artist, song, requested_at }) {
  const song_key = makeSongKey(song, artist);
  const artist_key = makeArtistKey(artist);

  // 1) intento completo (song_key + artist_key)
  try {
    return await pool.query(
      `
      INSERT INTO plays (piso, table_no, name, artist, song, song_key, artist_key, requested_at, played_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8, NOW())
      RETURNING id
      `,
      [piso, table_no, name, artist, song, song_key, artist_key, requested_at]
    );
  } catch (e) {
    // 42703 = undefined_column (por si en algún ambiente no existen esas columnas)
    if (e && e.code === "42703") {
      // 2) intento solo song_key
      try {
        return await pool.query(
          `
          INSERT INTO plays (piso, table_no, name, artist, song, song_key, requested_at, played_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7, NOW())
          RETURNING id
          `,
          [piso, table_no, name, artist, song, song_key, requested_at]
        );
      } catch (e2) {
        if (e2 && e2.code === "42703") {
          // 3) intento sin keys (ambiente antiguo)
          return await pool.query(
            `
            INSERT INTO plays (piso, table_no, name, artist, song, requested_at, played_at)
            VALUES ($1,$2,$3,$4,$5,$6, NOW())
            RETURNING id
            `,
            [piso, table_no, name, artist, song, requested_at]
          );
        }
        throw e2;
      }
    }
    throw e;
  }
}


// =======================
// Requests Piso 1 (DB)
// =======================
app.post("/api/requests", async (req, res) => {
  await loadOrdersStatus();

  const closedBySchedule = rejectIfClosedForFloor(1);
  if (closedBySchedule) return res.status(403).json(closedBySchedule);

  const closedByAdmin = rejectIfAdminClosed(1);
  if (closedByAdmin) return res.status(403).json(closedByAdmin);

  const error = validatePayload(req.body);
  if (error) return res.status(400).json({ ok: false, error });

  try {
    const { table, name, artist, song } = req.body;

    const key = `p1:${String(table)}`;
    const cd = checkCooldownOrNull(key);
    if (cd) {
      return res.status(429).json({
        ok: false,
        error: `⏳ Espera ${cd.wait}s antes de enviar otra solicitud.`,
        reason: "cooldown",
        floor: 1,
      });
    }

    const q = await pool.query(
      `INSERT INTO requests (table_no, name, artist, song)
       VALUES ($1,$2,$3,$4)
       RETURNING id, table_no, name, artist, song, created_at`,
      [String(table), name, artist, song]
    );

    await emitRequests();
    return res.json({ ok: true, item: rowToRequest(q.rows[0]) });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

app.get("/api/requests", async (req, res) => {
  try {
    const requests = await getRequestsPiso1();
    res.json({ ok: true, requests });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ✅ Marcar "Reproducida" = mover a plays + borrar
app.delete("/api/requests/:id", async (req, res) => {
  const id = Number(req.params.id);

  try {
    // 1) sacar la request (sin perder datos)
    const removed = await pool.query(
      `DELETE FROM requests WHERE id=$1
       RETURNING table_no, name, artist, song, created_at`,
      [id]
    );

    // si no existía, igual emitimos y devolvemos ok
    if (!removed.rowCount) {
      await emitRequests();
      return res.json({ ok: true, playedLogged: false });
    }

    const r = removed.rows[0];

    // 2) insertar en plays (con song_key)
    await insertPlaySafe({
      piso: 1,
      table_no: r.table_no,
      name: r.name,
      artist: r.artist,
      song: r.song,
      requested_at: r.created_at,
    });

    // 3) update UI realtime
    await emitRequests();
    return res.json({ ok: true, playedLogged: true });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// borrar todo (sin stats)
app.delete("/api/requests", async (req, res) => {
  try {
    await pool.query("DELETE FROM requests");
    await emitRequests();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// =======================
// Requests Piso 2 (DB)
// =======================
app.post("/api/requests2", async (req, res) => {
  await loadOrdersStatus();

  const closedBySchedule = rejectIfClosedForFloor(2);
  if (closedBySchedule) return res.status(403).json(closedBySchedule);

  const closedByAdmin = rejectIfAdminClosed(2);
  if (closedByAdmin) return res.status(403).json(closedByAdmin);

  const error = validatePayload(req.body);
  if (error) return res.status(400).json({ ok: false, error });

  try {
    const { table, name, artist, song } = req.body;

    const key = `p2:${String(table)}`;
    const cd = checkCooldownOrNull(key);
    if (cd) {
      return res.status(429).json({
        ok: false,
        error: `⏳ Espera ${cd.wait}s antes de enviar otra solicitud.`,
        reason: "cooldown",
        floor: 2,
      });
    }

    const q = await pool.query(
      `INSERT INTO requests2 (table_no, name, artist, song)
       VALUES ($1,$2,$3,$4)
       RETURNING id, table_no, name, artist, song, created_at`,
      [String(table), name, artist, song]
    );

    await emitRequests();
    return res.json({ ok: true, item: rowToRequest(q.rows[0]) });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

app.get("/api/requests2", async (req, res) => {
  try {
    const requests = await getRequestsPiso2();
    res.json({ ok: true, requests });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.delete("/api/requests2/:id", async (req, res) => {
  const id = Number(req.params.id);

  try {
    const removed = await pool.query(
      `DELETE FROM requests2 WHERE id=$1
       RETURNING table_no, name, artist, song, created_at`,
      [id]
    );

    if (!removed.rowCount) {
      await emitRequests();
      return res.json({ ok: true, playedLogged: false });
    }

    const r = removed.rows[0];

    await insertPlaySafe({
      piso: 2,
      table_no: r.table_no,
      name: r.name,
      artist: r.artist,
      song: r.song,
      requested_at: r.created_at,
    });

    await emitRequests();
    return res.json({ ok: true, playedLogged: true });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

app.delete("/api/requests2", async (req, res) => {
  try {
    await pool.query("DELETE FROM requests2");
    await emitRequests();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// =======================
// Admin Stats (DB: plays)
// =======================
function parseDays(x, fallback) {
  const n = Number(x);
  if (!Number.isFinite(n) || n <= 0 || n > 3650) return fallback;
  return Math.floor(n);
}

app.get("/api/admin/stats/summary", requireAdmin, async (req, res) => {
  const days = parseDays(req.query.days, 30);

  try {
    const q = await pool.query(
      `
      SELECT
        (SELECT COUNT(*) FROM plays WHERE played_at >= NOW() - ($1 || ' days')::interval) AS total,
        (SELECT COUNT(*) FROM plays WHERE piso=1 AND played_at >= NOW() - ($1 || ' days')::interval) AS piso1,
        (SELECT COUNT(*) FROM plays WHERE piso=2 AND played_at >= NOW() - ($1 || ' days')::interval) AS piso2
      `,
      [days]
    );

    res.json({ ok: true, days, ...q.rows[0] });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get("/api/admin/stats/top-songs", requireAdmin, async (req, res) => {
  const days = parseDays(req.query.days, 30);
  const limit = 10;

  try {
    const q = await pool.query(
      `
      SELECT song, artist, COUNT(*)::int AS plays
      FROM plays
      WHERE played_at >= NOW() - ($1 || ' days')::interval
      GROUP BY song, artist
      ORDER BY plays DESC
      LIMIT ${limit}
      `,
      [days]
    );

    res.json({ ok: true, days, rows: q.rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get("/api/admin/stats/top-artists", requireAdmin, async (req, res) => {
  const days = parseDays(req.query.days, 30);
  const limit = 10;

  try {
    const q = await pool.query(
      `
      SELECT artist, COUNT(*)::int AS plays
      FROM plays
      WHERE played_at >= NOW() - ($1 || ' days')::interval
      GROUP BY artist
      ORDER BY plays DESC
      LIMIT ${limit}
      `,
      [days]
    );

    res.json({ ok: true, days, rows: q.rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get("/api/admin/stats/by-day", requireAdmin, async (req, res) => {
  const days = parseDays(req.query.days, 30);

  try {
    const q = await pool.query(
      `
      SELECT DATE(played_at) AS day, COUNT(*)::int AS plays
      FROM plays
      WHERE played_at >= NOW() - ($1 || ' days')::interval
      GROUP BY day
      ORDER BY day DESC
      `,
      [days]
    );

    res.json({ ok: true, days, rows: q.rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get("/api/admin/stats/by-floor", requireAdmin, async (req, res) => {
  const days = parseDays(req.query.days, 30);

  try {
    const q = await pool.query(
      `
      SELECT piso, COUNT(*)::int AS plays
      FROM plays
      WHERE played_at >= NOW() - ($1 || ' days')::interval
      GROUP BY piso
      ORDER BY piso
      `,
      [days]
    );

    res.json({ ok: true, days, rows: q.rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// =======================
// Socket
// =======================
io.on("connection", async (socket) => {
  await loadOrdersStatus();
  socket.emit("orders:status", ordersOpen);

  try {
    socket.emit("requests:update", await getRequestsPiso1());
    socket.emit("requests2:update", await getRequestsPiso2());
  } catch {
    socket.emit("requests:update", []);
    socket.emit("requests2:update", []);
  }
});

// =======================
// Start
// =======================
const PORT = process.env.PORT || 3000;

(async () => {
  await loadOrdersStatus();

  server.listen(PORT, "0.0.0.0", async () => {
    console.log(`🚀 http://localhost:${PORT}`);
    console.log(`DJ1:    http://localhost:${PORT}/dj`);
    console.log(`Piso1 (Clientes): http://localhost:${PORT}/piso1`);
    console.log(`DJ2:    http://localhost:${PORT}/dj2`);
    console.log(`Piso2 (Clientes): http://localhost:${PORT}/piso2`);
    console.log(`Admin:  http://localhost:${PORT}/admin`);
    console.log("DATABASE_URL cargada:", !!process.env.DATABASE_URL);
    console.log("🟢 ordersOpen inicial (DB):", ordersOpen);

    emitOrdersStatus();
    await emitRequests();
  });
})();
