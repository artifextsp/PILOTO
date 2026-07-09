function getImageFallbacks(img) {
  const raw = img.getAttribute("data-fallbacks");
  if (!raw) return [];
  return raw.split("|").map((part) => decodeURIComponent(part)).filter(Boolean);
}

function showImageError(frame, img) {
  const alt = img.alt?.trim();
  const original = img.getAttribute("data-original-src") || img.src;
  frame.innerHTML = `
    <div class="markdown-image-error">
      <p>No se pudo cargar la imagen${alt ? `: ${alt}` : ""}.</p>
      <p class="markdown-image-error__hint">
        Si usas Google Drive, comparte el archivo como «Cualquier persona con el enlace».
      </p>
      <a href="${original}" target="_blank" rel="noopener noreferrer">Abrir enlace original</a>
    </div>
  `;
  frame.closest(".markdown-image-card")?.classList.add("markdown-image-card--error");
}

function tryNextImageSource(img) {
  const fallbacks = getImageFallbacks(img);
  if (fallbacks.length === 0) return false;
  const [next, ...rest] = fallbacks;
  img.setAttribute("data-fallbacks", rest.map((u) => encodeURIComponent(u)).join("|"));
  img.src = next;
  return true;
}

function markImageLoadedIfReady(img) {
  if (!img.complete) return false;

  if (img.naturalWidth > 0) {
    img.classList.add("markdown-image-card__img--loaded");
    return true;
  }

  if (tryNextImageSource(img)) return true;

  const frame = img.closest(".markdown-image-card__frame");
  if (frame) showImageError(frame, img);
  return true;
}

function bindImageFallback(img) {
  if (img.dataset.fallbackBound === "true") return;
  img.dataset.fallbackBound = "true";
  if (!img.getAttribute("data-original-src")) {
    img.setAttribute("data-original-src", img.src);
  }

  img.addEventListener("error", () => {
    if (tryNextImageSource(img)) return;
    const frame = img.closest(".markdown-image-card__frame");
    if (frame) showImageError(frame, img);
  });

  img.addEventListener("load", () => {
    if (img.naturalWidth === 0) {
      if (!tryNextImageSource(img)) {
        const frame = img.closest(".markdown-image-card__frame");
        if (frame) showImageError(frame, img);
      }
    } else {
      img.classList.add("markdown-image-card__img--loaded");
    }
  });

  markImageLoadedIfReady(img);
}

