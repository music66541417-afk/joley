const socket = io();

/* ===========================
   ELEMENTOS GENERALES
=========================== */
const connBadge = document.getElementById("connBadge");
const adminConnectionDot = document.getElementById("adminConnectionDot");
const logoutBtn = document.getElementById("logoutBtn");

const navItems = document.querySelectorAll(".admin-nav-item");
const adminSections = document.querySelectorAll(".admin-section");
const adminPageTitle = document.getElementById("adminPageTitle");
const adminPageDescription = document.getElementById("adminPageDescription");

/* ===========================
   PISOS
=========================== */
const toggle1 = document.getElementById("toggle1");
const toggle2 = document.getElementById("toggle2");
const toggle3 = document.getElementById("toggle3");

const dot1 = document.getElementById("dot1");
const dot2 = document.getElementById("dot2");
const dot3 = document.getElementById("dot3");

const label1 = document.getElementById("label1");
const label2 = document.getElementById("label2");
const label3 = document.getElementById("label3");

const count1 = document.getElementById("count1");
const count2 = document.getElementById("count2");
const count3 = document.getElementById("count3");

const floorCount1 = document.getElementById("floorCount1");
const floorCount2 = document.getElementById("floorCount2");

const floorDot1 = document.getElementById("floorDot1");
const floorDot2 = document.getElementById("floorDot2");

const floorLabel1 = document.getElementById("floorLabel1");
const floorLabel2 = document.getElementById("floorLabel2");

/* ===========================
   ESTADÍSTICAS
=========================== */
const daysSelect = document.getElementById("daysSelect");
const refreshStatsBtn = document.getElementById("refreshStatsBtn");

const topSongsBody = document.getElementById("topSongsBody");
const byDayBody = document.getElementById("byDayBody");

const dayPickBtn = document.getElementById("dayPickBtn");
const dayPick = document.getElementById("dayPick");
const dayPickResult = document.getElementById("dayPickResult");

/* ===========================
   HISTORIAL
=========================== */
const histBtn1 = document.getElementById("histBtn1");
const histBtn2 = document.getElementById("histBtn2");
const histBtn3 = document.getElementById("histBtn3");

const histOverlay = document.getElementById("histOverlay");
const histModal = document.getElementById("histModal");
const histCloseBtn = document.getElementById("histCloseBtn");

const histTitle = document.getElementById("histTitle");
const histSub = document.getElementById("histSub");
const histDate = document.getElementById("histDate");
const histLoadBtn = document.getElementById("histLoadBtn");

const histStatus = document.getElementById("histStatus");
const histBody = document.getElementById("histBody");

const sumPlayed = document.getElementById("sumPlayed");
const sumTables = document.getElementById("sumTables");
const sumAvg = document.getElementById("sumAvg");
const sumMax = document.getElementById("sumMax");

/* ===========================
   RULETA
=========================== */
const raffleBtn1 = document.getElementById("raffleBtn1");
const raffleBtn2 = document.getElementById("raffleBtn2");
const raffleBtn3 = document.getElementById("raffleBtn3");

const raffleOverlay = document.getElementById("raffleOverlay");
const raffleModal = document.getElementById("raffleModal");
const raffleCloseBtn = document.getElementById("raffleCloseBtn");

const raffleDate = document.getElementById("raffleDate");
const raffleSpinBtn = document.getElementById("raffleSpinBtn");
const raffleStatus = document.getElementById("raffleStatus");

const participantsBody = document.getElementById("participantsBody");
const winnersBody = document.getElementById("winnersBody");
const wheelCanvas = document.getElementById("wheelCanvas");

/* ===========================
   OPINIONES
=========================== */
const suggestionDate = document.getElementById("suggestionDate");
const suggestionList = document.getElementById("suggestionList");
const suggestionStatusText = document.getElementById("suggestionStatusText");
const suggestionWindowText = document.getElementById("suggestionWindowText");

const suggestionTotalCount = document.getElementById("suggestionTotalCount");
const suggestionFloor1Count = document.getElementById("suggestionFloor1Count");
const suggestionFloor2Count = document.getElementById("suggestionFloor2Count");
const suggestionPendingCount = document.getElementById("suggestionPendingCount");

const suggestionPendingBadge = document.getElementById("suggestionPendingBadge");
const summaryPendingSuggestions = document.getElementById("summaryPendingSuggestions");
const summarySuggestionsCard = document.getElementById("summarySuggestionsCard");

const suggestionFloorButtons = document.querySelectorAll("[data-suggestion-floor]");
const suggestionStatusButtons = document.querySelectorAll("[data-suggestion-status]");

let suggestionFloorFilter = "all";
let suggestionStatusFilter = "all";
let activeFloor = null;

/* ===========================
   HELPERS
=========================== */
function esc(s) {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (m) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      }[m])
  );
}

