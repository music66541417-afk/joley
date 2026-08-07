const MAX_FILES = 2;
const MAX_IMAGE_SIZE = 20 * 1024 * 1024;
const MAX_VIDEO_SIZE = 60 * 1024 * 1024;

const input = document.getElementById("photoFiles");
const preview = document.getElementById("photoPreview");
const counter = document.getElementById("photoCounter");
const form = document.getElementById("photoForm");

const submitBtn = form.querySelector(
  "button[type='submit']"
);

const toast = document.getElementById("photoToast");
const floorLabel = document.getElementById("floorLabel");
const backBtn = document.getElementById("backBtn");

const nameInput = document.getElementById("photoName");
const tableInput = document.getElementById("photoTable");

const floor = location.pathname.startsWith("/piso2/")
  ? 2
  : 1;

floorLabel.textContent = "GALERÍA DE FOTOS Y VIDEOS";

backBtn.addEventListener("click", () => {
  location.href = `/piso${floor}`;
});

let selectedMedia = [];
let previewUrls = [];

tableInput.addEventListener("input", () => {
  tableInput.value = tableInput.value
    .replace(/[^\d]/g, "")
    .slice(0, 2);
});

function showToast(message, type = "") {
  toast.textContent = message;
  toast.classList.remove("success", "error");

  if (type) {
    toast.classList.add(type);
  }
}

function releasePreviewUrls() {
  for (const url of previewUrls) {
    URL.revokeObjectURL(url);
  }

  previewUrls = [];
}

function updateSubmitButton() {
  submitBtn.disabled = selectedMedia.length === 0;
}

function renderPreview() {
  releasePreviewUrls();
  preview.innerHTML = "";

  counter.textContent =
    `${selectedMedia.length} de ${MAX_FILES} seleccionados`;

  updateSubmitButton();

  selectedMedia.forEach((file, index) => {
    const item = document.createElement("div");
    item.className = "photo-preview-item";

    const objectUrl = URL.createObjectURL(file);
    previewUrls.push(objectUrl);

    let mediaElement;

    if (file.type.startsWith("video/")) {
      mediaElement = document.createElement("video");
      mediaElement.src = objectUrl;
      mediaElement.muted = true;
      mediaElement.playsInline = true;
      mediaElement.controls = true;
      mediaElement.preload = "metadata";
    } else {
      mediaElement = document.createElement("img");
      mediaElement.src = objectUrl;
      mediaElement.alt =
        `Imagen seleccionada ${index + 1}`;
    }

    const removeButton =
      document.createElement("button");

    removeButton.type = "button";
    removeButton.textContent = "×";
    removeButton.title = "Quitar archivo";

    removeButton.setAttribute(
      "aria-label",
      `Quitar archivo ${index + 1}`
    );

    removeButton.addEventListener("click", () => {
      selectedMedia.splice(index, 1);
      renderPreview();
    });

    item.appendChild(mediaElement);
    item.appendChild(removeButton);
    preview.appendChild(item);
  });
}

input.addEventListener("change", () => {
  showToast("");

  const incomingFiles = Array.from(
    input.files || []
  );

  if (incomingFiles.length === 0) {
    return;
  }

  const validFiles = [];

  for (const file of incomingFiles) {
    const isImage = file.type.startsWith("image/");
    const isVideo = file.type.startsWith("video/");

    if (!isImage && !isVideo) {
      showToast(
        `"${file.name}" no es una imagen ni un video válido.`,
        "error"
      );
      continue;
    }

    if (isImage && file.size > MAX_IMAGE_SIZE) {
      showToast(
        `La imagen "${file.name}" supera los 8 MB.`,
        "error"
      );
      continue;
    }

    if (isVideo && file.size > MAX_VIDEO_SIZE) {
      showToast(
        `El video "${file.name}" supera los 60 MB.`,
        "error"
      );
      continue;
    }

    validFiles.push(file);
  }

  const combined = [
    ...selectedMedia,
    ...validFiles,
  ];

  if (combined.length > MAX_FILES) {
    showToast(
      "Solo puedes seleccionar hasta 5 archivos.",
      "error"
    );
  }

  selectedMedia = combined.slice(0, MAX_FILES);

  renderPreview();

  // Permite seleccionar nuevamente el mismo archivo.
  input.value = "";
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  showToast("");

  const name = nameInput.value.trim();
  const table = tableInput.value.trim();

  const validName =
    /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ ]+$/.test(name);

  if (
    !name ||
    name.length > 40 ||
    !validName
  ) {
    showToast(
      "El nombre solo puede contener letras y espacios.",
      "error"
    );
    return;
  }

  const tableNumber = Number(table);

  if (
    !Number.isInteger(tableNumber) ||
    tableNumber < 1 ||
    tableNumber > 55
  ) {
    showToast(
      "El número de mesa debe estar entre 1 y 55.",
      "error"
    );
    return;
  }

  if (selectedMedia.length === 0) {
    showToast(
      "Selecciona al menos una foto o video.",
      "error"
    );
    return;
  }

  if (selectedMedia.length > MAX_FILES) {
    showToast(
      "Solo puedes enviar hasta 5 archivos.",
      "error"
    );
    return;
  }

  const formData = new FormData();

  formData.append("name", name);
  formData.append("table", table);

  for (const file of selectedMedia) {
    formData.append(
      "media",
      file,
      file.name
    );
  }

  const endpoint =
    floor === 2
      ? "/api/photos/piso2"
      : "/api/photos/piso1";

  const originalText = submitBtn.textContent;

  submitBtn.disabled = true;
  submitBtn.textContent = "Enviando...";

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      body: formData,
    });

    let data = null;

    try {
      data = await response.json();
    } catch {
      data = null;
    }

    if (!response.ok || !data?.ok) {
      throw new Error(
        data?.error ||
        "No se pudieron enviar los archivos."
      );
    }

    showToast(
      data.message ||
      "Archivos enviados correctamente.",
      "success"
    );

    selectedMedia = [];
    form.reset();
    renderPreview();
  } catch (error) {
    showToast(
      error.message ||
      "No se pudieron enviar los archivos.",
      "error"
    );
  } finally {
    submitBtn.textContent = originalText;
    updateSubmitButton();
  }
});

window.addEventListener("beforeunload", () => {
  releasePreviewUrls();
});