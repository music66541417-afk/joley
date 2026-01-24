// server.js
import express from "express";
import http from "http";
import { Server } from "socket.io";

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static("public"));

// =======================
// Cola piso 1 (DJ)
// =======================
let requests = [];
let lastId = 0;

// =======================
// Cola piso 2 (DJ2)
// =======================
let requests2 = [];
let lastId2 = 0;

// Rutas páginas
app.get("/", (req, res) => res.sendFile(process.cwd() + "/public/index.html"));
app.get("/piso1", (req, res) => res.sendFile(process.cwd() + "/public/index.html"));
app.get("/dj", (req, res) => res.sendFile(process.cwd() + "/public/dj.html"));

// ✅ Nuevo DJ2 (2do piso)
app.get("/dj2", (req, res) => res.sendFile(process.cwd() + "/public/dj2.html"));
app.get("/piso2", (req, res) => res.sendFile(process.cwd() + "/public/arriba.html"));


function validatePayload({ table, name, artist, song }) {
  // Mesa: 1-999 (máx 3 cifras, solo números)
  if (!/^\d{1,3}$/.test(String(table ?? ""))) return "Mesa inválida (solo números, máx 3 cifras).";
  const t = Number(table);
  if (t < 1 || t > 999) return "Mesa inválida (1 a 999).";

  // Límites anti-spam
  if (typeof name !== "string" || name.trim().length < 1) return "Nombre requerido.";
  if (name.trim().length > 25) return "Nombre excede 25 caracteres.";

  if (typeof artist !== "string" || artist.trim().length < 1) return "Artista requerido.";
  if (artist.trim().length > 25) return "Artista excede 25 caracteres.";

  if (typeof song !== "string" || song.trim().length < 1) return "Canción/tema requerido.";
  if (song.trim().length > 25) return "Canción excede 25 caracteres.";

  return null;
}

/* =========================================================
   API PISO 1  (/api/requests)  -> DJ en /dj
   ========================================================= */

// ✅ Crear solicitud (piso 1)
app.post("/api/requests", (req, res) => {
  const error = validatePayload(req.body);
  if (error) return res.status(400).json({ ok: false, error });

  const item = {
    id: ++lastId,
    table: String(req.body.table).trim(),
    name: req.body.name.trim(),
    artist: req.body.artist.trim(),
    song: req.body.song.trim(),
    createdAt: new Date().toISOString(),
    status: "Pendiente",
  };

  // Orden viejo → nuevo
  requests.push(item);

  io.emit("requests:update", requests);
  res.json({ ok: true, item });
});

// Listar solicitudes (piso 1)
app.get("/api/requests", (req, res) => {
  res.json({ ok: true, requests });
});

// ✅ Limpiar todo (piso 1)
app.delete("/api/requests", (req, res) => {
  requests = [];
  io.emit("requests:update", requests);
  res.json({ ok: true });
});

// Eliminar 1 solicitud (piso 1) (Reproducida)
app.delete("/api/requests/:id", (req, res) => {
  const id = Number(req.params.id);
  const before = requests.length;

  requests = requests.filter((r) => r.id !== id);

  if (requests.length === before) {
    return res.status(404).json({ ok: false, error: "No encontrada." });
  }

  io.emit("requests:update", requests);
  res.json({ ok: true });
});

/* =========================================================
   API PISO 2  (/api/requests2) -> DJ en /dj2
   ========================================================= */

// ✅ Crear solicitud (piso 2)
app.post("/api/requests2", (req, res) => {
  const error = validatePayload(req.body);
  if (error) return res.status(400).json({ ok: false, error });

  const item = {
    id: ++lastId2,
    table: String(req.body.table).trim(),
    name: req.body.name.trim(),
    artist: req.body.artist.trim(),
    song: req.body.song.trim(),
    createdAt: new Date().toISOString(),
    status: "Pendiente",
  };

  // Orden viejo → nuevo
  requests2.push(item);

  io.emit("requests2:update", requests2);
  res.json({ ok: true, item });
});

// Listar solicitudes (piso 2)
app.get("/api/requests2", (req, res) => {
  res.json({ ok: true, requests: requests2 });
});

// ✅ Limpiar todo (piso 2)
app.delete("/api/requests2", (req, res) => {
  requests2 = [];
  io.emit("requests2:update", requests2);
  res.json({ ok: true });
});

// Eliminar 1 solicitud (piso 2) (Reproducida)
app.delete("/api/requests2/:id", (req, res) => {
  const id = Number(req.params.id);
  const before = requests2.length;

  requests2 = requests2.filter((r) => r.id !== id);

  if (requests2.length === before) {
    return res.status(404).json({ ok: false, error: "No encontrada." });
  }

  io.emit("requests2:update", requests2);
  res.json({ ok: true });
});

// Socket: al conectar, entregar estado actual de ambos pisos
io.on("connection", (socket) => {
  socket.emit("requests:update", requests);
  socket.emit("requests2:update", requests2);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor listo en http://localhost:${PORT}`);
  console.log(`Usuario: http://localhost:${PORT}/`);
  console.log(`DJ:     http://localhost:${PORT}/dj`);
  console.log(`DJ2:    http://localhost:${PORT}/dj2`);
});
