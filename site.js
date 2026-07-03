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

  const zoomImg = document.createElement("img");
  zoomImg.className = "markdown-lightbox__img";
  zoomImg.src = img.currentSrc || img.src;
  zoomImg.alt = img.alt || "";

  const close = () => {
    overlay.remove();
    document.body.style.overflow = "";
    document.removeEventListener("keydown", onKey);
  };

  const onKey = (event) => {
    if (event.key === "Escape") close();
  };

  closeBtn.addEventListener("click", close);
  overlay.addEventListener("click", close);
  zoomImg.addEventListener("click", (event) => event.stopPropagation());
  document.addEventListener("keydown", onKey);

  overlay.append(closeBtn, zoomImg);
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
