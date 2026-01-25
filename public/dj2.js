// public/dj2.js
// ✅ Panel DJ2 (2do piso) — misma lógica que dj.js pero:
// - escucha:  requests2:update
// - borra todo: /api/requests2
// - borra 1:   /api/requests2/:id

const cards = document.getElementById("cards");
const lastTables = document.getElementById("lastTables");
const emptyMsg = document.getElementById("emptyMsg");
const countBadge = document.getElementById("countBadge");

const refreshBtn = document.getElementById("refreshBtn");
const clearAllBtn = document.getElementById("clearAllBtn");

const socket = io();

/**
 * ✅ Anti-parpadeo al cargar:
 * - En la PRIMERA actualización que llega, NO animamos.
 * - Luego, cualquier request nueva que aparezca sí anima.
 */
let prevIds = new Set();
let hasBootstrapped = false;

refreshBtn?.addEventListener("click", () => location.reload());

clearAllBtn?.addEventListener("click", async () => {
  const ok = confirm("¿Seguro que quieres BORRAR TODAS las solicitudes?");
  if (!ok) return;

  clearAllBtn.disabled = true;
  const oldText = clearAllBtn.textContent;
  clearAllBtn.textContent = "Limpiando...";

  try {
    await fetch("/api/requests2", { method: "DELETE" });
    // Se actualizará por socket
  } catch (e) {
    alert("No se pudo limpiar. Revisa conexión.");
  } finally {
    clearAllBtn.disabled = false;
    clearAllBtn.textContent = oldText;
  }
});

function groupByTable(requests) {
  const map = new Map();
  for (const r of requests) {
    if (!map.has(r.table)) map.set(r.table, []);
    map.get(r.table).push(r);
    // ✅ Con server.js (requests2.push), queda viejo→nuevo dentro de la mesa
  }
  return map;
}

function uniqueTablesInOrder(requests) {
  // ✅ Mesas en orden de aparición en "requests" (viejo→nuevo)
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
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function render(requests) {
  // ✅ Detectar IDs nuevos (para animación)
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

  if (requests.length === 0) {
    emptyMsg.textContent = "No hay solicitudes pendientes.";
    lastTables.innerHTML = `<div>—</div>`;
    return;
  } else {
    emptyMsg.textContent = "";
  }

  // ✅ SOLO CAMBIO PEDIDO: identificar la mesa de la última solicitud
  const lastTable = requests[requests.length - 1]?.table;

  // ✅ Área principal: mesas en orden natural (antiguas primero)
  const tablesOrder = uniqueTablesInOrder(requests);

  // ✅ SOLO CAMBIO PEDIDO: mostrar el nombre del PRIMER pedido pendiente por mesa (FIFO)
  // Se mantiene hasta que el DJ elimina ese pedido; luego pasa al siguiente.
  const firstNameByTable = new Map();
  for (const r of requests) {
    const key = String(r.table);
    if (!firstNameByTable.has(key)) firstNameByTable.set(key, r.name);
  }

  // ✅ SOLO CAMBIO PEDIDO: panel derecho en orden de llegada (primera arriba)
  // + nombre alineado a la derecha y separado (mismo color/fuente por herencia)
  lastTables.innerHTML = tablesOrder.length
    ? tablesOrder
        .map((t, idx) => {
          const name = firstNameByTable.get(String(t)) ?? "";
          return `
            <div style="display:flex; align-items:center; gap:12px;">
              <span>#${idx + 1}. Mesa ${escapeHtml(t)}</span>
              <span style="margin-left:auto; padding-left:14px;">${escapeHtml(name)}</span>
            </div>
          `;
        })
        .join("")
    : `<div>—</div>`;

  const grouped = groupByTable(requests);

  for (const table of tablesOrder) {
    const list = grouped.get(table) || [];

    // ✅ Mesa nueva → borde azul (NO se toca)
    const hasNewForThisTable = list.some((r) => newIdSet.has(r.id));

    // ✅ detectar SOLO la última canción nueva de esta mesa
    let lastNewId = null;
    for (let i = list.length - 1; i >= 0; i--) {
      if (newIdSet.has(list[i].id)) {
        lastNewId = list[i].id;
        break;
      }
    }

    // ✅ SOLO CAMBIO PEDIDO: si esta mesa es la última en recibir solicitud
    const isLastTable = String(table) === String(lastTable);

    const card = document.createElement("div");
    card.className = "card table-card" + (hasNewForThisTable ? " flash-new" : "");

    card.innerHTML = `
      <div class="row">
        <div class="title">Mesa ${escapeHtml(table)}</div>
        <span class="status pending">${isLastTable ? "ÚLTIMA MESA" : "Pendiente"}</span>
      </div>

      <div class="song-list">
        ${list
          .map((r, idx) => {
            const isLastNew = r.id === lastNewId;

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

                <div class="song-time">${escapeHtml(formatDate(r.createdAt))}</div>

                <button class="btn-mini" data-id="${r.id}">✅ Reproducida</button>
              </div>
            `;
          })
          .join("")}
      </div>

      <div class="muted">Total en esta mesa: <b>${list.length}</b></div>
    `;

    cards.appendChild(card);
  }

  // ✅ Botones reproducida: elimina solo esa solicitud (2do piso)
  document.querySelectorAll("button[data-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-id");
      btn.disabled = true;
      btn.textContent = "Quitando...";

      try {
        await fetch(`/api/requests2/${id}`, { method: "DELETE" });
      } catch (e) {
        btn.disabled = false;
        btn.textContent = "✅ Reproducida";
      }
    });
  });
}

// ✅ DJ2 escucha su propio canal
socket.on("requests2:update", (requests) => render(requests));

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