function setTbodyEmpty(tbody, cols, text = "Sin datos") {
  if (!tbody) return;

  tbody.innerHTML = `
    <tr>
      <td colspan="${cols}" style="text-align:center; opacity:.55; padding:24px;">
        ${esc(text)}
      </td>
    </tr>
  `;
}

function parseNum(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function serviceNightISO() {
  const now = new Date();

  if (now.getHours() < 5) {
    now.setDate(now.getDate() - 1);
  }

  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");

  return `${y}-${m}-${d}`;
}

function fmtDateCL(iso) {
  if (!iso) return "—";

  try {
    return new Date(`${String(iso).slice(0, 10)}T12:00:00`).toLocaleDateString(
      "es-CL",
      {
        day: "2-digit",
        month: "long",
        year: "numeric",
      }
    );
  } catch {
    return String(iso);
  }
}

function fmtTimeCL(isoLike) {
  if (!isoLike) return "—";

  try {
    const d = new Date(isoLike);

    return d.toLocaleTimeString("es-CL", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return "—";
  }
}

function fmtWait(min) {
  const n = Number(min) || 0;

  if (n < 60) return `${n} min`;

  const h = Math.floor(n / 60);
  const m = n % 60;

  return m ? `${h}h ${m}m` : `${h}h`;
}

/* ===========================
   NAVEGACIÓN ADMIN
=========================== */
const sectionInfo = {
  adminHomeSection: {
    title: "Resumen",
    description: "Estado general y actividad del sistema.",
  },

  adminFloorsSection: {
    title: "Control de pisos",
    description: "Administración de solicitudes de karaoke.",
  },

  adminStatsSection: {
    title: "Estadísticas",
    description: "Actividad y rendimiento registrado.",
  },

  adminSuggestionsSection: {
    title: "Opiniones y sugerencias",
    description: "Comentarios enviados por los clientes.",
  },
};

function showAdminSection(targetId) {
  adminSections.forEach((section) => {
    section.classList.toggle("active", section.id === targetId);
  });

  navItems.forEach((button) => {
    button.classList.toggle("active", button.dataset.target === targetId);
  });

  const info = sectionInfo[targetId];

  if (info) {
    if (adminPageTitle) adminPageTitle.textContent = info.title;
    if (adminPageDescription) adminPageDescription.textContent = info.description;
  }

  if (targetId === "adminSuggestionsSection") {
    loadSuggestions();
  }

  window.scrollTo({
    top: 0,
    behavior: "smooth",
  });
}

navItems.forEach((button) => {
  button.addEventListener("click", () => {
    const target = button.dataset.target;

    if (target) {
      showAdminSection(target);
    }
  });
});

summarySuggestionsCard?.addEventListener("click", () => {
  showAdminSection("adminSuggestionsSection");
});

/* ===========================
   ESTADO PISOS
=========================== */
function setDotStatus(dot, open) {
  if (!dot) return;

  dot.classList.toggle("open", !!open);
  dot.classList.toggle("closed", !open);
}

function applySwitchUI(toggle, dot, label, open) {
  if (toggle) toggle.checked = !!open;

  setDotStatus(dot, open);

  if (label) {
    label.textContent = open ? "Abierto" : "Cerrado";
  }
}

function applyStatus(st) {
  applySwitchUI(toggle1, dot1, label1, st?.piso1);
  applySwitchUI(toggle2, dot2, label2, st?.piso2);
  applySwitchUI(toggle3, dot3, label3, st?.piso3);

  setDotStatus(floorDot1, st?.piso1);
  setDotStatus(floorDot2, st?.piso2);

  if (floorLabel1) floorLabel1.textContent = st?.piso1 ? "Abierto" : "Cerrado";
  if (floorLabel2) floorLabel2.textContent = st?.piso2 ? "Abierto" : "Cerrado";
}

async function saveStatusPatch(patch) {
  try {
    const r = await fetch("/api/admin/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(patch),
    });

    const j = await r.json();

    if (!r.ok || !j.ok) {
      throw new Error(j.error || "No se pudo guardar");
    }

    applyStatus(j.ordersOpen);
  } catch (e) {
    alert(e.message || "Error guardando estado");

    try {
      const r2 = await fetch("/api/orders-status");
      const j2 = await r2.json();

      if (j2.ok) applyStatus(j2.ordersOpen);
    } catch {}
  }
}

/* ===========================
   TOGGLES
=========================== */
toggle1?.addEventListener("change", () => {
  saveStatusPatch({ piso1: toggle1.checked });
});

toggle2?.addEventListener("change", () => {
  saveStatusPatch({ piso2: toggle2.checked });
});

toggle3?.addEventListener("change", () => {
  saveStatusPatch({ piso3: toggle3.checked });
});

/* ===========================
   SOCKET
=========================== */
socket.on("connect", () => {
  if (connBadge) connBadge.textContent = "En vivo";

  if (adminConnectionDot) {
    adminConnectionDot.classList.add("online");
  }
});

socket.on("disconnect", () => {
  if (connBadge) connBadge.textContent = "Desconectado";

  if (adminConnectionDot) {
    adminConnectionDot.classList.remove("online");
  }
});

socket.on("orders:status", (st) => {
  applyStatus(st);
});

socket.on("requests:update", (rows) => {
  const total = Array.isArray(rows) ? rows.length : 0;

  if (count1) count1.textContent = total;
  if (floorCount1) floorCount1.textContent = total;
});

socket.on("requests2:update", (rows) => {
  const total = Array.isArray(rows) ? rows.length : 0;

  if (count2) count2.textContent = total;
  if (floorCount2) floorCount2.textContent = total;
});

socket.on("requests3:update", (rows) => {
  if (count3) {
    count3.textContent = Array.isArray(rows) ? rows.length : 0;
  }
});

socket.on("suggestions:update", () => {
  loadSuggestionPendingCount();

  const section = document.getElementById("adminSuggestionsSection");

  if (section?.classList.contains("active")) {
    loadSuggestions();
  }
});

/* ===========================
   LOGOUT
=========================== */
logoutBtn?.addEventListener("click", async () => {
  try {
    await fetch("/auth/logout", {
      method: "POST",
    });
  } catch {}

  location.href = "/login";
});

/* ===========================
   ESTADÍSTICAS
=========================== */
async function loadStats() {
  const days = Number(daysSelect?.value || 30);

  try {
    const r = await fetch(`/api/admin/stats/by-day?days=${days}`);
    const j = await r.json();

    if (!j.ok) throw new Error(j.error || "Error");

    if (!j.rows?.length) {
      setTbodyEmpty(byDayBody, 2, "Sin datos");
    } else {
      byDayBody.innerHTML = j.rows
        .map((x, idx) => {
          const dayISO = String(x.day).slice(0, 10);

          return `
            <tr class="${idx === 0 ? "admin-day-main" : ""}">
              <td>${esc(fmtDateCL(dayISO))}</td>
              <td class="right">${esc(x.plays)}</td>
            </tr>
          `;
        })
        .join("");
    }
  } catch {
    setTbodyEmpty(byDayBody, 2, "Error cargando");
  }

  try {
    const r = await fetch(`/api/admin/stats/top-songs?days=${days}`);
    const j = await r.json();

    if (!j.ok) throw new Error(j.error || "Error");

    if (!j.rows?.length) {
      setTbodyEmpty(topSongsBody, 3, "Sin datos");
    } else {
      topSongsBody.innerHTML = j.rows
        .map(
          (x) => `
            <tr>
              <td><strong>${esc(x.song)}</strong></td>
              <td>${esc(x.artist)}</td>
              <td class="right">${esc(x.plays)}</td>
            </tr>
          `
        )
        .join("");
    }
  } catch {
    setTbodyEmpty(topSongsBody, 3, "Error cargando");
  }
}

refreshStatsBtn?.addEventListener("click", loadStats);
daysSelect?.addEventListener("change", loadStats);

/* ===========================
   BOTÓN VER DÍA
=========================== */
function openDatePicker(input) {
  if (!input) return;

  if (typeof input.showPicker === "function") {
    input.showPicker();
  } else {
    input.click();
  }
}

if (dayPickResult) {
  dayPickResult.textContent = "";
  dayPickResult.hidden = true;
}

dayPickBtn?.addEventListener("click", () => {
  openDatePicker(dayPick);
});

dayPick?.addEventListener("change", async () => {
  const date = dayPick.value;

  if (!date) return;

  if (dayPickResult) {
    dayPickResult.hidden = false;
    dayPickResult.textContent = "Cargando…";
  }

  try {
    const r = await fetch(
      `/api/admin/stats/by-day-one?date=${encodeURIComponent(date)}`
    );

    const j = await r.json();

    if (!j.ok) throw new Error(j.error || "Error");

    if (dayPickResult) {
      dayPickResult.textContent =
        `${fmtDateCL(date)} · ${j.plays} reproducidas`;
    }
  } catch {
    if (dayPickResult) {
      dayPickResult.textContent = "Error cargando día";
    }
  }
});

/* ===========================
   HISTORIAL
=========================== */
function openHistoryModal(floor) {
  activeFloor = floor;

  if (histTitle) {
    histTitle.textContent =
      floor === 1
        ? "Historial Piso 1"
        : floor === 2
        ? "Historial Piso 2"
        : "Historial Piso 3";
  }

  if (histDate && !histDate.value) {
    histDate.value = serviceNightISO();
  }

  histOverlay?.classList.add("open");
  histModal?.classList.add("open");

  loadHistory();
}

function closeHistoryModal() {
  histOverlay?.classList.remove("open");
  histModal?.classList.remove("open");
  activeFloor = null;
}

histOverlay?.addEventListener("click", closeHistoryModal);
histCloseBtn?.addEventListener("click", closeHistoryModal);

histBtn1?.addEventListener("click", () => openHistoryModal(1));
histBtn2?.addEventListener("click", () => openHistoryModal(2));
histBtn3?.addEventListener("click", () => openHistoryModal(3));

histLoadBtn?.addEventListener("click", loadHistory);

function computeSummary(rows) {
  const total = rows.length;
  const tables = new Set();

  let sumWait = 0;
  let maxWait = 0;

  for (const r of rows) {
    tables.add(String(r.table_no ?? "—"));

    const wait = parseNum(r.wait_min);

    sumWait += wait;
    maxWait = Math.max(maxWait, wait);
  }

  const avg = total ? Math.round(sumWait / total) : 0;

  return {
    total,
    tables: tables.size,
    avg,
    max: maxWait,
  };
}

async function loadHistory() {
  if (!activeFloor) return;

  const date = histDate?.value;

  if (!date) return;

  if (histStatus) histStatus.textContent = "Cargando…";

  setTbodyEmpty(histBody, 5, "Cargando…");

  try {
    const r = await fetch(
      `/api/admin/history?floor=${activeFloor}&date=${encodeURIComponent(date)}`
    );

    const j = await r.json();

    if (!j.ok) throw new Error(j.error || "Error");

    if (histSub) {
      histSub.textContent = `${fmtDateCL(j.date)} · 19:00 → 05:00`;
    }

    const rows = j.rows || [];

    if (!rows.length) {
      if (histStatus) {
        histStatus.textContent = "Sin solicitudes reproducidas en esta jornada.";
      }

      if (sumPlayed) sumPlayed.textContent = "0";
      if (sumTables) sumTables.textContent = "0";
      if (sumAvg) sumAvg.textContent = "—";
      if (sumMax) sumMax.textContent = "—";

      setTbodyEmpty(histBody, 5, "Sin datos");
      return;
    }

    const s = computeSummary(rows);

    if (sumPlayed) sumPlayed.textContent = String(s.total);
    if (sumTables) sumTables.textContent = String(s.tables);
    if (sumAvg) sumAvg.textContent = fmtWait(s.avg);
    if (sumMax) sumMax.textContent = fmtWait(s.max);

    if (histStatus) histStatus.textContent = "";

    histBody.innerHTML = rows
      .map((x) => {
        const mesa = `Mesa ${x.table_no ?? "—"}`;
        const pedido = fmtTimeCL(x.requested_at);
        const reproducida = fmtTimeCL(x.played_at);
        const espera = fmtWait(x.wait_min);

        return `
          <tr>
            <td>
              <span class="admin-table-badge">
                ${esc(mesa)}
              </span>
            </td>

            <td>
              <strong>${esc(x.name || "—")}</strong>
              <div class="admin-table-primary">${esc(x.song || "—")}</div>
              <div class="admin-table-muted">${esc(x.artist || "—")}</div>
            </td>

            <td class="admin-mono">${esc(pedido)}</td>
            <td class="admin-mono">${esc(reproducida)}</td>

            <td class="right">
              <strong>${esc(espera)}</strong>
            </td>
          </tr>
        `;
      })
      .join("");
  } catch (e) {
    if (histStatus) {
      histStatus.textContent =
        "Error cargando historial: " + (e.message || e);
    }

    if (sumPlayed) sumPlayed.textContent = "—";
    if (sumTables) sumTables.textContent = "—";
    if (sumAvg) sumAvg.textContent = "—";
    if (sumMax) sumMax.textContent = "—";

    setTbodyEmpty(histBody, 5, "Error cargando");
  }
}

/* ===========================
   RULETA
=========================== */
let raffleFloor = null;
let raffleParticipants = [];
let wheelRot = 0;
let spinning = false;

let prevParticipantKeys = new Set();
let flashParticipantKeys = new Set();
let flashClearTimer = null;

function pluralVez(n) {
  return Number(n) === 1 ? "vez" : "veces";
}

function participantLabel(x) {
  return String(x?.name ?? "").trim();
}

function participantKey(x) {
  return `${String(x?.name ?? "").trim().toLowerCase()}::${String(
    x?.table_no ?? ""
  )
    .trim()
    .toLowerCase()}`;
}

function setRaffleStatus(msg) {
  if (!raffleStatus) return;

  const text = String(msg ?? "").trim();

  raffleStatus.textContent = text;
  raffleStatus.hidden = !text;
}

function openRaffle(floor) {
  raffleFloor = floor;

  if (raffleDate && !raffleDate.value) {
    raffleDate.value = serviceNightISO();
  }

  raffleOverlay?.classList.add("open");
  raffleModal?.classList.add("open");

  prevParticipantKeys = new Set();
  flashParticipantKeys = new Set();

  loadRaffleParticipants();
  loadWinners();
}

function closeRaffle() {
  raffleOverlay?.classList.remove("open");
  raffleModal?.classList.remove("open");

  raffleFloor = null;
  raffleParticipants = [];

  prevParticipantKeys = new Set();
  flashParticipantKeys = new Set();

  if (flashClearTimer) {
    clearTimeout(flashClearTimer);
    flashClearTimer = null;
  }

  setRaffleStatus("");

  setTbodyEmpty(participantsBody, 2, "—");
  setTbodyEmpty(winnersBody, 3, "—");

  drawWheel();

  if (raffleSpinBtn) {
    raffleSpinBtn.disabled = false;
  }

  spinning = false;
}

raffleOverlay?.addEventListener("click", closeRaffle);
raffleCloseBtn?.addEventListener("click", closeRaffle);

raffleBtn1?.addEventListener("click", () => openRaffle(1));
raffleBtn2?.addEventListener("click", () => openRaffle(2));
raffleBtn3?.addEventListener("click", () => openRaffle(3));

raffleDate?.addEventListener("change", () => {
  prevParticipantKeys = new Set();
  flashParticipantKeys = new Set();

  loadRaffleParticipants();
  loadWinners();
});

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;

  if (histModal?.classList.contains("open")) {
    closeHistoryModal();
  }

  if (raffleModal?.classList.contains("open")) {
    closeRaffle();
  }
});

