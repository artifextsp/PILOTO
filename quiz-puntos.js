const SUPABASE_URL = "https://nbujvnrroerixivrmtxd.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5idWp2bnJyb2VyaXhpdnJtdHhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwNzM2NjUsImV4cCI6MjA5NzY0OTY2NX0.PqxtPsfExA_8BcXRIRmFz0ikcH7J_rNx4K0LKgcqaYY";

function formatDateTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function groupByGame(rows) {
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.game_session_id)) {
      map.set(row.game_session_id, {
        game_session_id: row.game_session_id,
        quiz_title: row.quiz_title,
        ended_at: row.ended_at,
        total_questions: row.total_questions,
        records: [],
      });
    }
    map.get(row.game_session_id).records.push(row);
  }
  return [...map.values()].sort((a, b) => new Date(b.ended_at) - new Date(a.ended_at));
}

function renderGame(game) {
  const cells = game.records
    .sort((a, b) => String(a.student_code).localeCompare(String(b.student_code)))
    .map(
      (record) => `<div class="quiz-scores__cell">
        <div class="quiz-scores__code">${record.student_code}</div>
        <span class="quiz-scores__points">${record.total_score} / ${record.total_questions}</span>
      </div>`
    )
    .join("");

  return `<article class="quiz-scores__roll">
    <h2>${game.quiz_title}</h2>
    <p class="quiz-scores__roll-meta">Finalizado · ${formatDateTime(game.ended_at)}</p>
    <div class="quiz-scores__grid">${cells}</div>
  </article>`;
}

async function init() {
  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const root = document.getElementById("quiz-scores-root");

  const { data, error } = await client.rpc("fetch_public_quiz_scores");
  if (error) {
    root.innerHTML = `<p class="quiz-scores__empty">No se pudieron cargar los puntajes (${error.message}).</p>`;
    return;
  }

  if (!data?.length) {
    root.innerHTML = '<p class="quiz-scores__empty">Aún no hay cuestionarios finalizados con puntajes publicados.</p>';
    return;
  }

  root.innerHTML = groupByGame(data).map(renderGame).join("");
}

init().catch((err) => {
  document.getElementById("quiz-scores-root").innerHTML =
    `<p class="quiz-scores__empty">Error: ${err.message}</p>`;
});
