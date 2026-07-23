const SUPABASE_URL = "https://nbujvnrroerixivrmtxd.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5idWp2bnJyb2VyaXhpdnJtdHhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwNzM2NjUsImV4cCI6MjA5NzY0OTY2NX0.PqxtPsfExA_8BcXRIRmFz0ikcH7J_rNx4K0LKgcqaYY";

const BUCKET = "bitacora-evidencias";
const MAX_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png"];
const ALLOWED_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png"];

const STATUS_META = {
  pendiente: { label: "Pendiente de revisión", className: "is-pending" },
  aprobada: { label: "Aprobada", className: "is-approved" },
  rechazada: { label: "Rechazada", className: "is-rejected" },
};

let client;
let studentCode = "";
let uploading = false;

function getSavedCode() {
  return localStorage.getItem("speed_bitacora_code") || "";
}

function getRoot() {
  return document.getElementById("bitacora-root");
}

function sanitizeFileName(name) {
  const normalized = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return normalized.replace(/[^a-zA-Z0-9.\-_]/g, "_");
}

function formatSize(bytes) {
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function formatDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function hasAllowedExtension(fileName) {
  const lower = fileName.toLowerCase();
  return ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function renderLogin(message = "") {
  getRoot().innerHTML = `
    <div class="bitacora-public__card">
      <p>Ingresa tu código de estudiante para gestionar tu bitácora.</p>
      ${message ? `<p class="bitacora-public__empty">${message}</p>` : ""}
      <form class="bitacora-public__login" id="bitacora-login-form">
        <label for="bitacora-code-input">Código de 4 dígitos</label>
        <input
          id="bitacora-code-input"
          maxlength="4"
          inputmode="numeric"
          pattern="[0-9]{4}"
          placeholder="0000"
          value="${getSavedCode()}"
          autocomplete="off"
          required
        />
        <button type="submit">Entrar a mi bitácora</button>
      </form>
      <p class="bitacora-public__empty">Si no tienes código, pídeselo a tu docente.</p>
    </div>
  `;

  document.getElementById("bitacora-login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const code = document.getElementById("bitacora-code-input").value.trim();
    if (!/^\d{4}$/.test(code)) {
      alert("El código debe tener 4 dígitos.");
      return;
    }
    studentCode = code;
    localStorage.setItem("speed_bitacora_code", code);
    await loadMain();
  });
}

function renderEntries(entries) {
  if (!entries?.length) {
    return `<p class="bitacora-public__empty">Aún no has subido evidencias.</p>`;
  }
  const items = entries
    .map((item) => {
      const meta = STATUS_META[item.status] || STATUS_META.pendiente;
      return `
        <div class="bitacora-entry">
          <div class="bitacora-entry__head">
            <strong>${item.title || item.file_name}</strong>
            <span class="bitacora-status ${meta.className}">${meta.label}</span>
          </div>
          <div class="bitacora-entry__meta">
            ${formatSize(item.file_size)} · ${formatDate(item.created_at)}
          </div>
          ${item.description ? `<p class="bitacora-entry__desc">${item.description}</p>` : ""}
          ${
            item.reviewer_comment
              ? `<p class="bitacora-entry__comment"><strong>Comentario del docente:</strong> ${item.reviewer_comment}</p>`
              : ""
          }
        </div>
      `;
    })
    .join("");
  return `<div class="bitacora-entries">${items}</div>`;
}

async function fetchMyEvidence() {
  const { data, error } = await client.rpc("fetch_my_evidence", {
    p_student_code: studentCode,
  });
  if (error) throw new Error(error.message);
  return data || [];
}

function renderMain(entries, statusMessage = "") {
  getRoot().innerHTML = `
    <div class="bitacora-public__card">
      <div class="bitacora-public__toolbar">
        <span class="bitacora-public__code">Código: ${studentCode}</span>
        <button type="button" class="bitacora-public__link-btn" id="bitacora-logout-btn">
          Cambiar código
        </button>
      </div>

      <form id="bitacora-upload-form" class="bitacora-public__upload">
        <label for="bitacora-title-input">Título (opcional)</label>
        <input
          id="bitacora-title-input"
          type="text"
          placeholder="Ej. Evidencia sesión de construcción"
          maxlength="120"
        />

        <label for="bitacora-desc-input">Descripción (opcional)</label>
        <textarea
          id="bitacora-desc-input"
          rows="2"
          placeholder="Notas sobre esta evidencia"
          maxlength="500"
        ></textarea>

        <label for="bitacora-file-input">Archivo (PDF, JPG o PNG, máx. 10 MB)</label>
        <input
          id="bitacora-file-input"
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
          required
        />

        <button type="submit" id="bitacora-submit-btn">Subir evidencia</button>
        ${statusMessage ? `<p class="bitacora-public__status">${statusMessage}</p>` : ""}
      </form>
    </div>

    <section class="bitacora-public__history">
      <h3>Mis evidencias</h3>
      ${renderEntries(entries)}
    </section>
  `;

  document.getElementById("bitacora-logout-btn").addEventListener("click", () => {
    studentCode = "";
    localStorage.removeItem("speed_bitacora_code");
    renderLogin();
  });

  document
    .getElementById("bitacora-upload-form")
    .addEventListener("submit", handleUploadSubmit);
}

async function handleUploadSubmit(event) {
  event.preventDefault();
  if (uploading) return;

  const fileInput = document.getElementById("bitacora-file-input");
  const titleInput = document.getElementById("bitacora-title-input");
  const descInput = document.getElementById("bitacora-desc-input");
  const submitBtn = document.getElementById("bitacora-submit-btn");
  const file = fileInput.files?.[0];

  if (!file) {
    alert("Selecciona un archivo.");
    return;
  }
  if (file.size > MAX_SIZE_BYTES) {
    alert("El archivo supera el límite de 10 MB.");
    return;
  }
  const typeOk = ALLOWED_TYPES.includes(file.type) || hasAllowedExtension(file.name);
  if (!typeOk) {
    alert("Formato no permitido. Solo se aceptan PDF, JPG o PNG.");
    return;
  }

  uploading = true;
  submitBtn.disabled = true;
  submitBtn.textContent = "Subiendo…";

  try {
    const safeName = sanitizeFileName(file.name);
    const filePath = `${studentCode}/${crypto.randomUUID()}-${safeName}`;

    const { error: uploadError } = await client.storage
      .from(BUCKET)
      .upload(filePath, file, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });
    if (uploadError) throw new Error(uploadError.message);

    const { data, error: rpcError } = await client.rpc("register_student_evidence", {
      p_student_code: studentCode,
      p_file_path: filePath,
      p_file_name: file.name,
      p_file_type: file.type || "application/octet-stream",
      p_file_size: file.size,
      p_title: titleInput.value.trim() || null,
      p_description: descInput.value.trim() || null,
    });
    if (rpcError) throw new Error(rpcError.message);
    if (data?.error) throw new Error(data.error);

    const entries = await fetchMyEvidence();
    renderMain(entries, "Evidencia subida correctamente.");
  } catch (err) {
    const entries = await fetchMyEvidence().catch(() => []);
    renderMain(entries, `Error: ${err.message || "No se pudo subir la evidencia"}`);
  } finally {
    uploading = false;
  }
}

async function loadMain() {
  getRoot().innerHTML = '<p class="bitacora-public__loading">Cargando tu bitácora…</p>';
  try {
    const entries = await fetchMyEvidence();
    renderMain(entries);
  } catch (err) {
    studentCode = "";
    renderLogin(err.message || "Código de estudiante no válido");
  }
}

async function init() {
  client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const saved = getSavedCode();
  if (saved && /^\d{4}$/.test(saved)) {
    studentCode = saved;
    await loadMain();
  } else {
    renderLogin();
  }
}

init().catch((err) => {
  getRoot().innerHTML = `<p class="bitacora-public__empty">Error: ${err.message}</p>`;
});
