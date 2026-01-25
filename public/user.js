const form = document.getElementById("requestForm");
const toast = document.getElementById("toast");

const tableInput = document.getElementById("table");
const nameInput = document.getElementById("name");
const artistInput = document.getElementById("artist");
const songInput = document.getElementById("song");

// Mesa: solo números en vivo
tableInput.addEventListener("input", () => {
  tableInput.value = tableInput.value.replace(/[^\d]/g, "").slice(0, 3);
});

function showToast(msg) {
  toast.textContent = msg;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  showToast("");

  const table = tableInput.value.trim();
  const name = nameInput.value.trim();
  const artist = artistInput.value.trim();
  const song = songInput.value.trim();

  // Validación front (igual se valida en server)
  if (!/^\d{1,3}$/.test(table)) return showToast("Mesa inválida (solo números, máx 3 cifras).");
  const t = Number(table);
  if (t < 1 || t > 999) return showToast("Mesa inválida (1 a 999).");

  if (name.length < 1 || name.length > 40) return showToast("Nombre inválido (1 a 40).");
  if (artist.length < 1 || artist.length > 40) return showToast("Artista inválido (1 a 40).");
  if (song.length < 1 || song.length > 40) return showToast("Canción inválida (1 a 40).");

  try {
    const res = await fetch("/api/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table, name, artist, song })
    });

    const data = await res.json();
    if (!data.ok) return showToast(data.error || "No se pudo enviar.");

    form.reset();
    showToast("✅ Solicitud enviada. ¡Gracias!");
  } catch (err) {
    showToast("Error de conexión. Intenta nuevamente.");
  }
});