socket.on("raffle:update", async (payload) => {
  if (!raffleModal?.classList.contains("open")) return;
  if (![1, 2, 3].includes(raffleFloor)) return;

  const floor = Number(payload?.floor);

  if (floor && floor !== raffleFloor) return;

  await loadRaffleParticipants({
    keepStatus: true,
    highlightNew: true,
  });
});

function wheelCtx() {
  if (!wheelCanvas) return null;

  return wheelCanvas.getContext("2d");
}

function drawWheel() {
  const ctx = wheelCtx();

  if (!ctx) return;

  const w = wheelCanvas.width;
  const h = wheelCanvas.height;
  const cx = w / 2;
  const cy = h / 2;
  const r = Math.min(cx, cy) - 6;

  ctx.clearRect(0, 0, w, h);

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);

  ctx.fillStyle = "rgba(255,255,255,0.05)";
  ctx.fill();

  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(200,165,122,0.8)";
  ctx.stroke();

  const n = raffleParticipants.length;

  if (!n) {
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.font = "600 15px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Sin participantes", cx, cy);
    return;
  }

  const arc = (Math.PI * 2) / n;

  for (let i = 0; i < n; i++) {
    const item = raffleParticipants[i];
    const flash = flashParticipantKeys.has(participantKey(item));

    const a0 = wheelRot + i * arc;
    const a1 = a0 + arc;

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, a0, a1);
    ctx.closePath();

    ctx.fillStyle = flash
      ? "rgba(200,165,122,.28)"
      : i % 2
      ? "rgba(255,255,255,.07)"
      : "rgba(255,255,255,.12)";

    ctx.fill();

    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(255,255,255,.07)";
    ctx.stroke();

    const mid = (a0 + a1) / 2;

    const tx = cx + Math.cos(mid) * (r * 0.64);
    const ty = cy + Math.sin(mid) * (r * 0.64);

    ctx.save();
    ctx.translate(tx, ty);
    ctx.rotate(mid + Math.PI / 2);

    ctx.fillStyle = flash
      ? "#e7c783"
      : "rgba(255,255,255,.88)";

    ctx.font = flash
      ? "800 12px system-ui"
      : "700 12px system-ui";

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    ctx.fillText(participantLabel(item).slice(0, 22), 0, 0);

    ctx.restore();
  }

  ctx.beginPath();
  ctx.arc(cx, cy, 26, 0, Math.PI * 2);

  ctx.fillStyle = "#111";
  ctx.fill();

  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(200,165,122,.8)";
  ctx.stroke();
}

