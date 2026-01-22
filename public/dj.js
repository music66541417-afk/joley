// public/dj.js

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
 * - Luego, cualquier request nueva que aparezca sí anima 3-4 segundos.
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
    await fetch("/api/requests", { method: "DELETE" });
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
    // ✅ Con tu server.js (requests.push), esto queda viejo→nuevo dentro de la mesa
  }
  return map;
}

function uniqueTablesInOrder(requests) {
  // ✅ Devuelve mesas en orden de aparición en "requests"
  // Con tu server.js (viejo→nuevo), esto quedará: mesas antiguas primero, nuevas al final
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
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

function render(requests) {
  // ✅ Detectar IDs nuevos (para animación)
  const currentIds = new Set(requests.map(r => r.id));
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

  // ✅ Orden de mesas para el área principal:
  // Mantén el orden natural (la primera mesa que apareció queda primero)
  const tablesOrder = uniqueTablesInOrder(requests);

  // ✅ Panel derecho: "últimas mesas" => la más nueva arriba
  const tablesNewestFirst = [...tablesOrder].reverse();

  lastTables.innerHTML = tablesNewestFirst.length
    ? tablesNewestFirst.map((t, idx) => `<div>• ${idx + 1}. Mesa ${escapeHtml(t)}</div>`).join("")
    : `<div>—</div>`;

  // Área principal: una tarjeta por mesa
  const grouped = groupByTable(requests);

  for (const table of tablesOrder) {
    const list = grouped.get(table) || [];
    // ✅ IMPORTANTE: NO reverse aquí, porque tu server ya manda viejo→nuevo

    // ✅ Esta mesa "es nueva" si tiene al menos 1 request nueva
    const hasNewForThisTable = list.some(r => newIdSet.has(r.id));

    const card = document.createElement("div");
    card.className = "card table-card" + (hasNewForThisTable ? " flash-new" : "");

    card.innerHTML = `
      <div class="row">
        <div class="title ${hasNewForThisTable ? "flash-title" : ""}">
          Mesa ${escapeHtml(table)}
        </div>
        <span class="status pending">Pendiente</span>
      </div>

      <div class="song-list">
        ${list.map(r => `
          <div class="song-item">
            <div class="song-meta ${hasNewForThisTable ? "flash-labels" : ""}">
              <b>Canción:</b> ${escapeHtml(r.song)}
            </div>

            <div class="song-meta ${hasNewForThisTable ? "flash-labels" : ""}">
              <b>Nombre:</b> ${escapeHtml(r.name)}
            </div>

            <div class="song-meta ${hasNewForThisTable ? "flash-labels" : ""}">
              <b>Artista:</b> ${escapeHtml(r.artist)}
            </div>

            <div class="song-time">${escapeHtml(formatDate(r.createdAt))}</div>

            <button class="btn-mini" data-id="${r.id}">✅ Reproducida</button>
          </div>
        `).join("")}
      </div>

      <div class="muted">Total en esta mesa: <b>${list.length}</b></div>
    `;

    cards.appendChild(card);
  }

  // Botones reproducida: elimina solo esa solicitud
  document.querySelectorAll("button[data-id]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-id");
      btn.disabled = true;
      const old = btn.textContent;
      btn.textContent = "Quitando...";

      try {
        await fetch(`/api/requests/${id}`, { method: "DELETE" });
      } catch (e) {
        btn.disabled = false;
        btn.textContent = old;
      }
    });
  });
}

socket.on("requests:update", (requests) => render(requests));

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
