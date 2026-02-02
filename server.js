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

// ✅ Evita que un corte de Railway “asuste” o tumbe el server
pool.on("error", (err) => {
  console.log("⚠️ PG pool error (normal a veces en Railway):", err.message);
});

// ✅ Test DB (suave)
pool
  .query("SELECT 1 as ok")
  .then(() => console.log("✅ DB conectada"))
  .catch((e) =>
    console.log("⚠️ DB aún no responde (puede ser normal):", e.message)
  );

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
// Bloquear acceso directo a HTML sensibles (evita /admin.html, /dj.html, etc.)
// =======================
app.use((req, res, next) => {
  const blocked = new Set(["/dj.html", "/dj2.html", "/admin.html"]);
  if (!blocked.has(req.path)) return next();

  if (!req.session?.user) {
    return res.redirect("/login?next=" + encodeURIComponent(req.originalUrl));
  }

  // si está logueado, redirigimos a la ruta protegida correcta
  const map = {
    "/dj.html": "/dj",
    "/dj2.html": "/dj2",
    "/admin.html": "/admin",
  };
  return res.redirect(map[req.path] || "/");
});

// ✅ Static DESPUÉS de session (para que exista req.session en todo)
app.use(express.static("public", { index: false }));


// =======================
// Middleware auth
// =======================
function requireLogin(req, res, next) {
  if (req.session?.user) return next();
  return res.redirect("/login?next=" + encodeURIComponent(req.originalUrl));
}

