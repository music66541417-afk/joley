const socket = io();

const pendingBadge =
  document.getElementById("galleryPendingBadge");

const pendingPhotos =
  document.getElementById("pendingPhotos");

const approvedPhotos =
  document.getElementById("approvedPhotos");

const pendingEmpty =
  document.getElementById("pendingEmpty");

const approvedEmpty =
  document.getElementById("approvedEmpty");

const refreshBtn =
  document.getElementById("galleryRefreshBtn");

const backBtn =
  document.getElementById("galleryBackBtn");

const openScreenBtn =
  document.getElementById("openPhotoScreenBtn");

const secondsSelect =
  document.getElementById("photoSeconds");

const toast =
  document.getElementById("galleryToast");

// Detectar qué DJ abrió esta página
const isDj2 =
  location.pathname.startsWith("/dj2/");

const floor = isDj2 ? 2 : 1;

const djRoute = isDj2
  ? "/dj2"
  : "/dj";

const screenRoute =
  `/pantalla-fotos/${floor}`;

// Volver al panel correcto
backBtn.addEventListener("click", () => {
  location.href = djRoute;
});

// Abrir pantalla pública
openScreenBtn.href = screenRoute;

// Recargar manualmente
refreshBtn.addEventListener("click", () => {
  loadGallery();
});

function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[character]
  );
}

function showToast(message, type = "") {
  toast.textContent = message;

  toast.classList.remove(
    "success",
    "error"
  );

  if (type) {
    toast.classList.add(type);
  }

  if (message) {
    setTimeout(() => {
      if (toast.textContent === message) {
        toast.textContent = "";

        toast.classList.remove(
          "success",
          "error"
        );
      }
    }, 3500);
  }
}

function formatDate(value) {
  try {
    return new Date(value).toLocaleString(
      "es-CL",
      {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }
    );
  } catch {
    return "";
  }
}

function createMediaPreview(photo, altText) {
  if (photo.mediaType === "video") {
    const video =
      document.createElement("video");

    video.src = photo.mediaUrl;
    video.controls = true;
    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";

    return video;
  }

  const image =
    document.createElement("img");

  image.src = photo.mediaUrl;
  image.alt = altText;
  image.loading = "lazy";
  image.style.transform =
    `rotate(${Number(photo.rotation) || 0}deg)`;
  image.style.transition =
    "transform 0.25s ease";

  return image;
}

async function rotatePhoto(photo, direction, card) {
  const currentRotation =
    Number(photo.rotation) || 0;

  const newRotation =
    direction === "left"
      ? (currentRotation + 270) % 360
      : (currentRotation + 90) % 360;

  const buttons =
    card.querySelectorAll("[data-rotate]");

  buttons.forEach((button) => {
    button.disabled = true;
  });

  try {
    const response = await fetch(
      `/api/dj/gallery/photos/${photo.id}/rotation`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          rotation: newRotation,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(
        data.error || "No se pudo guardar el giro."
      );
    }

    photo.rotation = newRotation;

    const image = card.querySelector(
      ".gallery-photo-image img"
    );

    if (image) {
      image.style.transform =
        `rotate(${newRotation}deg)`;
    }

    showToast("Orientación guardada.", "success");
  } catch (error) {
    showToast(
      error.message || "No se pudo girar la fotografía.",
      "error"
    );
  } finally {
    buttons.forEach((button) => {
      button.disabled = false;
    });
  }
}

