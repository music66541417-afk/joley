const socket = io();

const image =
  document.getElementById("photoScreenImage");

const video =
  document.getElementById("photoScreenVideo");

const caption =
  document.getElementById("photoScreenCaption");

const empty =
  document.getElementById("photoScreenEmpty");

const loading =
  document.getElementById("photoScreenLoading");

const loadingText =
  loading?.querySelector("span");

const floor =
  location.pathname.endsWith("/2")
    ? 2
    : 1;

let mediaItems = [];
let currentIndex = 0;
let imageTimer = null;
let loadingTimeout = null;

let activeMediaId = null;
let isPlayingVideo = false;
let isChangingMedia = false;
let loadRequestRunning = false;

// Evita procesar eventos antiguos
// cuando ya cambió el archivo.
let playbackToken = 0;

function getSeconds() {
  const saved = Number(
    localStorage.getItem(
      `gallerySecondsFloor${floor}`
    )
  );

  if (
    Number.isFinite(saved) &&
    saved >= 3 &&
    saved <= 60
  ) {
    return saved;
  }

  return 5;
}

function clearImageTimer() {
  if (imageTimer) {
    clearTimeout(imageTimer);
    imageTimer = null;
  }
}

function clearLoadingTimeout() {
  if (loadingTimeout) {
    clearTimeout(loadingTimeout);
    loadingTimeout = null;
  }
}

function showLoading(
  message = "Cargando video…"
) {
  if (!loading) {
    return;
  }

  if (loadingText) {
    loadingText.textContent = message;
  }

  loading.style.display = "flex";
}

function hideLoading() {
  clearLoadingTimeout();

  if (loading) {
    loading.style.display = "none";
  }
}

function hideCaption() {
  caption.textContent = "";
  caption.style.display = "none";
}

function showCaption(item) {
  const senderName =
    String(item?.name || "").trim();

  if (!senderName) {
    hideCaption();
    return;
  }

  caption.textContent =
    `Enviado por ${senderName}`;

  caption.style.display = "block";
}

function hideImage() {
  image.onload = null;
  image.onerror = null;

  image.removeAttribute("src");
  image.style.transform = "";
  image.style.width = "";
  image.style.height = "";
  image.style.inset = "";
  image.style.left = "";
  image.style.top = "";
  image.style.display = "none";
}

function applyImageRotation(item) {
  const rotation =
    [0, 90, 180, 270].includes(Number(item?.rotation))
      ? Number(item.rotation)
      : 0;

  const isSideways =
    rotation === 90 || rotation === 270;

  image.style.inset = "auto";
  image.style.left = "50%";
  image.style.top = "50%";
  image.style.width = isSideways
    ? "100vh"
    : "100vw";
  image.style.height = isSideways
    ? "100vw"
    : "100vh";
  image.style.transform =
    `translate(-50%, -50%) rotate(${rotation}deg)`;
}

function stopVideo() {
  isPlayingVideo = false;

  video.onloadedmetadata = null;
  video.onloadeddata = null;
  video.oncanplay = null;
  video.onplaying = null;
  video.onwaiting = null;
  video.onstalled = null;
  video.onended = null;
  video.onerror = null;

  try {
    video.pause();
  } catch {
    // No hacer nada.
  }

  video.removeAttribute("src");
  video.load();
  video.style.display = "none";

  hideLoading();
}

function hideAllMedia() {
  clearImageTimer();
  hideImage();
  stopVideo();
}

function showEmpty() {
  playbackToken += 1;

  hideAllMedia();
  hideCaption();

  activeMediaId = null;
  currentIndex = 0;
  isChangingMedia = false;

  empty.style.display = "flex";
}

function scheduleMoveToNext(delay = 0) {
  window.setTimeout(() => {
    moveToNext();
  }, delay);
}

function moveToNext() {
  if (isChangingMedia) {
    return;
  }

  isChangingMedia = true;
  playbackToken += 1;

  hideAllMedia();

  if (mediaItems.length === 0) {
    showEmpty();
    return;
  }

  currentIndex =
    (currentIndex + 1) %
    mediaItems.length;

  isChangingMedia = false;

  showCurrentMedia();
}

