const SUPABASE_URL = "https://nbujvnrroerixivrmtxd.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5idWp2bnJyb2VyaXhpdnJtdHhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwNzM2NjUsImV4cCI6MjA5NzY0OTY2NX0.PqxtPsfExA_8BcXRIRmFz0ikcH7J_rNx4K0LKgcqaYY";

const OPTION_META = [
  { key: "a", label: "A", className: "quiz-public__option--a" },
  { key: "b", label: "B", className: "quiz-public__option--b" },
  { key: "c", label: "C", className: "quiz-public__option--c" },
  { key: "d", label: "D", className: "quiz-public__option--d" },
];

let client;
let studentCode = "";
let gameId = null;
let pollTimer = null;
let uiTickTimer = null;
let submitting = false;
let lastState = null;

function getSavedCode() {
  return localStorage.getItem("speed_quiz_code") || "";
}

function getRoot() {
  return document.getElementById("quiz-root");
}

function stopUiTick() {
  if (uiTickTimer) {
    clearInterval(uiTickTimer);
    uiTickTimer = null;
  }
}

function startUiTick() {
  stopUiTick();
  uiTickTimer = setInterval(() => {
    if (!lastState || lastState.status !== "active") return;
    if (lastState.seconds_left == null && !lastState.question?.time_limit_seconds) return;
    renderQuestion(lastState, true);
  }, 250);
}

function computeLocalSecondsLeft(state) {
  if (!state || state.status !== "active") return null;
  const now = Date.now();

  if (
    state.question_phase === "answering" &&
    state.question?.time_limit_seconds &&
    state.question_started_at
  ) {
    const ends =
      new Date(state.question_started_at).getTime() +
      state.question.time_limit_seconds * 1000;
    return Math.max(0, Math.ceil((ends - now) / 1000));
  }

  if (
    state.question_phase === "reveal" &&
    state.auto_advance &&
    state.reveal_started_at
  ) {
    const delay = state.auto_advance_delay_seconds ?? 5;
    const ends = new Date(state.reveal_started_at).getTime() + delay * 1000;
    return Math.max(0, Math.ceil((ends - now) / 1000));
  }

  if (typeof state.seconds_left === "number") return state.seconds_left;
  return null;
}

function renderTimer(state) {
  const secondsLeft = computeLocalSecondsLeft(state);
  if (secondsLeft == null) return "";

  const isAnswering = state.question_phase === "answering";
  const label = isAnswering
    ? "Tiempo restante"
    : state.auto_advance
      ? "Siguiente pregunta en"
      : null;
  if (!label) return "";

  return `<div class="quiz-public__timer ${secondsLeft <= 5 ? "is-urgent" : ""}" aria-live="polite">
    ${label}: <strong>${secondsLeft}s</strong>
  </div>`;
}

function renderLogin(message = "") {
  const savedCode = getSavedCode();
  getRoot().innerHTML = `
    <div class="quiz-public__card">
      <p>Ingresa tu código de estudiante para unirte al cuestionario activo.</p>
      ${message ? `<p class="quiz-public__empty">${message}</p>` : ""}
      <form class="quiz-public__login" id="quiz-login-form">
        <label for="quiz-code-input">Código de 4 dígitos</label>
        <input
          id="quiz-code-input"
          maxlength="4"
          inputmode="numeric"
          pattern="[0-9]{4}"
          placeholder="0000"
          value="${savedCode}"
          autocomplete="off"
          required
        />
        <button type="submit">Entrar al cuestionario</button>
      </form>
      <p class="quiz-public__empty">Si no tienes código, pídeselo a tu docente.</p>
    </div>
  `;

  document.getElementById("quiz-login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const code = document.getElementById("quiz-code-input").value.trim();
    if (!/^\d{4}$/.test(code)) {
      alert("El código debe tener 4 dígitos.");
      return;
    }
    studentCode = code;
    localStorage.setItem("speed_quiz_code", code);
    await bootstrap();
  });
}

function renderWaiting(message, score = 0) {
  stopUiTick();
  getRoot().innerHTML = `
    <div class="quiz-public__card">
      <div class="quiz-public__score">Puntos acumulados: ${score}</div>
      <p class="quiz-public__waiting">${message}</p>
    </div>
  `;
}

function renderSummary(summary) {
  if (!summary?.length) return "";
  const items = summary
    .map((item) => {
      const answered = item.selected_option != null;
      const cls = !answered ? "is-skip" : item.is_correct ? "is-ok" : "is-bad";
      const label = !answered
        ? "Sin responder"
        : item.is_correct
          ? "Correcta"
          : "Incorrecta";
      return `<div class="quiz-public__summary-item ${cls}">
        <div>
          <strong>Pregunta ${item.question_number}</strong>
          <div>${item.question_text}</div>
        </div>
        <span>${label}</span>
      </div>`;
    })
    .join("");
  return `<section class="quiz-public__summary"><h3>Tu resumen</h3><div class="quiz-public__summary-list">${items}</div></section>`;
}

function renderRanking(ranking) {
  if (!ranking?.length) return "";
  const items = ranking
    .map((row, index) => {
      const isMe = row.student_code === studentCode;
      return `<div class="quiz-public__ranking-item ${isMe ? "is-me" : ""}">
        <span>#${index + 1} · Código ${row.student_code}${isMe ? " (tú)" : ""}</span>
        <strong>${row.total_score} pts</strong>
      </div>`;
    })
    .join("");
  return `<section class="quiz-public__ranking"><h3>Ranking final</h3><div class="quiz-public__ranking-list">${items}</div></section>`;
}