function requireDjRoute(route) {
  return (req, res, next) => {
    if (!req.session?.user) {
      return res.redirect("/login?next=" + encodeURIComponent(req.originalUrl));
    }
    // si está logueado pero no le corresponde esa vista, lo mandamos a la suya
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
// Estado en memoria (por ahora)
// =======================
let requests = [];
let lastId = 0;

let requests2 = [];
let lastId2 = 0;

// =======================
// Estado pedidos (Admin)
// =======================
let ordersOpen = {
  piso1: true,
  piso2: true,
};

function emitOrdersStatus() {
  io.emit("orders:status", ordersOpen);
}

// Endpoint público para consultar estado (clientes/DJs)
app.get("/api/orders-status", (req, res) => {
  res.json({ ok: true, ordersOpen });
});

// Endpoint Admin para abrir/cerrar por piso
app.post("/api/admin/orders", requireAdmin, (req, res) => {
  const { piso1, piso2 } = req.body || {};

  if (typeof piso1 === "boolean") ordersOpen.piso1 = piso1;
  if (typeof piso2 === "boolean") ordersOpen.piso2 = piso2;

  emitOrdersStatus();
  return res.json({ ok: true, ordersOpen });
});

// =======================
// Rutas páginas
// =======================
app.get("/", (req, res) => {
  // si ya está logueado, lo mandamos a su DJ correspondiente
  if (req.session?.user?.dj_route) {
    return res.redirect(req.session.user.dj_route);
  }

  // si NO está logueado → login
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

// ✅ protegidos por DJ route
app.get("/dj", requireDjRoute("/dj"), (req, res) =>
  res.sendFile(process.cwd() + "/public/dj.html")
);

app.get("/dj2", requireDjRoute("/dj2"), (req, res) =>
  res.sendFile(process.cwd() + "/public/dj2.html")
);

// ✅ Admin panel (nuevo)
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

  // ✅ guardamos dj_route en sesión
  req.session.user = {
    id: user.id,
    username: user.username,
    dj_route: user.dj_route, // "/dj" o "/dj2" o "/admin"
  };

  // ✅ siempre lo manda a su vista correcta
  return res.json({ ok: true, next: user.dj_route });
});

// ✅ Logout (opcional pero útil)
app.post("/auth/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// ⚠️ SOLO PARA SETUP INICIAL (crea DJs/ADMIN en la BD)
app.post("/auth/bootstrap", async (req, res) => {
  try {
    const { username, password, dj_route } = req.body;

    if (!username || !password || !dj_route) {
      return res
        .status(400)
        .json({ ok: false, error: "Faltan datos (username, password, dj_route)" });
    }
    if (!["/dj", "/dj2", "/admin"].includes(dj_route)) {
      return res
        .status(400)
        .json({ ok: false, error: "dj_route inválido (usa /dj, /dj2 o /admin)" });
    }

    const hash = await bcrypt.hash(password, 10);

    await pool.query(
      "INSERT INTO dj_users (username, password_hash, dj_route) VALUES ($1,$2,$3)",
      [username, hash, dj_route]
    );

    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

// =======================
// Horarios por piso (Servidor Chile)
// =======================
const TZ_CHILE = process.env.TZ_CHILE || "America/Santiago";

// Horarios "HH:MM" (puedes cambiarlos por .env para probar)
const CUTOFF_PISO1_HHMM = process.env.CUTOFF_PISO1 || "03:30"; // Piso 1
const CUTOFF_PISO2_HHMM = process.env.CUTOFF_PISO2 || "02:30"; // Piso 2

// Hora en la que "se reinicia" y vuelve a permitir (evita que quede cerrado todo el día)
const RESET_HHMM = process.env.RESET_HHMM || "12:00";

function hhmmToMinutes(hhmm) {
  const m = String(hhmm || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

const CUTOFF_PISO1_MIN = hhmmToMinutes(CUTOFF_PISO1_HHMM);
const CUTOFF_PISO2_MIN = hhmmToMinutes(CUTOFF_PISO2_HHMM);
const RESET_MIN = hhmmToMinutes(RESET_HHMM);

// Si algo está mal en env, ponemos defaults seguros
const cutoffPiso1 = CUTOFF_PISO1_MIN ?? 3 * 60 + 30; // 03:30
const cutoffPiso2 = CUTOFF_PISO2_MIN ?? 2 * 60 + 30; // 02:30
const resetMin = RESET_MIN ?? 12 * 60; // 12:00

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
  // Cerrado desde cutoff hasta reset (ej: 03:30 -> 12:00)
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

// Endpoint útil para testear desde el celu / navegador
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
// Requests Piso 1
// =======================
function validatePayload({ table, name, artist, song }) {
  if (!/^\d{1,3}$/.test(String(table ?? ""))) return "Mesa inválida";
  if (!name || name.length > 40) return "Nombre inválido";
  if (!artist || artist.length > 40) return "Artista inválido";
  if (!song || song.length > 40) return "Canción inválida";
  return null;
}

app.post("/api/requests", (req, res) => {
  // 1) bloqueo por horario
  const closedBySchedule = rejectIfClosedForFloor(1);
  if (closedBySchedule) return res.status(403).json(closedBySchedule);

  // 2) bloqueo por admin
  const closedByAdmin = rejectIfAdminClosed(1);
  if (closedByAdmin) return res.status(403).json(closedByAdmin);

  const error = validatePayload(req.body);
  if (error) return res.status(400).json({ ok: false, error });

  const item = {
    id: ++lastId,
    ...req.body,
    createdAt: new Date().toISOString(),
    status: "Pendiente",
  };

  requests.push(item);
  io.emit("requests:update", requests);
  res.json({ ok: true, item });
});

app.get("/api/requests", (req, res) => res.json({ ok: true, requests }));

app.delete("/api/requests/:id", (req, res) => {
  requests = requests.filter((r) => r.id !== Number(req.params.id));
  io.emit("requests:update", requests);
  res.json({ ok: true });
});

app.delete("/api/requests", (req, res) => {
  requests = [];
  io.emit("requests:update", requests);
  res.json({ ok: true });
});

// =======================
// Requests Piso 2
// =======================
app.post("/api/requests2", (req, res) => {
  // 1) bloqueo por horario
  const closedBySchedule = rejectIfClosedForFloor(2);
  if (closedBySchedule) return res.status(403).json(closedBySchedule);

  // 2) bloqueo por admin
  const closedByAdmin = rejectIfAdminClosed(2);
  if (closedByAdmin) return res.status(403).json(closedByAdmin);

  const error = validatePayload(req.body);
  if (error) return res.status(400).json({ ok: false, error });

  const item = {
    id: ++lastId2,
    ...req.body,
    createdAt: new Date().toISOString(),
    status: "Pendiente",
  };

  requests2.push(item);
  io.emit("requests2:update", requests2);
  res.json({ ok: true, item });
});

app.get("/api/requests2", (req, res) =>
  res.json({ ok: true, requests: requests2 })
);

app.delete("/api/requests2/:id", (req, res) => {
  requests2 = requests2.filter((r) => r.id !== Number(req.params.id));
  io.emit("requests2:update", requests2);
  res.json({ ok: true });
});

app.delete("/api/requests2", (req, res) => {
  requests2 = [];
  io.emit("requests2:update", requests2);
  res.json({ ok: true });
});

// =======================
// Socket
// =======================
io.on("connection", (socket) => {
  socket.emit("requests:update", requests);
  socket.emit("requests2:update", requests2);
  socket.emit("orders:status", ordersOpen);
});

// =======================
// Start
// =======================
const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 http://localhost:${PORT}`);
  console.log(`DJ1:    http://localhost:${PORT}/dj`);
  console.log(`Piso1 (Clientes): http://localhost:${PORT}/piso1`);
  console.log(`DJ2:    http://localhost:${PORT}/dj2`);
  console.log(`Piso2 (Clientes): http://localhost:${PORT}/piso2`);
  console.log(`Admin:  http://localhost:${PORT}/admin`);
  console.log("DATABASE_URL cargada:", !!process.env.DATABASE_URL);

  console.log("🟢 ordersOpen inicial:", ordersOpen);

  console.log("⏱️ Horarios (Chile):");
  console.log("   TZ_CHILE:", TZ_CHILE);
  console.log("   CUTOFF_PISO1:", CUTOFF_PISO1_HHMM);
  console.log("   CUTOFF_PISO2:", CUTOFF_PISO2_HHMM);
  console.log("   RESET_HHMM:", RESET_HHMM);
});