function pickWinnerFromRotation() {
  const n = raffleParticipants.length;

  if (!n) return null;

  const arc = (Math.PI * 2) / n;
  const pointerAngle = -Math.PI / 2;

  const a = (pointerAngle - wheelRot) % (Math.PI * 2);
  const norm = (a + Math.PI * 2) % (Math.PI * 2);

  const idx = Math.floor(norm / arc) % n;

  return {
    idx,
    ...raffleParticipants[idx],
  };
}

function renderParticipantsFromLocal() {
  if (!participantsBody) {
    drawWheel();
    return;
  }

  if (!raffleParticipants.length) {
    setTbodyEmpty(participantsBody, 2, "Sin participantes");

    wheelRot = 0;
    drawWheel();

    return;
  }

  participantsBody.innerHTML = raffleParticipants
    .map(
      (x) => `
        <tr>
          <td>
            <strong>${esc(x.name)}</strong>
            <div class="admin-table-muted">
              Mesa ${esc(x.table_no ?? "—")}
            </div>
          </td>

          <td class="right">
            Cantó ${esc(x.plays)} ${pluralVez(x.plays)}
          </td>
        </tr>
      `
    )
    .join("");

  drawWheel();
}

function triggerParticipantFlash(keys) {
  flashParticipantKeys = new Set(keys);

  if (flashClearTimer) {
    clearTimeout(flashClearTimer);
  }

  flashClearTimer = setTimeout(() => {
    flashParticipantKeys = new Set();
    renderParticipantsFromLocal();
  }, 2200);
}