function openLightbox(img) {
  const MIN_SCALE = 1;
  const MAX_SCALE = 4;
  const ZOOM_STEP = 0.35;

  const overlay = document.createElement("div");
  overlay.className = "markdown-lightbox";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Imagen ampliada");

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "markdown-lightbox__close";
  closeBtn.setAttribute("aria-label", "Cerrar");
  closeBtn.textContent = "×";

  const toolbar = document.createElement("div");
  toolbar.className = "markdown-lightbox__toolbar";
  toolbar.innerHTML = `
    <button type="button" class="markdown-lightbox__tool" data-action="zoom-out" aria-label="Alejar">−</button>
    <span class="markdown-lightbox__zoom-label" aria-live="polite">100%</span>
    <button type="button" class="markdown-lightbox__tool" data-action="zoom-in" aria-label="Acercar">+</button>
    <button type="button" class="markdown-lightbox__tool markdown-lightbox__tool--text" data-action="reset">
      Ajustar
    </button>
  `;

  const viewport = document.createElement("div");
  viewport.className = "markdown-lightbox__viewport";

  const stage = document.createElement("div");
  stage.className = "markdown-lightbox__stage";

  const zoomImg = document.createElement("img");
  zoomImg.className = "markdown-lightbox__img";
  zoomImg.src = img.currentSrc || img.src;
  zoomImg.alt = img.alt || "";
  zoomImg.draggable = false;

  const hint = document.createElement("p");
  hint.className = "markdown-lightbox__hint";
  hint.textContent = "Usa +/−, la rueda del mouse o pellizco. Arrastra para mover cuando esté ampliada.";

  const zoomLabel = toolbar.querySelector(".markdown-lightbox__zoom-label");

  let scale = 1;
  let panX = 0;
  let panY = 0;
  let dragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let panStartX = 0;
  let panStartY = 0;
  let pinchStartDistance = 0;
  let pinchStartScale = 1;

  const clampPan = () => {
    if (scale <= 1) {
      panX = 0;
      panY = 0;
      return;
    }
    const rect = viewport.getBoundingClientRect();
    const maxX = (rect.width * (scale - 1)) / 2 + 48;
    const maxY = (rect.height * (scale - 1)) / 2 + 48;
    panX = Math.max(-maxX, Math.min(maxX, panX));
    panY = Math.max(-maxY, Math.min(maxY, panY));
  };

  const applyTransform = () => {
    clampPan();
    stage.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
    zoomLabel.textContent = `${Math.round(scale * 100)}%`;
    viewport.classList.toggle("is-pannable", scale > 1);
    toolbar.querySelector('[data-action="zoom-out"]').disabled = scale <= MIN_SCALE;
    toolbar.querySelector('[data-action="zoom-in"]').disabled = scale >= MAX_SCALE;
  };

  const setScale = (nextScale) => {
    scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, nextScale));
    if (scale === 1) {
      panX = 0;
      panY = 0;
    }
    applyTransform();
  };

  const zoomBy = (delta) => setScale(scale + delta);

  const resetZoom = () => setScale(1);

  const getTouchDistance = (touches) => {
    const [a, b] = touches;
    const dx = a.clientX - b.clientX;
    const dy = a.clientY - b.clientY;
    return Math.hypot(dx, dy);
  };

  const close = () => {
    overlay.remove();
    document.body.style.overflow = "";
    document.removeEventListener("keydown", onKey);
  };

  const onKey = (event) => {
    if (event.key === "Escape") {
      close();
      return;
    }
    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      zoomBy(ZOOM_STEP);
    }
    if (event.key === "-") {
      event.preventDefault();
      zoomBy(-ZOOM_STEP);
    }
    if (event.key === "0") {
      event.preventDefault();
      resetZoom();
    }
  };

  toolbar.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-action]");
    if (!btn) return;
    event.stopPropagation();
    const action = btn.dataset.action;
    if (action === "zoom-in") zoomBy(ZOOM_STEP);
    if (action === "zoom-out") zoomBy(-ZOOM_STEP);
    if (action === "reset") resetZoom();
  });

  viewport.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      const delta = event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
      zoomBy(delta);
    },
    { passive: false }
  );

  viewport.addEventListener("pointerdown", (event) => {
    if (scale <= 1 || event.button !== 0) return;
    dragging = true;
    dragStartX = event.clientX;
    dragStartY = event.clientY;
    panStartX = panX;
    panStartY = panY;
    viewport.setPointerCapture(event.pointerId);
    viewport.classList.add("is-dragging");
  });

  viewport.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    panX = panStartX + (event.clientX - dragStartX);
    panY = panStartY + (event.clientY - dragStartY);
    applyTransform();
  });

  const endDrag = (event) => {
    if (!dragging) return;
    dragging = false;
    viewport.classList.remove("is-dragging");
    if (event.pointerId != null) {
      try {
        viewport.releasePointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }
    }
  };

  viewport.addEventListener("pointerup", endDrag);
  viewport.addEventListener("pointercancel", endDrag);

  viewport.addEventListener(
    "touchstart",
    (event) => {
      if (event.touches.length === 2) {
        pinchStartDistance = getTouchDistance(event.touches);
        pinchStartScale = scale;
      }
    },
    { passive: true }
  );

  viewport.addEventListener(
    "touchmove",
    (event) => {
      if (event.touches.length !== 2 || !pinchStartDistance) return;
      event.preventDefault();
      const distance = getTouchDistance(event.touches);
      const ratio = distance / pinchStartDistance;
      setScale(pinchStartScale * ratio);
    },
    { passive: false }
  );

  viewport.addEventListener("touchend", () => {
    pinchStartDistance = 0;
  });

  closeBtn.addEventListener("click", close);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) close();
  });

  stage.addEventListener("click", (event) => event.stopPropagation());
  toolbar.addEventListener("click", (event) => event.stopPropagation());
  document.addEventListener("keydown", onKey);

  stage.append(zoomImg);
  viewport.append(stage);
  overlay.append(closeBtn, toolbar, viewport, hint);
  document.body.append(overlay);
  document.body.style.overflow = "hidden";
  applyTransform();
}

function handleImageZoom(event) {
  const frame = event.target.closest(".markdown-image-card__frame");
  if (!frame) return;
  const img = frame.querySelector(".markdown-image-card__img");
  if (!img || !img.classList.contains("markdown-image-card__img--loaded")) return;
  openLightbox(img);
}

function handleImageZoomKey(event) {
  if (event.key !== "Enter" && event.key !== " ") return;
  const frame = event.target.closest(".markdown-image-card__frame");
  if (!frame) return;
  event.preventDefault();
  const img = frame.querySelector(".markdown-image-card__img");
  if (img?.classList.contains("markdown-image-card__img--loaded")) openLightbox(img);
}

function initImageCards(root = document) {
  root.querySelectorAll(".markdown-image-card__img").forEach(bindImageFallback);
}

function initAccordionImages() {
  document.querySelectorAll("details.pv-card").forEach((details) => {
    details.addEventListener("toggle", () => {
      if (details.open) initImageCards(details);
    });
  });
}

document.addEventListener("click", handleImageZoom);
document.addEventListener("keydown", handleImageZoomKey);
initImageCards();
initAccordionImages();