function renderFinished(state) {
  stopUiTick();
  const correct = (state.answer_summary || []).filter((item) => item.is_correct).length;
  const incorrect = (state.answer_summary || []).filter(
    (item) => item.selected_option != null && !item.is_correct
  ).length;

  getRoot().innerHTML = `
    <div class="quiz-public__card">
      <h2 class="quiz-public__finished-title">Juego finalizado</h2>
      <div class="quiz-public__score">Puntos totales: ${state.total_score || 0}</div>
      <p class="quiz-public__empty">
        Respondiste ${correct} correcta(s) y ${incorrect} incorrecta(s).
      </p>
      ${renderSummary(state.answer_summary)}
      ${renderRanking(state.ranking)}
      <p class="quiz-public__empty">También puedes consultar tus puntajes en
        <a href="quiz-puntos.html">Puntajes de cuestionarios</a>.</p>
    </div>
  `;
}

function renderQuestion(state, fromTick = false) {
  const question = state.question;
  if (!question) {
    renderWaiting("Esperando la siguiente pregunta…", state.total_score || 0);
    return;
  }

  const myResponse = state.my_response;
  const isReveal = state.question_phase === "reveal";
  const optionsHtml = OPTION_META.map(({ key, label, className }) => {
    const selected = myResponse?.selected_option === key;
    const isCorrect = question.correct_option === key;
    const classes = [
      "quiz-public__option",
      className,
      selected ? "is-selected" : "",
      isReveal && isCorrect ? "is-correct" : "",
      isReveal && selected && !isCorrect ? "is-wrong" : "",
    ]
      .filter(Boolean)
      .join(" ");

    return `<button
      type="button"
      class="${classes}"
      data-option="${key}"
      ${myResponse || isReveal || submitting ? "disabled" : ""}
    >
      <span class="quiz-public__option-label">${label}</span>
      <span>${question[`option_${key}`]}</span>
    </button>`;
  }).join("");

  let feedback = "";
  if (state.question_phase === "answering" && myResponse) {
    feedback = `<p class="quiz-public__waiting">Respuesta enviada. Esperando el revelado…</p>`;
  }
  if (isReveal && myResponse) {
    feedback = `<div class="quiz-public__feedback ${
      myResponse.is_correct ? "quiz-public__feedback--ok" : "quiz-public__feedback--bad"
    }">
      ${myResponse.is_correct ? "¡Correcto! +1 punto" : "Respuesta incorrecta"}
      ${question.explanation_text ? `<p>${question.explanation_text}</p>` : ""}
    </div>`;
  } else if (isReveal && !myResponse) {
    feedback = `<div class="quiz-public__feedback quiz-public__feedback--bad">
      Tiempo agotado o sin respuesta
      ${question.explanation_text ? `<p>${question.explanation_text}</p>` : ""}
    </div>`;
  }

  const activeEl = document.activeElement;
  const focusedOption =
    fromTick && activeEl?.dataset?.option ? activeEl.dataset.option : null;

  getRoot().innerHTML = `
    <div class="quiz-public__card">
      <div class="quiz-public__score">Puntos acumulados: ${state.total_score || 0}</div>
      ${renderTimer(state)}
      <p class="quiz-public__question">${question.question_text}</p>
      ${question.question_image_url ? `<img class="quiz-public__question-image" src="${question.question_image_url}" alt="" />` : ""}
      <div class="quiz-public__options">${optionsHtml}</div>
      ${feedback}
    </div>
  `;

  getRoot().querySelectorAll("[data-option]").forEach((button) => {
    button.addEventListener("click", () => submitAnswer(question.id, button.dataset.option));
  });

  if (focusedOption) {
    getRoot().querySelector(`[data-option="${focusedOption}"]`)?.focus();
  }

  startUiTick();
}

async function submitAnswer(questionId, selectedOption) {
  if (!gameId || submitting) return;
  submitting = true;
  try {
    const { data, error } = await client.rpc("submit_quiz_answer", {
      p_game_id: gameId,
      p_student_code: studentCode,
      p_question_id: questionId,
      p_selected_option: selectedOption,
    });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);
    await pollState();
  } catch (err) {
    alert(err.message || "No se pudo enviar la respuesta");
  } finally {
    submitting = false;
  }
}

async function pollState() {
  if (!gameId || !studentCode) return;
  const { data, error } = await client.rpc("fetch_quiz_game_state", {
    p_game_id: gameId,
    p_student_code: studentCode,
  });
  if (error) {
    getRoot().innerHTML = `<p class="quiz-public__empty">Error: ${error.message}</p>`;
    return;
  }
  if (data?.error) {
    studentCode = "";
    gameId = null;
    lastState = null;
    stopUiTick();
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    renderLogin(data.error);
    return;
  }

  lastState = data;

  if (data.status === "waiting") {
    renderWaiting(
      `Conectado al cuestionario "${data.quiz_title}". Esperando que el docente inicie…`,
      data.total_score || 0
    );
    return;
  }

  if (data.status === "finished") {
    renderFinished(data);
    return;
  }

  renderQuestion(data);
}

async function findActiveGame() {
  const { data, error } = await client.rpc("fetch_active_quiz_game");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) return null;
  return data[0];
}

async function bootstrap() {
  getRoot().innerHTML = '<p class="quiz-public__loading">Conectando…</p>';
  const active = await findActiveGame();
  if (!active) {
    renderWaiting(
      "No hay un cuestionario activo en este momento. Vuelve a intentar cuando el docente lo lance."
    );
    return;
  }
  gameId = active.game_id;
  await pollState();
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(() => {
    pollState().catch(() => {});
  }, 1000);
}

async function init() {
  client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  renderLogin();
}

init().catch((err) => {
  getRoot().innerHTML = `<p class="quiz-public__empty">Error: ${err.message}</p>`;
});
