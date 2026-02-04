// public/admin.js
const socket = io();

const connBadge = document.getElementById("connBadge");
const toast = document.getElementById("toast");

const count1 = document.getElementById("count1");
const count2 = document.getElementById("count2");

const toggle1 = document.getElementById("toggle1");
const toggle2 = document.getElementById("toggle2");

const dot1 = document.getElementById("dot1");
const dot2 = document.getElementById("dot2");

const label1 = document.getElementById("label1");
const label2 = document.getElementById("label2");

const logoutBtn = document.getElementById("logoutBtn");

// stats
const daysSelect = document.getElementById("daysSelect");
const refreshStatsBtn = document.getElementById("refreshStatsBtn");
const sumTotal = document.getElementById("sumTotal");
const sumP1 = document.getElementById("sumP1");
const sumP2 = document.getElementById("sumP2");
const byDayBox = document.getElementById("byDayBox");
const topSongsBox = document.getElementById("topSongsBox");
const topArtistsBox = document.getElementById("topArtistsBox");

function showToast(msg) {
  toast.textContent = msg || "";
}

let lastStatus = { piso1: true, piso2: true };
let saving = false;

/* =========================
   ESTADO PEDIDOS
========================= */
function applyStatus(st) {
  lastStatus = st || lastStatus;

  toggle1.checked = !!lastStatus.piso1;
  toggle2.checked = !!lastStatus.piso2;

  dot1.classList.remove("open", "closed");
  dot2.classList.remove("open", "closed");

  dot1.classList.add(lastStatus.piso1 ? "open" : "closed");
  dot2.classList.add(lastStatus.piso2 ? "open" : "closed");

  label1.textContent = lastStatus.piso1 ? "Abierto" : "Cerrado";
  label2.textContent = lastStatus.piso2 ? "Abierto" : "Cerrado";
}

async function saveStatus() {
  if (saving) return;
  saving = true;

  connBadge.textContent = "Guardando…";
  showToast("");

  try {
    const res = await fetch("/api/admin/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        piso1: !!toggle1.checked,
        piso2: !!toggle2.checked,
      }),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok || !data?.ok) {
      connBadge.textContent = "Error";
      showToast(data?.error || "No se pudo guardar.");
      applyStatus(lastStatus);
      return;
    }

    connBadge.textContent = "Guardado";
    applyStatus(data.ordersOpen);
  } catch {
    connBadge.textContent = "Error";
    showToast("Error de conexión.");
    applyStatus(lastStatus);
  } finally {
    saving = false;
    setTimeout(() => {
      if (connBadge.textContent === "Guardado") {
        connBadge.textContent = "En vivo";
      }
    }, 700);
  }
}

// contadores en vivo
socket.on("requests:update", (reqs) => {
  count1.textContent = reqs?.length ?? 0;
});
socket.on("requests2:update", (reqs) => {
  count2.textContent = reqs?.length ?? 0;
});

// estado pedidos
socket.on("orders:status", (st) => {
  applyStatus(st);
  connBadge.textContent = "En vivo";
});

socket.on("connect", () => (connBadge.textContent = "En vivo"));
socket.on("disconnect", () => (connBadge.textContent = "Desconectado"));

toggle1.addEventListener("change", saveStatus);
toggle2.addEventListener("change", saveStatus);

// logout
logoutBtn.addEventListener("click", async () => {
  try {
    await fetch("/auth/logout", { method: "POST" });
  } catch {}
  location.href = "/login";
});

// estado inicial
(async function bootstrapStatus() {
  try {
    const res = await fetch("/api/orders-status");
    const data = await res.json();
    if (data?.ok && data.ordersOpen) applyStatus(data.ordersOpen);
  } catch {}
})();

/* =========================
   STATS
========================= */

// 👉 formateador bonito: "03 feb 2026"
function formatDatePretty(value) {
  if (!value) return "";
  const d = new Date(value);
  return d.toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function asTable(rows, columns) {
  if (!rows || rows.length === 0) {
    return `<div class="muted">Sin datos.</div>`;
  }

  const head = `
    <tr>
      ${columns.map((c) => `<th>${c.label}</th>`).join("")}
    </tr>
  `;

  const body = rows
    .map((r) => {
      return `
        <tr>
          ${columns
            .map((c) => {
              let value = r[c.key];

              // 🔥 AQUÍ está el arreglo de la fecha
              if (c.key === "day") {
                value = formatDatePretty(value);
              }

              const cls = c.right ? ' class="right"' : "";
              return `<td${cls}>${escapeHtml(value)}</td>`;
            })
            .join("")}
        </tr>
      `;
    })
    .join("");

  return `<table class="tablelist">
    <thead>${head}</thead>
    <tbody>${body}</tbody>
  </table>`;
}

async function loadStats() {
  const days = Number(daysSelect.value || 30);
  showToast("");

  try {
    const [sumR, dayR, songsR, artistsR] = await Promise.all([
      fetch(`/api/admin/stats/summary?days=${days}`).then((r) => r.json()),
      fetch(`/api/admin/stats/by-day?days=${days}`).then((r) => r.json()),
      fetch(`/api/admin/stats/top-songs?days=${days}`).then((r) => r.json()),
      fetch(`/api/admin/stats/top-artists?days=${days}`).then((r) => r.json()),
    ]);

    if (!sumR?.ok) throw new Error(sumR?.error || "Error cargando stats");

    sumTotal.textContent = sumR.total ?? 0;
    sumP1.textContent = sumR.piso1 ?? 0;
    sumP2.textContent = sumR.piso2 ?? 0;

    byDayBox.innerHTML = asTable(dayR?.rows || [], [
      { key: "day", label: "Día" },
      { key: "plays", label: "Reproducidas", right: true },
    ]);

    topSongsBox.innerHTML = asTable(songsR?.rows || [], [
      { key: "song", label: "Canción" },
      { key: "artist", label: "Artista" },
      { key: "plays", label: "Veces", right: true },
    ]);

    topArtistsBox.innerHTML = asTable(artistsR?.rows || [], [
      { key: "artist", label: "Artista" },
      { key: "plays", label: "Veces", right: true },
    ]);
  } catch (e) {
    showToast(e.message || "Error cargando estadísticas");
  }
}

refreshStatsBtn.addEventListener("click", loadStats);
daysSelect.addEventListener("change", loadStats);
loadStats();

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
