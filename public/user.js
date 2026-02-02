// public/user.js

const form = document.getElementById("requestForm");
const toast = document.getElementById("toast");

const tableInput = document.getElementById("table");
const nameInput = document.getElementById("name");
const artistInput = document.getElementById("artist");
const songInput = document.getElementById("song");

const MESA_MAX = 50;

function showToast(msg) {
  toast.textContent = msg;
}

// ✅ Mesa: solo números + clamp 1..50 (en vivo)
tableInput.addEventListener("input", () => {
  // deja solo dígitos
  let raw = tableInput.value.replace(/[^\d]/g, "");

  // evita que escriban eternamente (50 = 2 dígitos, pero dejamos 2 por seguridad)
  raw = raw.slice(0, 2);

  // si está vacío, deja vacío (para que el usuario pueda borrar)
  if (raw === "") {
    tableInput.value = "";
    return;
  }

  let n = parseInt(raw, 10);
  if (Number.isNaN(n)) {
    tableInput.value = "";
    return;
  }

  // clamp
  if (n < 1) n = 1;
  if (n > MESA_MAX) n = MESA_MAX;

  tableInput.value = String(n);
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  showToast("");

  const table = tableInput.value.trim();
  const name = nameInput.value.trim();
  const artist = artistInput.value.trim();
  const song = songInput.value.trim();

  // ✅ Validación mesa (1 a 50)
  if (!/^\d{1,2}$/.test(table)) return showToast("Mesa inválida (solo números).");

  const t = Number(table);
  if (t < 1 || t > MESA_MAX) return showToast(`Mesa inválida (1 a ${MESA_MAX}).`);

  // Validaciones restantes
  if (name.length < 1 || name.length > 40) return showToast("Nombre inválido (1 a 40).");
  if (artist.length < 1 || artist.length > 40) return showToast("Artista inválido (1 a 40).");
  if (song.length < 1 || song.length > 40) return showToast("Canción inválida (1 a 40).");

  try {
    const res = await fetch("/api/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table: String(t), name, artist, song })
    });

    // Intentamos leer JSON de forma segura
    let data = null;
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      data = await res.json();
    } else {
      // por si el server devuelve algo distinto
      data = { ok: res.ok };
    }

    // ✅ 403: puede ser por horario o por admin
    if (res.status === 403) {
      if (data?.reason === "admin") {
        return showToast("⛔ Lo sentimos, pedidos no disponibles.");
      }
      return showToast(data?.error || "Las solicitudes no están disponibles en este horario.");
    }

    // Otros errores
    if (!res.ok || !data?.ok) {
      return showToast(data?.error || "No se pudo enviar. Intenta nuevamente.");
    }

    form.reset();
    showToast("✅ Solicitud enviada. ¡Gracias!");
  } catch (err) {
    showToast("No se pudo enviar. Intenta nuevamente.");
  }
});