async function changePhotoStatus(
  id,
  status,
  button
) {
  const previousText =
    button?.textContent || "";

  if (button) {
    button.disabled = true;
    button.textContent = "Procesando...";
  }

  try {
    const response = await fetch(
      `/api/dj/gallery/photos/${id}/status`,
      {
        method: "PATCH",

        headers: {
          "Content-Type":
            "application/json",
        },

        body: JSON.stringify({
          status,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(
        data.error ||
          "No se pudo actualizar el archivo."
      );
    }

    const messages = {
      approved: "Archivo aprobado.",
      rejected: "Archivo rechazado.",
      played:
        "Archivo retirado de la presentación.",
    };

    showToast(
      messages[status] ||
        "Archivo actualizado.",
      "success"
    );

    await loadGallery();
  } catch (error) {
    showToast(
      error.message ||
        "No se pudo actualizar el archivo.",
      "error"
    );

    if (button) {
      button.disabled = false;
      button.textContent = previousText;
    }
  }
}

function createPendingCard(photo) {
  const card =
    document.createElement("article");

  card.className =
    "gallery-photo-card";

  const rotationControls =
    photo.mediaType === "video"
      ? ""
      : `
        <div class="gallery-rotation-row">
          <button
            type="button"
            class="gallery-rotate-btn"
            data-rotate="left"
            title="Girar a la izquierda"
            aria-label="Girar a la izquierda"
          >
            ↶
          </button>

          <button
            type="button"
            class="gallery-rotate-btn"
            data-rotate="right"
            title="Girar a la derecha"
            aria-label="Girar a la derecha"
          >
            ↷
          </button>
        </div>
      `;

  card.innerHTML = `
    <div class="gallery-photo-image"></div>

    <div class="gallery-photo-content">

      <div class="gallery-photo-name">
        ${escapeHtml(photo.name)}
      </div>

      <div class="gallery-photo-date">
        ${escapeHtml(
          formatDate(photo.createdAt)
        )}
      </div>

      <div class="gallery-photo-buttons">
        <button
          type="button"
          class="gallery-approve-btn"
          data-action="approved"
        >
          Aprobar
        </button>

        <button
          type="button"
          class="gallery-reject-btn"
          data-action="rejected"
        >
          Rechazar
        </button>

      </div>

      ${rotationControls}

    </div>
  `;

  const mediaContainer =
    card.querySelector(
      ".gallery-photo-image"
    );

  mediaContainer.appendChild(
    createMediaPreview(
      photo,
      `Archivo enviado por ${photo.name}`
    )
  );

  const approveButton =
    card.querySelector(
      '[data-action="approved"]'
    );

  const rejectButton =
    card.querySelector(
      '[data-action="rejected"]'
    );

  approveButton.addEventListener(
    "click",
    () => {
      changePhotoStatus(
        photo.id,
        "approved",
        approveButton
      );
    }
  );

  rejectButton.addEventListener(
    "click",
    () => {
      const confirmed = confirm(
        `¿Rechazar el archivo enviado por ${photo.name}?`
      );

      if (!confirmed) return;

      changePhotoStatus(
        photo.id,
        "rejected",
        rejectButton
      );
    }
  );

  if (photo.mediaType !== "video") {
    const rotateLeftButton =
      card.querySelector('[data-rotate="left"]');

    const rotateRightButton =
      card.querySelector('[data-rotate="right"]');

    rotateLeftButton.addEventListener(
      "click",
      () => rotatePhoto(photo, "left", card)
    );

    rotateRightButton.addEventListener(
      "click",
      () => rotatePhoto(photo, "right", card)
    );
  }

  return card;
}

function createApprovedCard(
  photo,
  index
) {
  const card =
    document.createElement("article");

  card.className =
    "gallery-photo-card gallery-approved-card";

  card.innerHTML = `
    <div class="gallery-queue-number">
      #${index + 1}
    </div>

    <div class="gallery-photo-image"></div>

    <div class="gallery-photo-content">

      <div class="gallery-photo-name">
        ${escapeHtml(photo.name)}
      </div>

      <div class="gallery-photo-date">
        En la cola de reproducción
      </div>

      <div class="gallery-photo-buttons">

        <button
          type="button"
          class="gallery-played-btn"
          data-action="played"
        >
          ✓ Dejar de mostrar
        </button>

      </div>

    </div>
  `;

  const mediaContainer =
    card.querySelector(
      ".gallery-photo-image"
    );

  mediaContainer.appendChild(
    createMediaPreview(
      photo,
      `Archivo aprobado enviado por ${photo.name}`
    )
  );

  const playedButton =
    card.querySelector(
      '[data-action="played"]'
    );

  playedButton.addEventListener(
    "click",
    () => {
      changePhotoStatus(
        photo.id,
        "played",
        playedButton
      );
    }
  );

  return card;
}

function renderGallery(data) {
  const pending =
    Array.isArray(data.pending)
      ? data.pending
      : [];

  const approved =
    Array.isArray(data.approved)
      ? data.approved
      : [];

  pendingBadge.textContent =
    `${pending.length} pendientes`;

  pendingPhotos.innerHTML = "";
  approvedPhotos.innerHTML = "";

  pendingEmpty.style.display =
    pending.length === 0
      ? "block"
      : "none";

  approvedEmpty.style.display =
    approved.length === 0
      ? "block"
      : "none";

  for (const photo of pending) {
    pendingPhotos.appendChild(
      createPendingCard(photo)
    );
  }

  approved.forEach(
    (photo, index) => {
      approvedPhotos.appendChild(
        createApprovedCard(
          photo,
          index
        )
      );
    }
  );
}

async function loadGallery() {
  refreshBtn.disabled = true;

  try {
    const response = await fetch(
      "/api/dj/gallery/photos",
      {
        cache: "no-store",
      }
    );

    const data = await response.json();

    if (response.status === 401) {
      location.href =
        `/login?next=${encodeURIComponent(
          location.pathname
        )}`;

      return;
    }

    if (!response.ok || !data.ok) {
      throw new Error(
        data.error ||
          "No se pudo cargar la galería."
      );
    }

    renderGallery(data);
  } catch (error) {
    showToast(
      error.message ||
        "No se pudo cargar la galería.",
      "error"
    );
  } finally {
    refreshBtn.disabled = false;
  }
}

// Guardar segundos elegidos
secondsSelect.addEventListener(
  "change",
  () => {
    localStorage.setItem(
      `gallerySecondsFloor${floor}`,
      secondsSelect.value
    );

    showToast(
      `Cambio automático configurado en ${secondsSelect.value} segundos.`,
      "success"
    );
  }
);

const savedSeconds =
  localStorage.getItem(
    `gallerySecondsFloor${floor}`
  );

if (savedSeconds) {
  secondsSelect.value = savedSeconds;
}

// Actualizar cuando llega un archivo
// o cambia su estado
socket.on(
  "gallery:update",
  (payload) => {
    const updatedFloor =
      Number(payload?.floor);

    if (updatedFloor === floor) {
      loadGallery();
    }
  }
);

socket.on("connect", () => {
  loadGallery();
});

setInterval(
  loadGallery,
  15000
);

loadGallery();