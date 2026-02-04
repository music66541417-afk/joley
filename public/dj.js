// public/dj.js

const cards = document.getElementById("cards");
const lastTables = document.getElementById("lastTables");
const emptyMsg = document.getElementById("emptyMsg");
const countBadge = document.getElementById("countBadge");

const refreshBtn = document.getElementById("refreshBtn");
const clearAllBtn = document.getElementById("clearAllBtn");

// ✅ NUEVO: botón "Pedidos" + dot (verde/rojo)
const ordersBtn = document.getElementById("ordersBtn");
const ordersDot = document.getElementById("ordersDot");

const socket = io();

/**
 * Anti-parpadeo al cargar:
 * - Primera actualización NO anima
 * - Luego, solo nuevas requests
 */
let prevIds = new Set();
let hasBootstrapped = false;

// ✅ Para que el "Recién añadido" se dispare 1 vez por request nueva
let lastNewBadgeId = null;

// ✅ Confirmación sutil inline para "Reproducida" (doble click)
let pendingConfirmId = null;
let confirmTimeout = null;

refreshBtn?.addEventListener("click", () => location.reload());

clearAllBtn?.addEventListener("click", async () => {
  const ok = confirm("¿Seguro que quieres BORRAR TODAS las solicitudes?");
  if (!ok) return;

  clearAllBtn.disabled = true;
  const oldText = clearAllBtn.textContent;
  clearAllBtn.textContent = "Limpiando...";

  try {
    await fetch("/api/requests", { method: "DELETE" });
  } catch (e) {
    alert("No se pudo limpiar. Revisa conexión.");
  } finally {
    clearAllBtn.disabled = false;
    clearAllBtn.textContent = oldText;
  }
});

// ✅ NUEVO: estado pedidos (piso1) en vivo para el DJ
socket.on("orders:status", (st) => {
  if (!ordersDot) return;

  const isOpen = !!st?.piso1;

  ordersDot.classList.remove("open", "closed");
  ordersDot.classList.add(isOpen ? "open" : "closed");

  // tooltip / title útil para el DJ
  if (ordersBtn) {
    ordersBtn.title = isOpen ? "Pedidos abiertos" : "Pedidos cerrados";
  }
});

function groupByTable(requests) {
  const map = new Map();
  for (const r of requests) {
    if (!map.has(r.table)) map.set(r.table, []);
    map.get(r.table).push(r);
  }
  return map;
}

