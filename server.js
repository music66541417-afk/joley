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
// Asegurar tablas/columnas nuevas
// =======================
async function ensureProjectTables() {
  try {
    // requests3
    await pool.query(`
      CREATE TABLE IF NOT EXISTS requests3 (
        id SERIAL PRIMARY KEY,
        table_no TEXT NOT NULL,
        name TEXT NOT NULL,
        artist TEXT NOT NULL,
        song TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // orders_status base + piso3
    await pool.query(`
      CREATE TABLE IF NOT EXISTS orders_status (
        id INT PRIMARY KEY,
        piso1 BOOLEAN NOT NULL DEFAULT TRUE,
        piso2 BOOLEAN NOT NULL DEFAULT TRUE,
        piso3 BOOLEAN NOT NULL DEFAULT TRUE,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await pool.query(`
      ALTER TABLE orders_status
      ADD COLUMN IF NOT EXISTS piso3 BOOLEAN NOT NULL DEFAULT TRUE
    `);

    await pool.query(`
      INSERT INTO orders_status (id, piso1, piso2, piso3)
      VALUES (1, TRUE, TRUE, TRUE)
      ON CONFLICT (id) DO NOTHING
    `);

    console.log("✅ requests3 / orders_status OK");
  } catch (e) {
    console.log("⚠️ No pude asegurar tablas base:", e.message);
  }
}

// =======================
// 🎁 Raffle Winners: asegurar tabla (auto-create)
// =======================
async function ensureRaffleWinnersTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS raffle_winners (
        id SERIAL PRIMARY KEY,
        floor INT NOT NULL CHECK (floor IN (1,2,3)),
        night_day DATE NOT NULL,
        name TEXT NOT NULL,
        name_key TEXT NOT NULL,
        table_no TEXT,
        plays INT NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await pool.query(`
      ALTER TABLE raffle_winners
      ADD COLUMN IF NOT EXISTS table_no TEXT
    `);

    // Reemplaza cualquier check antiguo floor IN (1,2)
    await pool.query(`
      DO $$
      DECLARE cname text;
      BEGIN
        SELECT con.conname
        INTO cname
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace nsp ON nsp.oid = con.connamespace
        WHERE rel.relname = 'raffle_winners'
          AND nsp.nspname = current_schema()
          AND con.contype = 'c'
          AND pg_get_constraintdef(con.oid) ILIKE '%floor%';

        IF cname IS NOT NULL THEN
          EXECUTE format('ALTER TABLE raffle_winners DROP CONSTRAINT %I', cname);
        END IF;

        ALTER TABLE raffle_winners
        ADD CONSTRAINT raffle_winners_floor_check CHECK (floor IN (1,2,3));
      EXCEPTION
        WHEN duplicate_object THEN
          NULL;
      END $$;
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_raffle_winners_day_floor
      ON raffle_winners (night_day DESC, floor);
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_raffle_winners_name_key
      ON raffle_winners (name_key);
    `);

    console.log("✅ raffle_winners OK");
  } catch (e) {
    console.log("⚠️ No pude asegurar raffle_winners:", e.message);
  }
}

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
      maxAge: 1000 * 60 * 60 * 12,
    },
  })
);

// =======================
// Bloquear acceso directo a HTML sensibles
// =======================
app.use((req, res, next) => {
  const blocked = new Set(["/dj.html", "/dj2.html", "/dj3.html", "/admin.html"]);
  if (!blocked.has(req.path)) return next();

  if (!req.session?.user) {
    return res.redirect("/login?next=" + encodeURIComponent(req.originalUrl));
  }

  const map = {
    "/dj.html": "/dj",
    "/dj2.html": "/dj2",
    "/dj3.html": "/dj3",
    "/admin.html": "/admin",
  };
  return res.redirect(map[req.path] || "/");
});

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

async function getRequestsPiso3() {
  const q = await pool.query(
    "SELECT id, table_no, name, artist, song, created_at FROM requests3 ORDER BY id ASC"
  );
  return q.rows.map(rowToRequest);
}

async function emitRequests() {
  const [r1, r2, r3] = await Promise.all([
    getRequestsPiso1(),
    getRequestsPiso2(),
    getRequestsPiso3(),
  ]);
  io.emit("requests:update", r1);
  io.emit("requests2:update", r2);
  io.emit("requests3:update", r3);
}

