const SUPABASE_URL = "https://nbujvnrroerixivrmtxd.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5idWp2bnJyb2VyaXhpdnJtdHhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwNzM2NjUsImV4cCI6MjA5NzY0OTY2NX0.PqxtPsfExA_8BcXRIRmFz0ikcH7J_rNx4K0LKgcqaYY";

const STATUS_LABELS = {
  presente: "Presente",
  ausente: "Ausente",
  ausente_excusa: "Ausente con excusa",
};

function formatDateTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function groupByRollCall(rows) {
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.roll_call_id)) {
      map.set(row.roll_call_id, {
        roll_call_id: row.roll_call_id,
        session_id: row.session_id,
        roll_call_label: row.roll_call_label,
        taken_at: row.taken_at,
        session_title: row.session_title,
        session_number: row.session_number,
        records: [],
      });
    }
    map.get(row.roll_call_id).records.push(row);
  }
  return [...map.values()].sort((a, b) => new Date(b.taken_at) - new Date(a.taken_at));
}

function renderRollCall(rollCall) {
  const title = rollCall.session_number
    ? `Sesión ${rollCall.session_number}: ${rollCall.session_title}`
    : rollCall.session_title;
  const label = rollCall.roll_call_label || "Llamado a lista";
  const cells = rollCall.records
    .sort((a, b) => String(a.student_code).localeCompare(String(b.student_code)))
    .map((record) => {
      const statusClass = `att-public__status att-public__status--${record.status}`;
      return `<div class="att-public__cell">
        <div class="att-public__code">${record.student_code}</div>
        <span class="${statusClass}">${STATUS_LABELS[record.status] || record.status}</span>
      </div>`;
    })
    .join("");

  return `<article class="att-public__roll" data-session-id="${rollCall.session_id}">
    <h2>${label}</h2>
    <p class="att-public__roll-meta">${title} · ${formatDateTime(rollCall.taken_at)}</p>
    <div class="att-public__grid">${cells}</div>
  </article>`;
}

function populateSessionFilter(rows, selectedSessionId) {
  const select = document.getElementById("session-filter");
  const sessions = new Map();
  for (const row of rows) {
    if (!sessions.has(row.session_id)) {
      const label = row.session_number
        ? `Sesión ${row.session_number}: ${row.session_title}`
        : row.session_title;
      sessions.set(row.session_id, label);
    }
  }
  select.innerHTML = '<option value="">Todas las clases</option>';
  for (const [id, label] of sessions) {
    const option = document.createElement("option");
    option.value = id;
    option.textContent = label;
    if (id === selectedSessionId) option.selected = true;
    select.appendChild(option);
  }
}

function render(rows, sessionId) {
  const root = document.getElementById("attendance-root");
  const filtered = sessionId
    ? rows.filter((row) => row.session_id === sessionId)
    : rows;

  if (filtered.length === 0) {
    root.innerHTML = '<p class="att-public__empty">No hay registros de asistencia publicados.</p>';
    return;
  }

  const groups = groupByRollCall(filtered);
  root.innerHTML = groups.map(renderRollCall).join("");
}

async function init() {
  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const root = document.getElementById("attendance-root");
  const filter = document.getElementById("session-filter");

  let allRows = [];

  async function load(sessionId = "") {
    root.innerHTML = '<p class="att-public__loading">Cargando asistencia…</p>';
    const { data, error } = await client.rpc("fetch_public_attendance", {
      p_session_id: sessionId || null,
    });
    if (error) {
      root.innerHTML = `<p class="att-public__empty">No se pudo cargar la asistencia (${error.message}).</p>`;
      return;
    }
    if (!sessionId) allRows = data || [];
    render(sessionId ? data || [] : allRows, sessionId);
    if (!sessionId) populateSessionFilter(allRows, filter.value);
  }

  filter.addEventListener("change", () => {
    load(filter.value || "");
  });

  await load("");
  window.setInterval(() => load(filter.value || ""), 60000);
}

init().catch((err) => {
  document.getElementById("attendance-root").innerHTML =
    `<p class="att-public__empty">Error: ${err.message}</p>`;
});