function uniqueTablesInOrder(requests) {
  const seen = new Set();
  const out = [];
  for (const r of requests) {
    if (!seen.has(r.table)) {
      seen.add(r.table);
      out.push(r.table);
    }
  }
  return out;
}

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function render(requests) {
  const currentIds = new Set(requests.map((r) => r.id));
  const newIdSet = new Set();

  if (!hasBootstrapped) {
    prevIds = currentIds;
    hasBootstrapped = true;
  } else {
    for (const id of currentIds) {
      if (!prevIds.has(id)) newIdSet.add(id);
    }
    prevIds = currentIds;
  }

  countBadge.textContent = `${requests.length} pendientes`;
  cards.innerHTML = "";

  // reset confirmación si ya no existe esa request
  if (pendingConfirmId && !currentIds.has(pendingConfirmId)) {
    pendingConfirmId = null;
    clearTimeout(confirmTimeout);
    confirmTimeout = null;
  }

  if (requests.length === 0) {
    emptyMsg.textContent = "No hay solicitudes pendientes.";
    lastTables.innerHTML = `<div>—</div>`;
    return;
  } else {
    emptyMsg.textContent = "";
  }

  const lastReq = requests[requests.length - 1];
  const lastTable = lastReq?.table;
  const lastReqId = lastReq?.id ?? null;

  const tablesOrder = uniqueTablesInOrder(requests);

  // ✅ mesa que debe sonar (la primera del panel derecho)
  const nextUpTable = tablesOrder[0];

  // ✅ si la última request llegó recién (es nueva)
  const shouldShowRecien = !!(lastReqId && newIdSet.has(lastReqId));

  // FIFO: primer nombre por mesa
  const firstNameByTable = new Map();
  for (const r of requests) {
    const key = String(r.table);
    if (!firstNameByTable.has(key)) firstNameByTable.set(key, r.name);
  }

  // Panel derecho
  lastTables.innerHTML = tablesOrder
    .map((t, i) => {
      const name = firstNameByTable.get(String(t)) ?? "";
      return `
        <div style="display:flex; align-items:center; gap:12px;">
          <span>#${i + 1}. Mesa ${escapeHtml(t)}</span>
          <span style="margin-left:auto; padding-left:14px;">${escapeHtml(
            name
          )}</span>
        </div>
      `;
    })
    .join("");

  const grouped = groupByTable(requests);

  for (const table of tablesOrder) {
    const list = grouped.get(table) || [];

    // mesa nueva → borde azul
    const hasNewForThisTable = list.some((r) => newIdSet.has(r.id));

    // última canción nueva de esta mesa
    let lastNewId = null;
    for (let i = list.length - 1; i >= 0; i--) {
      if (newIdSet.has(list[i].id)) {
        lastNewId = list[i].id;
        break;
      }
    }

    const isLastTable = String(table) === String(lastTable);
    const isNextUp = String(table) === String(nextUpTable);

    // ✅ "Recién añadido" solo si: es la última mesa y la última request llegó recién
    const showRecienBadge = isLastTable && shouldShowRecien;

    const card = document.createElement("div");

    card.className =
      "card table-card" +
      (hasNewForThisTable ? " flash-new" : "") +
      (isNextUp ? " next-up" : "") +
      (showRecienBadge ? " recien-card" : "");

    card.innerHTML = `
      <div class="row">
        <div class="title">
          Mesa ${escapeHtml(table)}
          ${
            isNextUp
              ? `<span class="next-dot" aria-label="Siguiente"></span>`
              : ``
          }
        </div>

        <div style="display:flex; align-items:center; gap:10px;">
          ${
            isLastTable
              ? `
                <span
                  class="status ultima ${
                    showRecienBadge ? "ultima-new" : "ultima-faded"
                  }"
                  data-lastbadge-id="${escapeHtml(lastReqId)}"
                >
                  ${showRecienBadge ? "Recién añadido" : "ÚLTIMA MESA"}
                </span>
              `
              : ``
          }
        </div>
      </div>

      <div class="song-list">
        ${list
          .map((r, idx) => {
            const isLastNew = r.id === lastNewId;

            // Estado visual del botón si está en modo confirmación
            const confirmClass = pendingConfirmId === r.id ? " confirm" : "";

            return `
              <div class="song-item ${isLastNew ? "new-song" : ""}">
                <div class="song-line">
                  <div class="song-meta">
                    <b>Canción:</b> ${escapeHtml(r.song)}
                  </div>

                  <span class="song-index">#${idx + 1}</span>
                </div>

                <div class="song-meta">
                  <b>Artista:</b> ${escapeHtml(r.artist)}
                </div>

                <div class="song-meta">
                  <b>Cliente:</b> ${escapeHtml(r.name)}
                </div>

                <div class="song-footer">
                  <div class="song-time">${escapeHtml(formatDate(r.createdAt))}</div>

                  <!-- ✅ Botón abajo al lado de la hora (no rompe los textos) -->
                  <button class="icon-btn played-btn${confirmClass}" data-id="${escapeHtml(
                    r.id
                  )}" title="Marcar como reproducida">
                    ✓
                  </button>
                </div>
              </div>
            `;
          })
          .join("")}
      </div>

      <div class="muted">Total en esta mesa: <b>${list.length}</b></div>
    `;

    cards.appendChild(card);
  }

  // ✅ Cambiar "Recién añadido" -> "ÚLTIMA MESA" tenue después de 4s
  if (shouldShowRecien && lastReqId && lastNewBadgeId !== lastReqId) {
    lastNewBadgeId = lastReqId;

    setTimeout(() => {
      const sel = `[data-lastbadge-id="${CSS.escape(String(lastReqId))}"]`;
      const el = document.querySelector(sel);
      if (!el) return;

      el.textContent = "ÚLTIMA MESA";
      el.classList.remove("ultima-new");
      el.classList.add("ultima-faded");

      // apagar borde parpadeante al mismo tiempo
      const cardEl = el.closest(".table-card");
      cardEl?.classList.remove("recien-card");
    }, 4000);
  }
}

/**
 * ✅ Manejo de click del botón ícono (doble click confirma)
 * - 1er click: se pone en modo confirmación (sutil)
 * - 2do click (antes de 2.5s): elimina
 */
cards.addEventListener("click", async (e) => {
  const btn = e.target.closest(".played-btn");
  if (!btn) return;

  const id = btn.getAttribute("data-id");
  if (!id) return;

  // Segundo click (confirmado)
  if (pendingConfirmId === id) {
    clearTimeout(confirmTimeout);
    confirmTimeout = null;
    pendingConfirmId = null;

    // bloqueo visual inmediato
    btn.disabled = true;
    btn.classList.remove("confirm");
    btn.textContent = "…";

    try {
      const res = await fetch(`/api/requests/${id}`, { method: "DELETE" });

      // ✅ fetch NO lanza error si es 500/404. Hay que validar.
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `Error ${res.status}`);
      }

      // ✅ FALLBACK: si el socket no actualiza, recargamos lista por HTTP
      const listRes = await fetch("/api/requests");
      const listData = await listRes.json().catch(() => null);
      if (listRes.ok && listData?.ok) {
        render(listData.requests || []);
      }
      // si el socket llega, igual re-renderiza y queda todo sincronizado
    } catch (err) {
      // si falla, vuelve a estado normal
      btn.disabled = false;
      btn.textContent = "✓";
      alert(err?.message || "No se pudo marcar como reproducida. Revisa conexión.");
    }
    return;
  }

  // Primer click → activar confirmación para este id
  pendingConfirmId = id;

  // limpiar confirmación anterior (si existía)
  document.querySelectorAll(".played-btn.confirm").forEach((b) => {
    if (b !== btn) b.classList.remove("confirm");
  });

  btn.classList.add("confirm");

  clearTimeout(confirmTimeout);
  confirmTimeout = setTimeout(() => {
    // si sigue siendo el mismo id, se cancela
    if (pendingConfirmId === id) pendingConfirmId = null;
    btn.classList.remove("confirm");
  }, 2500);
});

socket.on("requests:update", (requests) => render(requests));

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