// ✅ avisar a la ruleta que cambió la lista de concursantes
function emitRaffleUpdate(floor) {
  io.emit("raffle:update", {
    floor,
    at: new Date().toISOString(),
  });
}

// =======================
// Estado pedidos (DB: orders_status)
// =======================
let ordersOpen = { piso1: true, piso2: true, piso3: true };

async function loadOrdersStatus() {
  try {
    await pool.query(`
      ALTER TABLE orders_status
      ADD COLUMN IF NOT EXISTS piso3 BOOLEAN NOT NULL DEFAULT TRUE
    `);

    const q = await pool.query(
      "SELECT piso1, piso2, piso3 FROM orders_status WHERE id=1"
    );

    if (q.rowCount) {
      ordersOpen = {
        piso1: !!q.rows[0].piso1,
        piso2: !!q.rows[0].piso2,
        piso3: !!q.rows[0].piso3,
      };
    } else {
      await pool.query(
        "INSERT INTO orders_status (id, piso1, piso2, piso3) VALUES (1, TRUE, TRUE, TRUE) ON CONFLICT (id) DO NOTHING"
      );
      ordersOpen = { piso1: true, piso2: true, piso3: true };
    }
  } catch (e) {
    console.log("⚠️ No pude cargar orders_status:", e.message);
    ordersOpen = { piso1: true, piso2: true, piso3: true };
  }
}

function emitOrdersStatus() {
  io.emit("orders:status", ordersOpen);
}

app.get("/api/orders-status", async (req, res) => {
  await loadOrdersStatus();
  res.json({ ok: true, ordersOpen });
});

