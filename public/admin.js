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

function showToast(msg) {
  toast.textContent = msg || "";
}

let lastStatus = { piso1: true, piso2: true };
let saving = false;

function applyStatus(st) {
  lastStatus = st || lastStatus;

  // toggles
  toggle1.checked = !!lastStatus.piso1;
  toggle2.checked = !!lastStatus.piso2;

  // dots + labels
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
      showToast(data?.error || "No se pudo guardar (¿sesión admin?).");
      // revertir visual a lo último conocido
      applyStatus(lastStatus);
      return;
    }

    connBadge.textContent = "Guardado";
    applyStatus(data.ordersOpen);
  } catch (e) {
    connBadge.textContent = "Error";
    showToast("No se pudo guardar. Revisa conexión.");
    applyStatus(lastStatus);
  } finally {
    saving = false;
    setTimeout(() => {
      if (connBadge.textContent === "Guardado") connBadge.textContent = "En vivo";
    }, 700);
  }
}

// contadores en vivo
socket.on("requests:update", (reqs) => {
  count1.textContent = (reqs?.length ?? 0);
});
socket.on("requests2:update", (reqs) => {
  count2.textContent = (reqs?.length ?? 0);
});

// estado pedidos en vivo
socket.on("orders:status", (st) => {
  applyStatus(st);
  connBadge.textContent = "En vivo";
});

socket.on("connect", () => {
  connBadge.textContent = "En vivo";
});
socket.on("disconnect", () => {
  connBadge.textContent = "Desconectado";
});

// cambios de switches
toggle1.addEventListener("change", saveStatus);
toggle2.addEventListener("change", saveStatus);

// logout
logoutBtn.addEventListener("click", async () => {
  try {
    await fetch("/auth/logout", { method: "POST" });
  } catch {}
  location.href = "/login";
});

// fallback: si por alguna razón no llega socket rápido, consultamos el estado
(async function bootstrapStatus() {
  try {
    const res = await fetch("/api/orders-status");
    const data = await res.json();
    if (data?.ok && data.ordersOpen) applyStatus(data.ordersOpen);
  } catch {}
})();