async function loadRaffleParticipants(opts = {}) {
  if (![1, 2, 3].includes(raffleFloor)) return;

  const {
    keepStatus = false,
    highlightNew = false,
  } = opts;

  const date = raffleDate?.value || serviceNightISO();

  if (!keepStatus) {
    setRaffleStatus("Cargando participantes…");
  }

  setTbodyEmpty(participantsBody, 2, "Cargando…");

  try {
    const r = await fetch(
      `/api/admin/stats/top-singers-night?floor=${raffleFloor}&date=${encodeURIComponent(
        date
      )}&min=2`
    );

    const j = await r.json();

    if (!j.ok) throw new Error(j.error || "Error");

    const nextRows = (j.rows || []).map((x) => ({
      name: x.name,
      table_no: x.table_no ?? null,
      plays: Number(x.plays) || 0,
    }));

    const nextKeys = new Set(nextRows.map(participantKey));
    const newKeys = [];

    if (highlightNew) {
      for (const item of nextRows) {
        const key = participantKey(item);

        if (!prevParticipantKeys.has(key)) {
          newKeys.push(key);
        }
      }
    }

    raffleParticipants = nextRows;
    prevParticipantKeys = nextKeys;

    if (!raffleParticipants.length) {
      if (!keepStatus) setRaffleStatus("");

      setTbodyEmpty(participantsBody, 2, "Sin participantes");

      wheelRot = 0;
      drawWheel();

      if (raffleSpinBtn) {
        raffleSpinBtn.disabled = true;
      }

      return;
    }

    if (newKeys.length) {
      triggerParticipantFlash(newKeys);
      setRaffleStatus("Nuevo concursante agregado");
    } else if (!keepStatus) {
      setRaffleStatus("");
    }

    renderParticipantsFromLocal();

    if (raffleSpinBtn) {
      raffleSpinBtn.disabled = false;
    }

    if (newKeys.length) {
      setTimeout(() => {
        if (raffleStatus?.textContent === "Nuevo concursante agregado") {
          setRaffleStatus("");
        }
      }, 1800);
    }
  } catch {
    raffleParticipants = [];

    if (!keepStatus) {
      setRaffleStatus("");
    }

    setTbodyEmpty(participantsBody, 2, "Error cargando");

    wheelRot = 0;
    drawWheel();

    if (raffleSpinBtn) {
      raffleSpinBtn.disabled = true;
    }
  }
}

