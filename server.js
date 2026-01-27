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
pool.query("SELECT 1 as ok")
  .then(() => console.log("✅ DB conectada"))
  .catch((e) => console.log("⚠️ DB aún no responde (puede ser normal):", e.message));

// =======================
// App / Server
// =======================
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static("public", { index: false }));

// =======================
// Sessions (PostgreSQL)
// =======================
const PgSession = connectPgSimple(session);

app.use(session({
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
  }
}));

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
    dj_route: user.dj_route, // "/dj" o "/dj2"
  };

  // ✅ siempre lo manda al DJ correcto
  return res.json({ ok: true, next: user.dj_route });
});

// ✅ Logout (opcional pero útil)
app.post("/auth/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// ⚠️ SOLO PARA SETUP INICIAL (crea DJs en la BD)
app.post("/auth/bootstrap", async (req, res) => {
  try {
    const { username, password, dj_route } = req.body;

    if (!username || !password || !dj_route) {
      return res.status(400).json({ ok: false, error: "Faltan datos (username, password, dj_route)" });
    }
    if (!["/dj", "/dj2"].includes(dj_route)) {
      return res.status(400).json({ ok: false, error: "dj_route inválido (usa /dj o /dj2)" });
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

app.get("/api/requests", (req, res) =>
  res.json({ ok: true, requests })
);

app.delete("/api/requests/:id", (req, res) => {
  requests = requests.filter(r => r.id !== Number(req.params.id));
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
  requests2 = requests2.filter(r => r.id !== Number(req.params.id));
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
  console.log("DATABASE_URL cargada:", !!process.env.DATABASE_URL);
});
