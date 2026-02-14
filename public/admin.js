const socket = io();

const connBadge = document.getElementById("connBadge");
const logoutBtn = document.getElementById("logoutBtn");

const toggle1 = document.getElementById("toggle1");
const toggle2 = document.getElementById("toggle2");
const dot1 = document.getElementById("dot1");
const dot2 = document.getElementById("dot2");
const label1 = document.getElementById("label1");
const label2 = document.getElementById("label2");
const count1 = document.getElementById("count1");
const count2 = document.getElementById("count2");

const daysSelect = document.getElementById("daysSelect");
const refreshStatsBtn = document.getElementById("refreshStatsBtn");

const byDayBody = document.getElementById("byDayBody");
const topSongsBody = document.getElementById("topSongsBody");

/* ✅ Resumen diario -> botón calendario */
const dayPickBtn = document.getElementById("dayPickBtn");
const dayPick = document.getElementById("dayPick");
const dayPickResult = document.getElementById("dayPickResult");

// Modal historial
const histBtn1 = document.getElementById("histBtn1");
const histBtn2 = document.getElementById("histBtn2");
const histOverlay = document.getElementById("histOverlay");
const histModal = document.getElementById("histModal");
const histTitle = document.getElementById("histTitle");
const histSub = document.getElementById("histSub");

// ✅ CAMBIO: histWindow puede ser null (seguro)
const histWindow = document.getElementById("histWindow"); // puede ser null

const histDate = document.getElementById("histDate");
const histLoadBtn = document.getElementById("histLoadBtn");
const histCloseBtn = document.getElementById("histCloseBtn");
const histStatus = document.getElementById("histStatus");
const histBody = document.getElementById("histBody");

const sumPlayed = document.getElementById("sumPlayed");
const sumTables = document.getElementById("sumTables");
const sumAvg = document.getElementById("sumAvg");
const sumMax = document.getElementById("sumMax");

let lastStatus = { piso1: true, piso2: true };
let activeFloor = null;

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function setTbodyEmpty(tbody, cols, msg) {
  tbody.innerHTML = `<tr><td colspan="${cols}" class="muted">${esc(msg)}</td></tr>`;
}