async function loadWinners() {
  if (![1, 2, 3].includes(raffleFloor)) return;

  const date = raffleDate?.value || serviceNightISO();

  setTbodyEmpty(winnersBody, 3, "Cargando…");

  try {
    const r = await fetch(
      `/api/admin/raffle/winners?floor=${raffleFloor}&date=${encodeURIComponent(
        date
      )}`
    );

    const j = await r.json();

    if (!j.ok) throw new Error(j.error || "Error");

    const rows = j.rows || [];

    if (!rows.length) {
      setTbodyEmpty(winnersBody, 3, "Sin ganadores todavía");
      return;
    }

    winnersBody.innerHTML = rows
      .map(
        (w) => `
          <tr>
            <td class="admin-mono">
              ${esc(fmtTimeCL(w.created_at))}
            </td>

            <td>
              <strong>${esc(w.name)}</strong>
            </td>

            <td class="right">
              <span class="admin-table-badge">
                Mesa ${esc(w.table_no ?? "—")}
              </span>
            </td>
          </tr>
        `
      )
      .join("");
  } catch {
    setTbodyEmpty(winnersBody, 3, "Error cargando ganadores");
  }
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

async function spinWheel() {
  if (spinning) return;

  if (!raffleParticipants.length) {
    alert("No hay participantes para girar.");
    return;
  }

  spinning = true;

  if (raffleSpinBtn) {
    raffleSpinBtn.disabled = true;
  }

  const baseTurns = 5;
  const extra = Math.random() * 2;

  const target =
    wheelRot +
    (baseTurns + extra) * Math.PI * 2 +
    Math.random() * Math.PI * 2;

  const start = wheelRot;
  const delta = target - start;
  const dur = 2600;
  const t0 = performance.now();

  setRaffleStatus("Girando…");

  function frame(now) {
    const t = Math.min(1, (now - t0) / dur);
    const k = easeOutCubic(t);

    wheelRot = start + delta * k;

    drawWheel();

    if (t < 1) {
      requestAnimationFrame(frame);
    } else {
      done();
    }
  }

  async function done() {
    wheelRot =
      ((wheelRot % (Math.PI * 2)) + Math.PI * 2) %
      (Math.PI * 2);

    drawWheel();

    const w = pickWinnerFromRotation();

    if (!w) {
      setRaffleStatus("");
      spinning = false;

      if (raffleSpinBtn) {
        raffleSpinBtn.disabled = false;
      }

      return;
    }

    const winnerName = w.name;
    const winnerTable = w.table_no;
    const winnerPlays = w.plays;
    const winnerKey = participantKey(w);

    setRaffleStatus(
      `Ganador: ${winnerName}${
        winnerTable ? ` · Mesa ${winnerTable}` : ""
      }`
    );

    try {
      const date = raffleDate?.value || serviceNightISO();

      await fetch("/api/admin/raffle/winners", {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          floor: raffleFloor,
          date,
          name: winnerName,
          table: winnerTable,
          plays: winnerPlays,
        }),
      });
    } catch {}

    raffleParticipants = raffleParticipants.filter(
      (p) => participantKey(p) !== winnerKey
    );

    prevParticipantKeys = new Set(
      raffleParticipants.map(participantKey)
    );

    renderParticipantsFromLocal();

    await loadWinners();

    await loadRaffleParticipants({
      keepStatus: true,
      highlightNew: false,
    });

    if (raffleSpinBtn) {
      raffleSpinBtn.disabled = raffleParticipants.length === 0;
    }

    setTimeout(() => {
      setRaffleStatus("");
    }, 1800);

    spinning = false;

    if (raffleSpinBtn) {
      raffleSpinBtn.disabled = raffleParticipants.length === 0;
    }
  }

  requestAnimationFrame(frame);
}

