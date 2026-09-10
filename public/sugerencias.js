const form = document.getElementById("suggestionForm");

const floorLabel = document.getElementById("suggestionFloor");

const backBtn = document.getElementById("suggestionBackBtn");
const returnBtn = document.getElementById("suggestionReturnBtn");

const nameInput = document.getElementById("suggestionName");
const categoryInput = document.getElementById("suggestionCategory");
const categoryButtons = document.querySelectorAll(".suggestion-category");

const messageInput = document.getElementById("suggestionMessage");
const charCount = document.getElementById("suggestionCharCount");

const wantsContact = document.getElementById("suggestionWantsContact");
const contactField = document.getElementById("suggestionContactField");
const contactInput = document.getElementById("suggestionContact");

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
   CONTACTO OPCIONAL
=========================== */

function updateContactVisibility() {
  if (!wantsContact || !contactField) return;

  const enabled = wantsContact.checked;

  contactField.hidden = !enabled;

  if (!enabled && contactInput) {
    contactInput.value = "";
  }
}

wantsContact?.addEventListener(
  "change",
  updateContactVisibility
);

updateContactVisibility();

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

function validateForm() {
  const name =
    String(nameInput?.value || "").trim();

  const category =
    String(categoryInput?.value || "").trim();

  const message =
    String(messageInput?.value || "").trim();

  const contact =
    String(contactInput?.value || "").trim();

  if (!name) {
    return {
      ok: false,
      error: "Escribe tu nombre."
    };
  }

  if (name.length > 40) {
    return {
      ok: false,
      error: "El nombre es demasiado largo."
    };
  }

  if (!category) {
    return {
      ok: false,
      error:
        "Selecciona sobre qué quieres escribir."
    };
  }

  if (!message) {
    return {
      ok: false,
      error:
        "Cuéntanos tu experiencia antes de enviar."
    };
  }

  if (message.length > 500) {
    return {
      ok: false,
      error:
        "El comentario supera los 500 caracteres."
    };
  }

  if (
    wantsContact?.checked &&
    !contact
  ) {
    return {
      ok: false,
      error:
        "Ingresa un teléfono o correo electrónico para que podamos contactarte."
    };
  }

  if (contact.length > 120) {
    return {
      ok: false,
      error:
        "El dato de contacto es demasiado largo."
    };
  }

  return {
    ok: true,
    data: {
      name,
      category,
      message,
      wantsContact:
        !!wantsContact?.checked,
      contact:
        wantsContact?.checked
          ? contact
          : ""
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