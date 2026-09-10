const form = document.getElementById("suggestionForm");

const floorLabel = document.getElementById("suggestionFloor");

const backBtn = document.getElementById("suggestionBackBtn");
const returnBtn = document.getElementById("suggestionReturnBtn");

const nameInput = document.getElementById("suggestionName");
const rutInput = document.getElementById("suggestionRut");
const emailInput = document.getElementById("suggestionEmail");
const categoryInput = document.getElementById("suggestionCategory");
const categoryButtons = document.querySelectorAll(".suggestion-category");

const messageInput = document.getElementById("suggestionMessage");
const charCount = document.getElementById("suggestionCharCount");


const statusBox = document.getElementById("suggestionStatus");
const submitBtn = document.getElementById("suggestionSubmitBtn");

const successBox = document.getElementById("suggestionSuccess");

/* ===========================
   DETECTAR PISO
=========================== */

function getFloorFromPath() {
  const path = window.location.pathname.toLowerCase();

  if (path.includes("/piso2/")) {
    return 2;
  }

  return 1;
}

const floor = getFloorFromPath();

if (floorLabel) {
  floorLabel.textContent = `PISO ${floor}`;
}

/* ===========================
   VOLVER AL MENÚ
=========================== */

function goBackToMenu() {
  window.location.href = floor === 2
    ? "/piso2"
    : "/piso1";
}

backBtn?.addEventListener("click", goBackToMenu);
returnBtn?.addEventListener("click", goBackToMenu);

/* ===========================
   SELECTOR DE CATEGORÍA
=========================== */

categoryButtons.forEach((button) => {
  button.addEventListener("click", () => {

    categoryButtons.forEach((item) => {
      item.classList.remove("active");
    });

    button.classList.add("active");

    if (categoryInput) {
      categoryInput.value =
        button.dataset.category || "";
    }

    setStatus("");
  });
});

/* ===========================
   CONTADOR 0 / 500
=========================== */

function updateCounter() {
  if (!messageInput || !charCount) return;

  const length = messageInput.value.length;

  charCount.textContent = String(length);
}

messageInput?.addEventListener("input", updateCounter);

updateCounter();

/* ===========================
   MENSAJES
=========================== */

function setStatus(message, type = "") {
  if (!statusBox) return;

  statusBox.textContent = message || "";

  statusBox.classList.remove(
    "success",
    "error"
  );

  if (type) {
    statusBox.classList.add(type);
  }
}

/* ===========================
   VALIDACIÓN
=========================== */

function normalizeRut(value) {
  return String(value || "")
    .replace(/\./g, "")
    .replace(/\s+/g, "")
    .toUpperCase();
}

function formatRut(value) {
  const clean = normalizeRut(value).replace(/-/g, "");

  if (clean.length < 2) return clean;

  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);
  const withDots = body.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

  return `${withDots}-${dv}`;
}

function isValidRut(value) {
  const clean = normalizeRut(value);

  if (!/^\d{7,8}-?[\dK]$/.test(clean)) {
    return false;
  }

  const parts = clean.replace(/-/g, "");
  const body = parts.slice(0, -1);
  const dv = parts.slice(-1);

  let sum = 0;
  let multiplier = 2;

  for (let i = body.length - 1; i >= 0; i--) {
    sum += Number(body[i]) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }

  const result = 11 - (sum % 11);
  const expected =
    result === 11 ? "0" :
    result === 10 ? "K" :
    String(result);

  return dv === expected;
}

rutInput?.addEventListener("blur", () => {
  if (rutInput.value.trim()) {
    rutInput.value = formatRut(rutInput.value);
  }
});

function validateForm() {
  const name = String(nameInput?.value || "").trim();
  const rut = String(rutInput?.value || "").trim();
  const email = String(emailInput?.value || "").trim().toLowerCase();
  const category = String(categoryInput?.value || "").trim();
  const message = String(messageInput?.value || "").trim();

  if (!name) {
    return { ok: false, error: "Escribe tu nombre." };
  }

  if (name.length > 40) {
    return { ok: false, error: "El nombre es demasiado largo." };
  }

  if (!rut) {
    return { ok: false, error: "Ingresa tu RUT." };
  }

  if (!isValidRut(rut)) {
    return { ok: false, error: "Ingresa un RUT válido." };
  }

  if (!email) {
    return { ok: false, error: "Ingresa tu correo electrónico." };
  }

  if (email.length > 120) {
    return { ok: false, error: "El correo electrónico es demasiado largo." };
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Ingresa un correo electrónico válido." };
  }

  if (!category) {
    return {
      ok: false,
      error: "Selecciona sobre qué quieres escribir."
    };
  }

  if (!message) {
    return {
      ok: false,
      error: "Cuéntanos tu experiencia antes de enviar."
    };
  }

  if (message.length > 500) {
    return {
      ok: false,
      error: "El comentario supera los 500 caracteres."
    };
  }

  return {
    ok: true,
    data: {
      name,
      rut: formatRut(rut),
      email,
      category,
      message
    }
  };
}

/* ===========================
   ENVIAR
=========================== */

form?.addEventListener(
  "submit",
  async (event) => {
    event.preventDefault();

    setStatus("");

    const validation = validateForm();

    if (!validation.ok) {
      setStatus(
        validation.error,
        "error"
      );
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent =
        "Enviando...";
    }

    try {
      const endpoint =
        floor === 2
          ? "/api/suggestions/piso2"
          : "/api/suggestions/piso1";

      const response = await fetch(
        endpoint,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json"
          },
          body: JSON.stringify(
            validation.data
          )
        }
      );

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(
          data.error ||
          "No se pudo enviar tu opinión."
        );
      }

      form.hidden = true;

      if (successBox) {
        successBox.hidden = false;
      }

      window.scrollTo({
        top: 0,
        behavior: "smooth"
      });

    } catch (error) {

      setStatus(
        error.message ||
          "Ocurrió un error al enviar.",
        "error"
      );

    } finally {

      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent =
          "Enviar opinión";
      }

    }
  }
);