app.post("/api/admin/orders", requireAdmin, async (req, res) => {
  const { piso1, piso2, piso3 } = req.body || {};

  if (
    typeof piso1 !== "boolean" &&
    typeof piso2 !== "boolean" &&
    typeof piso3 !== "boolean"
  ) {
    return res.status(400).json({ ok: false, error: "Payload inválido" });
  }

  await loadOrdersStatus();

  const newStatus = {
    piso1: typeof piso1 === "boolean" ? piso1 : ordersOpen.piso1,
    piso2: typeof piso2 === "boolean" ? piso2 : ordersOpen.piso2,
    piso3: typeof piso3 === "boolean" ? piso3 : ordersOpen.piso3,
  };

  try {
    await pool.query(
      "UPDATE orders_status SET piso1=$1, piso2=$2, piso3=$3, updated_at=NOW() WHERE id=1",
      [newStatus.piso1, newStatus.piso2, newStatus.piso3]
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
const CUTOFF_PISO3_HHMM = process.env.CUTOFF_PISO3 || "02:30";
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
const cutoffPiso3 = hhmmToMinutes(CUTOFF_PISO3_HHMM) ?? 2 * 60 + 30;
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

function getFloorCutoffMin(floor) {
  if (floor === 2) return cutoffPiso2;
  if (floor === 3) return cutoffPiso3;
  return cutoffPiso1;
}

function getFloorCutoffHHMM(floor) {
  if (floor === 2) return CUTOFF_PISO2_HHMM;
  if (floor === 3) return CUTOFF_PISO3_HHMM;
  return CUTOFF_PISO1_HHMM;
}

function rejectIfClosedForFloor(floor) {
  const nowMin = getChileMinutesNow();
  const cutoffMin = getFloorCutoffMin(floor);

  if (isClosed(nowMin, cutoffMin)) {
    return {
      ok: false,
      error: "Las solicitudes no están disponibles en este horario.",
      floor,
      tz: TZ_CHILE,
      nowMinutes: nowMin,
      cutoff: getFloorCutoffHHMM(floor),
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
  if (floor === 3 && !ordersOpen.piso3) {
    return {
      ok: false,
      error: "Lo sentimos, pedidos no disponibles.",
      floor: 3,
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
    piso3: { cutoff: CUTOFF_PISO3_HHMM, closed: isClosed(nowMin, cutoffPiso3) },
    reset: RESET_HHMM,
  });
});

// =======================
// Auto-corte / Auto-reset
// =======================
function getChileDateKey() {
  const parts = new Intl.DateTimeFormat("es-CL", {
    timeZone: TZ_CHILE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const y = parts.find((p) => p.type === "year")?.value ?? "0000";
  const m = parts.find((p) => p.type === "month")?.value ?? "00";
  const d = parts.find((p) => p.type === "day")?.value ?? "00";
  return `${y}-${m}-${d}`;
}

let lastAutoClose = { piso1: null, piso2: null, piso3: null };

async function autoCloseIfNeeded() {
  await loadOrdersStatus();

  const nowMin = getChileMinutesNow();
  const dayKey = getChileDateKey();

  const inWindowP1 = nowMin >= cutoffPiso1 && nowMin < resetMin;
  const inWindowP2 = nowMin >= cutoffPiso2 && nowMin < resetMin;
  const inWindowP3 = nowMin >= cutoffPiso3 && nowMin < resetMin;

  const needsCloseP1 =
    inWindowP1 && ordersOpen.piso1 === true && lastAutoClose.piso1 !== dayKey;

  const needsCloseP2 =
    inWindowP2 && ordersOpen.piso2 === true && lastAutoClose.piso2 !== dayKey;

  const needsCloseP3 =
    inWindowP3 && ordersOpen.piso3 === true && lastAutoClose.piso3 !== dayKey;

  if (!needsCloseP1 && !needsCloseP2 && !needsCloseP3) return;

  const newStatus = {
    piso1: needsCloseP1 ? false : ordersOpen.piso1,
    piso2: needsCloseP2 ? false : ordersOpen.piso2,
    piso3: needsCloseP3 ? false : ordersOpen.piso3,
  };

  try {
    await pool.query(
      "UPDATE orders_status SET piso1=$1, piso2=$2, piso3=$3, updated_at=NOW() WHERE id=1",
      [newStatus.piso1, newStatus.piso2, newStatus.piso3]
    );

    ordersOpen = newStatus;

    if (needsCloseP1) lastAutoClose.piso1 = dayKey;
    if (needsCloseP2) lastAutoClose.piso2 = dayKey;
    if (needsCloseP3) lastAutoClose.piso3 = dayKey;

    emitOrdersStatus();
  } catch (e) {
    console.log("⚠️ autoCloseIfNeeded error:", e.message);
  }
}

let lastAutoReset = null;

async function autoResetIfNeeded() {
  await loadOrdersStatus();

  const nowMin = getChileMinutesNow();
  const dayKey = getChileDateKey();

  const inResetWindow = nowMin >= resetMin && nowMin < resetMin + 2;

  if (!inResetWindow || lastAutoReset === dayKey) return;

  const newStatus = { piso1: true, piso2: true, piso3: true };

  try {
    await pool.query(
      "UPDATE orders_status SET piso1=$1, piso2=$2, piso3=$3, updated_at=NOW() WHERE id=1",
      [newStatus.piso1, newStatus.piso2, newStatus.piso3]
    );

    ordersOpen = newStatus;
    lastAutoClose = { piso1: null, piso2: null, piso3: null };
    lastAutoReset = dayKey;

    emitOrdersStatus();
  } catch (e) {
    console.log("⚠️ autoResetIfNeeded error:", e.message);
  }
}

setInterval(() => {
  autoCloseIfNeeded().catch(() => {});
  autoResetIfNeeded().catch(() => {});
}, 30_000);

// =======================
// Rutas páginas
// =======================
app.get("/", (req, res) => {
  if (req.session?.user?.dj_route) return res.redirect(req.session.user.dj_route);
  return res.redirect("/login");
});

app.get("/login", (req, res) =>
  res.sendFile(process.cwd() + "/public/login.html")
);
app.get("/piso1", (req, res) =>
  res.sendFile(process.cwd() + "/public/index.html")
);
app.get("/piso2", (req, res) =>
  res.sendFile(process.cwd() + "/public/arriba.html")
);
app.get("/piso3", (req, res) =>
  res.sendFile(process.cwd() + "/public/piso3.html")
);

app.get("/dj", requireDjRoute("/dj"), (req, res) =>
  res.sendFile(process.cwd() + "/public/dj.html")
);
app.get("/dj2", requireDjRoute("/dj2"), (req, res) =>
  res.sendFile(process.cwd() + "/public/dj2.html")
);
app.get("/dj3", requireDjRoute("/dj3"), (req, res) =>
  res.sendFile(process.cwd() + "/public/dj3.html")
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
// Anti-spam servidor
// =======================
const REQUEST_COOLDOWN_MS = 15000;
const lastRequestByKey = new Map();

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
// Keys helpers
// =======================
function normalizeKey(x) {
  return String(x ?? "").trim().toLowerCase().replace(/\s+/g, " ").trim();
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

async function insertPlaySafe({
  piso,
  table_no,
  name,
  artist,
  song,
  requested_at,
}) {
  const song_key = makeSongKey(song, artist);
  const artist_key = makeArtistKey(artist);

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
    if (e && e.code === "42703") {
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
// Requests Piso 1
// =======================
app.post("/api/requests", async (req, res) => {
  await loadOrdersStatus();

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

app.delete("/api/requests/:id", async (req, res) => {
  const id = Number(req.params.id);

  try {
    const removed = await pool.query(
      `DELETE FROM requests WHERE id=$1
       RETURNING table_no, name, artist, song, created_at`,
      [id]
    );

    if (!removed.rowCount) {
      await emitRequests();
      return res.json({ ok: true, playedLogged: false });
    }

    const r = removed.rows[0];

    await insertPlaySafe({
      piso: 1,
      table_no: r.table_no,
      name: r.name,
      artist: r.artist,
      song: r.song,
      requested_at: r.created_at,
    });

    await emitRequests();
    emitRaffleUpdate(1);
    return res.json({ ok: true, playedLogged: true });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

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
// Requests Piso 2
// =======================
app.post("/api/requests2", async (req, res) => {
  await loadOrdersStatus();

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
    emitRaffleUpdate(2);
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
// Requests Piso 3
// =======================
app.post("/api/requests3", async (req, res) => {
  await loadOrdersStatus();

  const closedByAdmin = rejectIfAdminClosed(3);
  if (closedByAdmin) return res.status(403).json(closedByAdmin);

  const error = validatePayload(req.body);
  if (error) return res.status(400).json({ ok: false, error });

  try {
    const { table, name, artist, song } = req.body;

    const key = `p3:${String(table)}`;
    const cd = checkCooldownOrNull(key);
    if (cd) {
      return res.status(429).json({
        ok: false,
        error: `⏳ Espera ${cd.wait}s antes de enviar otra solicitud.`,
        reason: "cooldown",
        floor: 3,
      });
    }

    const q = await pool.query(
      `INSERT INTO requests3 (table_no, name, artist, song)
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

app.get("/api/requests3", async (req, res) => {
  try {
    const requests = await getRequestsPiso3();
    res.json({ ok: true, requests });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.delete("/api/requests3/:id", async (req, res) => {
  const id = Number(req.params.id);

  try {
    const removed = await pool.query(
      `DELETE FROM requests3 WHERE id=$1
       RETURNING table_no, name, artist, song, created_at`,
      [id]
    );

    if (!removed.rowCount) {
      await emitRequests();
      return res.json({ ok: true, playedLogged: false });
    }

    const r = removed.rows[0];

    await insertPlaySafe({
      piso: 3,
      table_no: r.table_no,
      name: r.name,
      artist: r.artist,
      song: r.song,
      requested_at: r.created_at,
    });

    await emitRequests();
    emitRaffleUpdate(3);
    return res.json({ ok: true, playedLogged: true });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

app.delete("/api/requests3", async (req, res) => {
  try {
    await pool.query("DELETE FROM requests3");
    await emitRequests();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// =======================
// Admin Stats
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
        (SELECT COUNT(*) FROM plays WHERE piso=2 AND played_at >= NOW() - ($1 || ' days')::interval) AS piso2,
        (SELECT COUNT(*) FROM plays WHERE piso=3 AND played_at >= NOW() - ($1 || ' days')::interval) AS piso3
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
  const limit = 5;

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
  const limit = 5;

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
  const limit = 5;

  try {
    const q = await pool.query(
      `
      WITH p AS (
        SELECT
          CASE
            WHEN ((played_at AT TIME ZONE $2)::time < time '05:00')
              THEN ((played_at AT TIME ZONE $2)::date - 1)
            ELSE (played_at AT TIME ZONE $2)::date
          END AS night_day
        FROM plays
        WHERE played_at >= NOW() - ($1 || ' days')::interval
      )
      SELECT night_day AS day, COUNT(*)::int AS plays
      FROM p
      GROUP BY night_day
      ORDER BY night_day DESC
      LIMIT ${limit}
      `,
      [days, TZ_CHILE]
    );

    res.json({ ok: true, days, limit, rows: q.rows });
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
// Historial / noche
// =======================
function isValidISODateOnly(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));
}

app.get("/api/admin/stats/by-day-one", requireAdmin, async (req, res) => {
  const date = isValidISODateOnly(req.query.date) ? String(req.query.date) : null;
  if (!date) {
    return res.status(400).json({ ok: false, error: "date inválido (YYYY-MM-DD)" });
  }

  try {
    const q = await pool.query(
      `
      WITH p AS (
        SELECT
          CASE
            WHEN ((played_at AT TIME ZONE $2)::time < time '05:00')
              THEN ((played_at AT TIME ZONE $2)::date - 1)
            ELSE (played_at AT TIME ZONE $2)::date
          END AS night_day
        FROM plays
      )
      SELECT COUNT(*)::int AS plays
      FROM p
      WHERE night_day = ($1)::date
      `,
      [date, TZ_CHILE]
    );

    return res.json({ ok: true, date, plays: q.rows?.[0]?.plays ?? 0 });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

function getChileNightDateKey() {
  const nowMin = getChileMinutesNow();
  const dateKey = getChileDateKey();
  if (nowMin < 5 * 60) {
    const [yy, mm, dd] = dateKey.split("-").map((x) => Number(x));
    const utc = new Date(Date.UTC(yy, mm - 1, dd, 12, 0, 0));
    utc.setUTCDate(utc.getUTCDate() - 1);
    const y = utc.getUTCFullYear();
    const m = String(utc.getUTCMonth() + 1).padStart(2, "0");
    const d = String(utc.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return dateKey;
}

app.get("/api/admin/history", requireAdmin, async (req, res) => {
  const piso = Number(req.query.floor);
  if (![1, 2, 3].includes(piso)) {
    return res.status(400).json({ ok: false, error: "floor inválido" });
  }

  const date = isValidISODateOnly(req.query.date)
    ? String(req.query.date)
    : getChileNightDateKey();

  try {
    const q = await pool.query(
      `
      WITH win AS (
        SELECT
          (((($2)::date) + time '19:00') AT TIME ZONE $3) AS start_ts,
          (((($2)::date + 1) + time '05:00') AT TIME ZONE $3) AS end_ts
      )
      SELECT
        id,
        piso,
        table_no,
        name,
        artist,
        song,
        requested_at,
        played_at,
        GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (played_at - requested_at)) / 60))::int AS wait_min
      FROM plays, win
      WHERE piso = $1
        AND requested_at >= win.start_ts
        AND requested_at < win.end_ts
      ORDER BY requested_at ASC, id ASC
      `,
      [piso, date, TZ_CHILE]
    );

    return res.json({
      ok: true,
      floor: piso,
      date,
      window: { startHHMM: "19:00", endHHMM: "05:00", tz: TZ_CHILE },
      rows: q.rows,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// =======================
// Top cantantes noche / ruleta
// =======================
app.get("/api/admin/stats/top-singers-night", requireAdmin, async (req, res) => {
  const floor = Number(req.query.floor);
  if (![1, 2, 3].includes(floor)) {
    return res.status(400).json({ ok: false, error: "floor inválido (1, 2 o 3)" });
  }

  const date = isValidISODateOnly(req.query.date)
    ? String(req.query.date)
    : getChileNightDateKey();

  const minRaw = Number(req.query.min ?? 2);
  const min =
    Number.isFinite(minRaw) && minRaw >= 1 && minRaw <= 50 ? Math.floor(minRaw) : 2;

  try {
    const q = await pool.query(
      `
      WITH win AS (
        SELECT
          (((($2)::date) + time '19:00') AT TIME ZONE $3) AS start_ts,
          (((($2)::date + 1) + time '05:00') AT TIME ZONE $3) AS end_ts
      )
      SELECT
        p.name,
        p.table_no::text AS table_no,
        COUNT(*)::int AS plays
      FROM plays p, win
      WHERE p.piso = $1
        AND p.played_at >= win.start_ts
        AND p.played_at < win.end_ts
        AND NOT EXISTS (
          SELECT 1
          FROM raffle_winners rw
          WHERE rw.floor = $1
            AND rw.night_day = $2::date
            AND rw.name_key = lower(trim(p.name))
            AND COALESCE(lower(trim(rw.table_no::text)), '') = COALESCE(lower(trim(p.table_no::text)), '')
        )
      GROUP BY p.name, p.table_no::text
      HAVING COUNT(*) >= $4
      ORDER BY plays DESC, p.name ASC, p.table_no::text ASC
      LIMIT 200
      `,
      [floor, date, TZ_CHILE, min]
    );

    return res.json({
      ok: true,
      floor,
      date,
      min,
      window: { startHHMM: "19:00", endHHMM: "05:00", tz: TZ_CHILE },
      rows: q.rows,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// =======================
// Raffle winners
// =======================
function normalizeNameKey(x) {
  return String(x ?? "").trim().toLowerCase().replace(/\s+/g, " ").trim();
}

app.get("/api/admin/raffle/winners", requireAdmin, async (req, res) => {
  const floor = Number(req.query.floor);
  if (![1, 2, 3].includes(floor)) {
    return res.status(400).json({ ok: false, error: "floor inválido (1, 2 o 3)" });
  }

  const date = isValidISODateOnly(req.query.date)
    ? String(req.query.date)
    : getChileNightDateKey();

  try {
    const q = await pool.query(
      `
      SELECT id, floor, night_day, name, table_no, plays, created_at
      FROM raffle_winners
      WHERE floor = $1 AND night_day = $2::date
      ORDER BY created_at DESC, id DESC
      LIMIT 50
      `,
      [floor, date]
    );

    return res.json({ ok: true, floor, date, rows: q.rows });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

app.post("/api/admin/raffle/winners", requireAdmin, async (req, res) => {
  const floor = Number(req.body?.floor);
  if (![1, 2, 3].includes(floor)) {
    return res.status(400).json({ ok: false, error: "floor inválido (1, 2 o 3)" });
  }

  const date = isValidISODateOnly(req.body?.date)
    ? String(req.body.date)
    : getChileNightDateKey();

  const name = String(req.body?.name ?? "").trim();
  if (!name || name.length > 80) {
    return res.status(400).json({ ok: false, error: "name inválido" });
  }

  const table_no = String(req.body?.table ?? "").trim() || null;

  const playsRaw = Number(req.body?.plays ?? 0);
  const plays =
    Number.isFinite(playsRaw) && playsRaw >= 0 ? Math.floor(playsRaw) : 0;

  const name_key = normalizeNameKey(name);

  try {
    const ins = await pool.query(
      `
      INSERT INTO raffle_winners (floor, night_day, name, name_key, table_no, plays)
      VALUES ($1, $2::date, $3, $4, $5, $6)
      RETURNING id, floor, night_day, name, table_no, plays, created_at
      `,
      [floor, date, name, name_key, table_no, plays]
    );

    emitRaffleUpdate(floor);

    return res.json({ ok: true, winner: ins.rows[0] });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
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
    socket.emit("requests3:update", await getRequestsPiso3());
  } catch {
    socket.emit("requests:update", []);
    socket.emit("requests2:update", []);
    socket.emit("requests3:update", []);
  }
});

// =======================
// Start
// =======================
const PORT = process.env.PORT || 3000;

(async () => {
  await ensureProjectTables().catch(() => {});
  await loadOrdersStatus();

  await ensureRaffleWinnersTable().catch(() => {});
  await autoCloseIfNeeded().catch(() => {});
  await autoResetIfNeeded().catch(() => {});

  server.listen(PORT, "0.0.0.0", async () => {
    console.log(`🚀 http://localhost:${PORT}`);
    console.log(`DJ1:    http://localhost:${PORT}/dj`);
    console.log(`Piso1 (Clientes): http://localhost:${PORT}/piso1`);
    console.log(`DJ2:    http://localhost:${PORT}/dj2`);
    console.log(`Piso2 (Clientes): http://localhost:${PORT}/piso2`);
    console.log(`DJ3:    http://localhost:${PORT}/dj3`);
    console.log(`Piso3 (Clientes): http://localhost:${PORT}/piso3`);
    console.log(`Admin:  http://localhost:${PORT}/admin`);
    console.log("DATABASE_URL cargada:", !!process.env.DATABASE_URL);
    console.log("🟢 ordersOpen inicial (DB):", ordersOpen);

    emitOrdersStatus();
    await emitRequests();
  });
})();