raffleSpinBtn?.addEventListener("click", spinWheel);

/* ===========================
   OPINIONES Y SUGERENCIAS
=========================== */
function suggestionCategoryClass(category) {
  const value = String(category ?? "").toLowerCase();

  if (value === "reclamo") return "complaint";

  if (
    value === "felicitación" ||
    value === "felicitacion"
  ) {
    return "congratulation";
  }

  if (value.includes("problema")) return "problem";
  if (value === "sugerencia") return "suggestion";

  return "other";
}

function setSuggestionStatus(text) {
  if (!suggestionStatusText) return;

  suggestionStatusText.textContent = text || "";
  suggestionStatusText.hidden = !text;
}

function updateSuggestionSummary(summary) {
  const total = Number(summary?.total || 0);
  const floor1 = Number(summary?.floor1 || 0);
  const floor2 = Number(summary?.floor2 || 0);
  const pending = Number(summary?.pending || 0);

  if (suggestionTotalCount) {
    suggestionTotalCount.textContent = total;
  }

  if (suggestionFloor1Count) {
    suggestionFloor1Count.textContent = floor1;
  }

  if (suggestionFloor2Count) {
    suggestionFloor2Count.textContent = floor2;
  }

  if (suggestionPendingCount) {
    suggestionPendingCount.textContent = pending;
  }
}

function updatePendingBadge(count) {
  const pending = Number(count) || 0;

  if (suggestionPendingBadge) {
    suggestionPendingBadge.textContent = pending;
    suggestionPendingBadge.hidden = pending <= 0;
  }

  if (summaryPendingSuggestions) {
    summaryPendingSuggestions.textContent = pending;
  }
}

async function loadSuggestionPendingCount() {
  try {
    const r = await fetch("/api/admin/suggestions/pending-count");
    const j = await r.json();

    if (r.ok && j.ok) {
      updatePendingBadge(j.pending);
    }
  } catch {}
}

function renderSuggestions(rows) {
  if (!suggestionList) return;

  if (!Array.isArray(rows) || !rows.length) {
    suggestionList.innerHTML = `
      <div class="admin-suggestion-empty">

        <div class="admin-suggestion-empty-icon">
          ✓
        </div>

        <strong>
          No hay opiniones para mostrar
        </strong>

        <span>
          Prueba otra jornada o cambia los filtros.
        </span>

      </div>
    `;

    return;
  }

  suggestionList.innerHTML = rows
    .map((item) => {
      const reviewed = item.status === "reviewed";
      const floor = Number(item.floor);

      const contact = String(item.contact || "").trim();
      const wantsContact = !!item.wants_contact;

      const category = item.category || "Otro";
      const categoryClass = suggestionCategoryClass(category);

      return `
        <article
          class="admin-suggestion-card ${reviewed ? "reviewed" : "pending"}"
          data-suggestion-id="${esc(item.id)}"
        >

          <div class="admin-suggestion-card-head">

            <div class="admin-suggestion-meta">

              <span
                class="admin-suggestion-category ${esc(categoryClass)}"
              >
                ${esc(category)}
              </span>

              <span class="admin-suggestion-floor">
                Piso ${esc(floor)}
              </span>

              <span class="admin-suggestion-time">
                ${esc(fmtTimeCL(item.created_at))}
              </span>

            </div>

            <span
              class="admin-suggestion-state ${
                reviewed ? "reviewed" : "pending"
              }"
            >
              ${reviewed ? "Revisada" : "Pendiente"}
            </span>

          </div>

          <div class="admin-suggestion-author">
            ${esc(item.name || "Sin nombre")}
          </div>

          <div class="admin-suggestion-message">
            ${esc(item.message || "")}
          </div>

          ${
            wantsContact
              ? `
                <div class="admin-suggestion-contact">

                  <div class="admin-suggestion-contact-title">
                    Solicita contacto
                  </div>

                  <div class="admin-suggestion-contact-value">
                    ${esc(contact || "Sin dato ingresado")}
                  </div>

                </div>
              `
              : ""
          }

          <div class="admin-suggestion-card-footer">

            <div class="admin-suggestion-date">
              ${esc(
                new Date(item.created_at).toLocaleString("es-CL", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                })
              )}
            </div>

            ${
              !reviewed
                ? `
                  <button
                    type="button"
                    class="admin-review-btn"
                    data-review-suggestion="${esc(item.id)}"
                  >
                    Marcar como revisado
                  </button>
                `
                : `
                  <span class="admin-reviewed-text">
                    Revisada
                  </span>
                `
            }

          </div>

        </article>
      `;
    })
    .join("");

  document
    .querySelectorAll("[data-review-suggestion]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        reviewSuggestion(
          Number(button.dataset.reviewSuggestion),
          button
        );
      });
    });
}

