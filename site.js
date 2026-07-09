/* SPEED site-assets: 2026-07-08-lightbox-zoom-v1 */
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
  const ZOOM_LEVELS = [1, 1.25, 1.5, 2, 2.5, 3, 4];

  const overlay = document.createElement("div");
  overlay.className = "markdown-lightbox";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Imagen ampliada");

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "markdown-lightbox__close";
  closeBtn.setAttribute("aria-label", "Cerrar");
  closeBtn.innerHTML = "&times;";

  const viewport = document.createElement("div");
  viewport.className = "markdown-lightbox__viewport";

  const zoomImg = document.createElement("img");
  zoomImg.className = "markdown-lightbox__img";
  zoomImg.src = img.currentSrc || img.src;
  zoomImg.alt = img.alt || "";
  zoomImg.draggable = false;

  const controls = document.createElement("div");
  controls.className = "markdown-lightbox__controls";
  controls.innerHTML = `
    <button type="button" class="markdown-lightbox__tool" data-action="zoom-out" aria-label="Alejar">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
        <circle cx="11" cy="11" r="7"></circle>
        <path d="M21 21l-4.3-4.3"></path>
        <path d="M8 11h6"></path>
      </svg>
    </button>
    <span class="markdown-lightbox__zoom-label" aria-live="polite">100%</span>
    <button type="button" class="markdown-lightbox__tool" data-action="zoom-in" aria-label="Acercar">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
        <circle cx="11" cy="11" r="7"></circle>
        <path d="M21 21l-4.3-4.3"></path>
        <path d="M11 8v6"></path>
        <path d="M8 11h6"></path>
      </svg>
    </button>
    <button type="button" class="markdown-lightbox__tool markdown-lightbox__tool--text" data-action="reset">
      Ajustar
    </button>
  `;

  const zoomLabel = controls.querySelector(".markdown-lightbox__zoom-label");
  const zoomInBtn = controls.querySelector('[data-action="zoom-in"]');
  const zoomOutBtn = controls.querySelector('[data-action="zoom-out"]');

  let levelIndex = 0;
  let baseWidth = 0;

  const applyZoom = () => {
    if (!baseWidth) return;
    const level = ZOOM_LEVELS[levelIndex];
    zoomImg.style.width = `${Math.round(baseWidth * level)}px`;
    zoomImg.style.height = "auto";
    zoomLabel.textContent = `${Math.round(level * 100)}%`;
    viewport.classList.toggle("is-zoomed", level > 1);
    zoomOutBtn.disabled = levelIndex === 0;
    zoomInBtn.disabled = levelIndex === ZOOM_LEVELS.length - 1;
  };

  const fitToViewport = () => {
    const nw = zoomImg.naturalWidth;
    const nh = zoomImg.naturalHeight;
    if (!nw || !nh) return;

    const padding = 40;
    const vw = Math.max(viewport.clientWidth - padding, 200);
    const vh = Math.max(viewport.clientHeight - padding, 200);
    const fitRatio = Math.min(vw / nw, vh / nh);
    baseWidth = nw * fitRatio;
    applyZoom();
  };

  const zoomIn = () => {
    if (levelIndex >= ZOOM_LEVELS.length - 1) return;
    levelIndex += 1;
    applyZoom();
  };

  const zoomOut = () => {
    if (levelIndex <= 0) return;
    levelIndex -= 1;
    applyZoom();
  };

  const resetZoom = () => {
    levelIndex = 0;
    applyZoom();
    viewport.scrollTo({ top: 0, left: 0, behavior: "smooth" });
  };

  const close = () => {
    window.removeEventListener("resize", fitToViewport);
    document.removeEventListener("keydown", onKey);
    overlay.remove();
    document.body.style.overflow = "";
  };

  const onKey = (event) => {
    if (event.key === "Escape") {
      close();
      return;
    }
    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      zoomIn();
    }
    if (event.key === "-") {
      event.preventDefault();
      zoomOut();
    }
    if (event.key === "0") {
      event.preventDefault();
      resetZoom();
    }
  };

  controls.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-action]");
    if (!btn || btn.disabled) return;
    event.stopPropagation();
    const action = btn.dataset.action;
    if (action === "zoom-in") zoomIn();
    if (action === "zoom-out") zoomOut();
    if (action === "reset") resetZoom();
  });

  closeBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    close();
  });

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) close();
  });

  viewport.addEventListener("click", (event) => event.stopPropagation());
  controls.addEventListener("click", (event) => event.stopPropagation());
  zoomImg.addEventListener("click", (event) => event.stopPropagation());

  zoomImg.addEventListener("load", fitToViewport);
  if (zoomImg.complete) fitToViewport();
  window.addEventListener("resize", fitToViewport);
  document.addEventListener("keydown", onKey);

  viewport.append(zoomImg);
  overlay.append(closeBtn, viewport, controls);
  document.body.append(overlay);
  document.body.style.overflow = "hidden";
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