function fmtTimeCL(dt) {
  if (!dt) return "—";
  try {
    const d = new Date(dt);
    return d.toLocaleTimeString("es-CL", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return "—";
  }
}

function fmtDateCL(isoDateOnly) {
  try {
    const d = new Date(isoDateOnly + "T12:00:00");
    return d.toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return isoDateOnly;
  }
}

function fmtWait(min) {
  const n = Number(min);
  if (!Number.isFinite(n) || n < 0) return "—";
  if (n < 60) return `${n} min`;
  const h = Math.floor(n / 60);
  const m = n % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

function applyStatus(st) {
  lastStatus = st;

  toggle1.checked = !!st.piso1;
  label1.textContent = st.piso1 ? "Abierto" : "Cerrado";
  dot1.classList.toggle("open", !!st.piso1);
  dot1.classList.toggle("closed", !st.piso1);

  toggle2.checked = !!st.piso2;
  label2.textContent = st.piso2 ? "Abierto" : "Cerrado";
  dot2.classList.toggle("open", !!st.piso2);
  dot2.classList.toggle("closed", !st.piso2);
}

async function saveStatusPatch(patch) {
  const prev = { ...lastStatus };
  const next = { ...lastStatus, ...patch };
  applyStatus(next);

  try {
    const r = await fetch("/api/admin/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || "Error");
    applyStatus(j.ordersOpen);
  } catch (e) {
    applyStatus(prev);
    alert("No se pudo guardar: " + (e.message || e));
  }
}

// ===== Socket =====
socket.on("connect", () => {
  connBadge.textContent = "En vivo";
  connBadge.className = "badge ok";
});
socket.on("disconnect", () => {
  connBadge.textContent = "Desconectado";
  connBadge.className = "badge warn";
});

socket.on("orders:status", (st) => applyStatus(st));

socket.on("requests:update", (rows) => {
  count1.textContent = Array.isArray(rows) ? rows.length : 0;
});
socket.on("requests2:update", (rows) => {
  count2.textContent = Array.isArray(rows) ? rows.length : 0;
});

// ===== Toggle =====
toggle1.addEventListener("change", () => saveStatusPatch({ piso1: toggle1.checked }));
toggle2.addEventListener("change", () => saveStatusPatch({ piso2: toggle2.checked }));

// ===== Logout =====
logoutBtn?.addEventListener("click", async () => {
  try { await fetch("/auth/logout", { method: "POST" }); } catch {}
  location.href = "/login";
});

// ===== Stats =====
function parseNum(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

async function loadStats() {
  const days = Number(daysSelect.value || 30);

  // by day (server ya limita a 5)
  try {
    const r = await fetch(`/api/admin/stats/by-day?days=${days}`);
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || "Error");

    if (!j.rows?.length) {
      setTbodyEmpty(byDayBody, 2, "Sin datos");
    } else {
      byDayBody.innerHTML = j.rows.map((x, idx) => {
        const dayISO = String(x.day).slice(0,10);
        const day = x.day ? fmtDateCL(dayISO) : "—";
        const cls = idx === 0 ? "byday-main" : "byday-small"; // ✅ primera fila grande
        return `<tr class="${cls}"><td>${esc(day)}</td><td class="right">${esc(x.plays)}</td></tr>`;
      }).join("");
    }
  } catch {
    setTbodyEmpty(byDayBody, 2, "Error cargando");
  }

  // top songs
  try {
    const r = await fetch(`/api/admin/stats/top-songs?days=${days}`);
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || "Error");
    if (!j.rows?.length) setTbodyEmpty(topSongsBody, 3, "Sin datos");
    else {
      topSongsBody.innerHTML = j.rows.map(x => `
        <tr>
          <td>${esc(x.song)}</td>
          <td>${esc(x.artist)}</td>
          <td class="right">${esc(x.plays)}</td>
        </tr>
      `).join("");
    }
  } catch {
    setTbodyEmpty(topSongsBody, 3, "Error cargando");
  }
}

refreshStatsBtn.addEventListener("click", loadStats);
daysSelect.addEventListener("change", loadStats);

/* ===========================
   ✅ botón "Ver día"
   =========================== */
function openDatePicker(input) {
  if (!input) return;
  if (typeof input.showPicker === "function") input.showPicker();
  else input.click();
}

// oculta el texto por defecto (para que no empuje la tabla)
if (dayPickResult) {
  dayPickResult.textContent = "";
  dayPickResult.style.display = "none";
}

dayPickBtn?.addEventListener("click", () => openDatePicker(dayPick));

dayPick?.addEventListener("change", async () => {
  const date = dayPick.value; // YYYY-MM-DD
  if (!date) return;

  if (dayPickResult) {
    dayPickResult.style.display = "block";
    dayPickResult.textContent = "Cargando…";
  }

  try {
    const r = await fetch(`/api/admin/stats/by-day-one?date=${encodeURIComponent(date)}`);
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || "Error");

    if (dayPickResult) {
      dayPickResult.textContent = `📅 ${fmtDateCL(date)} → ${j.plays} reproducidas`;
    }
  } catch (e) {
    if (dayPickResult) dayPickResult.textContent = "Error cargando día";
  }
});

// ===== Modal helpers =====
function openModal(floor) {
  activeFloor = floor;

  histTitle.textContent = floor === 1 ? "Historial DJ 1" : "Historial DJ 2";

  const t = new Date();
  const yyyy = t.getFullYear();
  const mm = String(t.getMonth() + 1).padStart(2, "0");
  const dd = String(t.getDate()).padStart(2, "0");
  if (!histDate.value) histDate.value = `${yyyy}-${mm}-${dd}`;

  histOverlay.classList.add("open");
  histModal.classList.add("open");

  loadHistory();
}

function closeModal() {
  histOverlay.classList.remove("open");
  histModal.classList.remove("open");
  activeFloor = null;
}

histOverlay.addEventListener("click", closeModal);
histCloseBtn.addEventListener("click", closeModal);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && histModal.classList.contains("open")) closeModal();
});

