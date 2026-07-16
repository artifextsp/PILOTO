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

function sortByCode(a, b) {
  return String(a.student_code).localeCompare(String(b.student_code), "es");
}

function sortByPointsDesc(a, b) {
  if (b.total_score !== a.total_score) return b.total_score - a.total_score;
  return sortByCode(a, b);
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

/** Suma puntos de todos los cuestionarios por código (sin nombres). */
function buildOverallRanking(rows) {
  const map = new Map();
  for (const row of rows) {
    const code = String(row.student_code || "").trim();
    if (!code) continue;
    const current = map.get(code) || {
      student_code: code,
      total_score: 0,
      total_questions: 0,
      games_played: 0,
    };
    current.total_score += Number(row.total_score) || 0;
    current.total_questions += Number(row.total_questions) || 0;
    current.games_played += 1;
    map.set(code, current);
  }
  return [...map.values()].sort(sortByPointsDesc);
}

function renderGrid(records, totalQuestions) {
  const cells = [...records]
    .sort(sortByCode)
    .map(
      (record) => `<div class="quiz-scores__cell">
        <div class="quiz-scores__code">${record.student_code}</div>
        <span class="quiz-scores__points">${record.total_score} / ${totalQuestions}</span>
      </div>`
    )
    .join("");

  return `<div class="quiz-scores__grid">${cells}</div>`;
}

function renderRankingList(records, totalQuestions, title = "Ranking por puntos") {
  const items = [...records]
    .sort(sortByPointsDesc)
    .map((record, index) => {
      const place = index + 1;
      const medal =
        place === 1 ? " is-gold" : place === 2 ? " is-silver" : place === 3 ? " is-bronze" : "";
      const pointsLabel =
        totalQuestions != null
          ? `${record.total_score} / ${totalQuestions} pts`
          : `${record.total_score} pts`;
      return `<li class="quiz-scores__rank-item${medal}">
        <span class="quiz-scores__rank-place">#${place}</span>
        <span class="quiz-scores__rank-code">Código ${record.student_code}</span>
        <strong class="quiz-scores__rank-points">${pointsLabel}</strong>
      </li>`;
    })
    .join("");

  return `<section class="quiz-scores__ranking" aria-label="${title}">
    <h3>${title}</h3>
    <ol class="quiz-scores__rank-list">${items}</ol>
  </section>`;
}

function renderOverallRanking(records) {
  if (!records.length) return "";

  const items = records
    .map((record, index) => {
      const place = index + 1;
      const medal =
        place === 1 ? " is-gold" : place === 2 ? " is-silver" : place === 3 ? " is-bronze" : "";
      const gamesLabel =
        record.games_played === 1
          ? "1 cuestionario"
          : `${record.games_played} cuestionarios`;
      return `<li class="quiz-scores__rank-item${medal}">
        <span class="quiz-scores__rank-place">#${place}</span>
        <div class="quiz-scores__rank-main">
          <span class="quiz-scores__rank-code">Código ${record.student_code}</span>
          <span class="quiz-scores__rank-meta">${gamesLabel} · ${record.total_score} / ${record.total_questions} posibles</span>
        </div>
        <strong class="quiz-scores__rank-points">${record.total_score} pts</strong>
      </li>`;
    })
    .join("");

  return `<article class="quiz-scores__roll quiz-scores__roll--overall">
    <h2>Ranking general</h2>
    <p class="quiz-scores__roll-meta">
      Suma de puntos de todos los cuestionarios finalizados. Solo códigos, sin nombres.
    </p>
    <section class="quiz-scores__ranking quiz-scores__ranking--overall" aria-label="Ranking general">
      <ol class="quiz-scores__rank-list">${items}</ol>
    </section>
  </article>`;
}

function renderGame(game) {
  return `<article class="quiz-scores__roll">
    <h2>${game.quiz_title}</h2>
    <p class="quiz-scores__roll-meta">Finalizado · ${formatDateTime(game.ended_at)}</p>
    ${renderGrid(game.records, game.total_questions)}
    ${renderRankingList(game.records, game.total_questions)}
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
    root.innerHTML =
      '<p class="quiz-scores__empty">Aún no hay cuestionarios finalizados con puntajes publicados.</p>';
    return;
  }

  const games = groupByGame(data);
  const overall = buildOverallRanking(data);
  root.innerHTML = `${games.map(renderGame).join("")}${renderOverallRanking(overall)}`;
}

init().catch((err) => {
  document.getElementById("quiz-scores-root").innerHTML =
    `<p class="quiz-scores__empty">Error: ${err.message}</p>`;
});