async function loadSuggestions() {
  const date = suggestionDate?.value || serviceNightISO();

  if (suggestionDate && !suggestionDate.value) {
    suggestionDate.value = date;
  }

  setSuggestionStatus("Cargando opiniones…");

  if (suggestionList) {
    suggestionList.innerHTML = `
      <div class="admin-suggestion-loading">
        Cargando…
      </div>
    `;
  }

  const params = new URLSearchParams();

  params.set("date", date);

  if (suggestionFloorFilter !== "all") {
    params.set("floor", suggestionFloorFilter);
  }

  if (suggestionStatusFilter !== "all") {
    params.set("status", suggestionStatusFilter);
  }

  try {
    const r = await fetch(
      `/api/admin/suggestions?${params.toString()}`
    );

    const j = await r.json();

    if (!r.ok || !j.ok) {
      throw new Error(
        j.error || "No se pudieron cargar las opiniones."
      );
    }

    renderSuggestions(j.rows || []);
    updateSuggestionSummary(j.summary || {});

    if (suggestionWindowText) {
      suggestionWindowText.textContent =
        `${fmtDateCL(date)} · 19:00 → 05:00`;
    }

    setSuggestionStatus("");

    if (typeof j.pendingTotal !== "undefined") {
      updatePendingBadge(j.pendingTotal);
    } else {
      loadSuggestionPendingCount();
    }
  } catch (e) {
    if (suggestionList) {
      suggestionList.innerHTML = `
        <div class="admin-suggestion-empty">

          <strong>
            No se pudieron cargar las opiniones
          </strong>

          <span>
            ${esc(e.message || "Error de servidor.")}
          </span>

        </div>
      `;
    }

    setSuggestionStatus("Error cargando opiniones.");
  }
}

async function reviewSuggestion(id, button) {
  if (!Number.isInteger(id) || id <= 0) return;

  const original = button?.textContent;

  if (button) {
    button.disabled = true;
    button.textContent = "Guardando…";
  }

  try {
    const r = await fetch(
      `/api/admin/suggestions/${id}/review`,
      {
        method: "PATCH",
      }
    );

    const j = await r.json();

    if (!r.ok || !j.ok) {
      throw new Error(
        j.error || "No se pudo actualizar."
      );
    }

    await loadSuggestions();
    await loadSuggestionPendingCount();
  } catch (e) {
    alert(
      e.message ||
      "No se pudo marcar como revisada."
    );

    if (button) {
      button.disabled = false;
      button.textContent =
        original ||
        "Marcar como revisado";
    }
  }
}

/* ===========================
   FILTROS OPINIONES
=========================== */
suggestionFloorButtons.forEach((button) => {
  button.addEventListener("click", () => {
    suggestionFloorFilter =
      button.dataset.suggestionFloor || "all";

    suggestionFloorButtons.forEach((item) => {
      item.classList.toggle("active", item === button);
    });

    loadSuggestions();
  });
});

suggestionStatusButtons.forEach((button) => {
  button.addEventListener("click", () => {
    suggestionStatusFilter =
      button.dataset.suggestionStatus || "all";

    suggestionStatusButtons.forEach((item) => {
      item.classList.toggle("active", item === button);
    });

    loadSuggestions();
  });
});

suggestionDate?.addEventListener("change", loadSuggestions);

/* ===========================
   BOOT
=========================== */
(async function boot() {
  const night = serviceNightISO();

  if (histDate) histDate.value = night;
  if (raffleDate) raffleDate.value = night;
  if (suggestionDate) suggestionDate.value = night;
  if (dayPick) dayPick.value = night;

  try {
    const r = await fetch("/api/orders-status");
    const j = await r.json();

    if (j.ok) {
      applyStatus(j.ordersOpen);
    }
  } catch {}

  try {
    drawWheel();
  } catch {}

  loadStats();
  loadSuggestionPendingCount();
})();