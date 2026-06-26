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
  if (!img) return;
  openLightbox(img);
}

function handleImageZoomKey(event) {
  if (event.key !== "Enter" && event.key !== " ") return;
  const frame = event.target.closest(".markdown-image-card__frame");
  if (!frame) return;
  event.preventDefault();
  const img = frame.querySelector(".markdown-image-card__img");
  if (img) openLightbox(img);
}

document.addEventListener("click", handleImageZoom);
document.addEventListener("keydown", handleImageZoomKey);