histBtn1.addEventListener("click", () => openModal(1));
histBtn2.addEventListener("click", () => openModal(2));
histLoadBtn.addEventListener("click", loadHistory);

function computeSummary(rows) {
  const total = rows.length;
  const tablesMap = new Map();

  let sumWait = 0;
  let maxWait = 0;

  for (const r of rows) {
    const t = String(r.table_no ?? "—");
    const w = parseNum(r.wait_min);
    sumWait += w;
    if (w > maxWait) maxWait = w;

    const cur = tablesMap.get(t) || { table: t, count: 0, max: 0, sum: 0 };
    cur.count += 1;
    cur.sum += w;
    cur.max = Math.max(cur.max, w);
    tablesMap.set(t, cur);
  }

  const tables = tablesMap.size;
  const avg = total ? Math.round(sumWait / total) : 0;

  return { total, tables, avg, max: maxWait };
}

async function loadHistory() {
  if (!activeFloor) return;

  const date = histDate.value;
  histStatus.textContent = "Cargando…";
  setTbodyEmpty(histBody, 5, "Cargando…");

  try {
    const r = await fetch(`/api/admin/history?floor=${activeFloor}&date=${encodeURIComponent(date)}`);
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || "Error");

    histSub.textContent = `${fmtDateCL(j.date)}`;
    histWindow?.textContent && (histWindow.textContent = `${j.window.startHHMM} → ${j.window.endHHMM}`);

    const rows = j.rows || [];
    if (!rows.length) {
      histStatus.textContent = "Sin solicitudes reproducidas en este rango.";
      sumPlayed.textContent = "0";
      sumTables.textContent = "0";
      sumAvg.textContent = "—";
      sumMax.textContent = "—";
      setTbodyEmpty(histBody, 5, "Sin datos");
      return;
    }

    const s = computeSummary(rows);
    sumPlayed.textContent = String(s.total);
    sumTables.textContent = String(s.tables);
    sumAvg.textContent = fmtWait(s.avg);
    sumMax.textContent = fmtWait(s.max);

    histStatus.textContent = "";

    histBody.innerHTML = rows.map(x => {
      const mesa = `Mesa ${x.table_no ?? "—"}`;
      const who = x.name ? `<div class="who">${esc(x.name)}</div>` : "";
      const song = `<div class="song">${esc(x.song || "—")}</div>`;
      const artist = x.artist ? `<div class="muted2">${esc(x.artist)}</div>` : `<div class="muted2">—</div>`;

      const reqT = fmtTimeCL(x.requested_at);
      const playT = fmtTimeCL(x.played_at);
      const wait = fmtWait(x.wait_min);

      return `<tr>
        <td><span class="tag">${esc(mesa)}</span></td>
        <td>${who}${song}${artist}</td>
        <td><span class="mono">${esc(reqT)}</span></td>
        <td><span class="mono">${esc(playT)}</span></td>
        <td class="right"><b>${esc(wait)}</b></td>
      </tr>`;
    }).join("");

  } catch (e) {
    histStatus.textContent = "Error cargando historial: " + (e.message || e);
    sumPlayed.textContent = "—";
    sumTables.textContent = "—";
    sumAvg.textContent = "—";
    sumMax.textContent = "—";
    setTbodyEmpty(histBody, 5, "Error cargando");
  }
}

// ===== bootstrap =====
(async function boot() {
  try {
    const r = await fetch("/api/orders-status");
    const j = await r.json();
    if (j.ok) applyStatus(j.ordersOpen);
  } catch {}

  loadStats();
})();