function showImage(item, token) {
  clearImageTimer();
  stopVideo();
  hideImage();
  hideLoading();

  image.onload = () => {
    if (token !== playbackToken) {
      return;
    }

    image.style.display = "block";

    imageTimer = setTimeout(
      moveToNext,
      getSeconds() * 1000
    );
  };

  image.onerror = () => {
    if (token !== playbackToken) {
      return;
    }

    console.error(
      "No se pudo cargar la imagen:",
      item.mediaUrl
    );

    scheduleMoveToNext(1000);
  };

  image.alt =
    `Foto enviada por ${
      item.name || "cliente"
    }`;

  applyImageRotation(item);

  image.src =
    `${item.mediaUrl}?v=${Date.now()}`;
}

function showVideo(item, token) {
  clearImageTimer();
  hideImage();
  stopVideo();

  isPlayingVideo = true;

  /*
    Se mantiene muted porque Chrome,
    Android TV y Smart TV normalmente
    bloquean autoplay con sonido.
  */
  video.muted = false;
  video.autoplay = true;
  video.playsInline = true;
  video.controls = true;
  video.preload = "auto";

  video.style.display = "none";

  showLoading("Cargando video…");

  let playRequested = false;
  let playbackStarted = false;

  loadingTimeout = setTimeout(() => {
    if (
      token === playbackToken &&
      !playbackStarted
    ) {
      showLoading(
        "La conexión está tardando…"
      );
    }
  }, 5000);

  async function startPlayback() {
    if (
      token !== playbackToken ||
      playRequested ||
      playbackStarted
    ) {
      return;
    }

    playRequested = true;

    try {
      video.currentTime = 0;

      await video.play();

      if (token !== playbackToken) {
        return;
      }

      playbackStarted = true;
      isPlayingVideo = true;

      video.style.display = "block";
      hideLoading();

      console.log(
        "Video reproduciendo:",
        item.mediaUrl
      );
    } catch (error) {
      playRequested = false;
      isPlayingVideo = false;

      console.error(
        "No se pudo iniciar el video:",
        error
      );

      showLoading(
        "No se pudo reproducir el video"
      );

      scheduleMoveToNext(1800);
    }
  }

  video.onloadedmetadata = () => {
    if (token !== playbackToken) {
      return;
    }

    console.log("Video cargado:", {
      duration: video.duration,
      width: video.videoWidth,
      height: video.videoHeight,
      url: item.mediaUrl,
    });
  };

  video.onloadeddata = () => {
    startPlayback();
  };

  video.oncanplay = () => {
    startPlayback();
  };

  video.onplaying = () => {
    if (token !== playbackToken) {
      return;
    }

    playbackStarted = true;
    isPlayingVideo = true;

    video.style.display = "block";
    hideLoading();
  };

  video.onwaiting = () => {
    if (token !== playbackToken) {
      return;
    }

    showLoading("Cargando video…");
  };

  video.onstalled = () => {
    if (token !== playbackToken) {
      return;
    }

    showLoading(
      "La conexión está lenta…"
    );
  };

  video.onended = () => {
    if (token !== playbackToken) {
      return;
    }

    isPlayingVideo = false;
    moveToNext();
  };

  video.onerror = () => {
    if (token !== playbackToken) {
      return;
    }

    isPlayingVideo = false;

    console.error(
      "Error reproduciendo video:",
      video.error,
      item.mediaUrl
    );

    showLoading(
      "No se pudo cargar el video"
    );

    scheduleMoveToNext(1800);
  };

  video.src =
    `${item.mediaUrl}?v=${Date.now()}`;

  video.load();
}

function showCurrentMedia() {
  clearImageTimer();

  if (mediaItems.length === 0) {
    showEmpty();
    return;
  }

  if (
    currentIndex < 0 ||
    currentIndex >= mediaItems.length
  ) {
    currentIndex = 0;
  }

  const item =
    mediaItems[currentIndex];

  if (!item?.mediaUrl) {
    console.error(
      "Archivo sin mediaUrl:",
      item
    );

    scheduleMoveToNext(800);
    return;
  }

  const token =
    ++playbackToken;

  activeMediaId =
    Number(item.id);

  empty.style.display = "none";

  showCaption(item);

  console.log(
    "Mostrando archivo:",
    item
  );

  if (item.mediaType === "video") {
    showVideo(item, token);
    return;
  }

  showImage(item, token);
}

function sameQueue(first, second) {
  if (
    !Array.isArray(first) ||
    !Array.isArray(second) ||
    first.length !== second.length
  ) {
    return false;
  }

  return first.every(
    (item, index) =>
      Number(item.id) ===
      Number(second[index]?.id)
  );
}

async function loadMedia({
  forceRender = false,
} = {}) {
  if (loadRequestRunning) {
    return;
  }

  loadRequestRunning = true;

  try {
    const response = await fetch(
      `/api/gallery/screen/${floor}/photos`,
      {
        cache: "no-store",
      }
    );

    let data;

    try {
      data = await response.json();
    } catch {
      data = null;
    }

    if (!response.ok || !data?.ok) {
      throw new Error(
        data?.error ||
        "No se pudo cargar la presentación."
      );
    }

    const newItems =
      Array.isArray(data.photos)
        ? data.photos
        : [];

    if (newItems.length === 0) {
      mediaItems = [];
      showEmpty();
      return;
    }

    const queueChanged =
      !sameQueue(
        mediaItems,
        newItems
      );

    const previousId =
      activeMediaId;

    mediaItems = newItems;

    const previousIndex =
      mediaItems.findIndex(
        (item) =>
          Number(item.id) ===
          Number(previousId)
      );

    if (previousIndex >= 0) {
      currentIndex =
        previousIndex;
    } else if (
      currentIndex >=
      mediaItems.length
    ) {
      currentIndex = 0;
    }

    /*
      No reiniciar un video que ya está
      reproduciéndose por una actualización
      periódica de la cola.
    */
    if (
      isPlayingVideo &&
      previousIndex >= 0 &&
      !forceRender
    ) {
      return;
    }

    /*
      Tampoco reiniciar una foto si la cola
      no cambió durante la consulta periódica.
    */
    if (
      !forceRender &&
      !queueChanged &&
      activeMediaId !== null
    ) {
      return;
    }

    showCurrentMedia();
  } catch (error) {
    console.error(
      "Error cargando la cola:",
      error
    );

    /*
      Si ya se estaba mostrando algo,
      no vaciamos la pantalla por un fallo
      temporal de red.
    */
    if (mediaItems.length === 0) {
      showEmpty();
    }
  } finally {
    loadRequestRunning = false;
  }
}

socket.on(
  "gallery:update",
  (payload) => {
    if (
      Number(payload?.floor) === floor
    ) {
      loadMedia({
        forceRender:
          payload?.action === "rotation",
      });
    }
  }
);

socket.on("connect", () => {
  loadMedia({
    forceRender:
      mediaItems.length === 0,
  });
});

window.addEventListener(
  "storage",
  (event) => {
    if (
      event.key !==
      `gallerySecondsFloor${floor}`
    ) {
      return;
    }

    const currentItem =
      mediaItems[currentIndex];

    if (
      currentItem &&
      currentItem.mediaType !== "video"
    ) {
      playbackToken += 1;
      showCurrentMedia();
    }
  }
);

document.addEventListener(
  "visibilitychange",
  () => {
    if (document.hidden) {
      clearImageTimer();

      if (!video.paused) {
        video.pause();
      }

      return;
    }

    const currentItem =
      mediaItems[currentIndex];

    if (
      currentItem?.mediaType === "video" &&
      video.src
    ) {
      video
        .play()
        .catch((error) => {
          console.error(
            "No se pudo reanudar el video:",
            error
          );
        });

      return;
    }

    if (mediaItems.length > 0) {
      playbackToken += 1;
      showCurrentMedia();
    }
  }
);

window.addEventListener(
  "beforeunload",
  () => {
    playbackToken += 1;
    hideAllMedia();
  }
);

setInterval(() => {
  loadMedia({
    forceRender: false,
  });
}, 15000);

loadMedia({
  forceRender: true,
});