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
let studentCode = localStorage.getItem("speed_quiz_code") || "";
let gameId = null;
let pollTimer = null;
let submitting = false;

function getRoot() {
  return document.getElementById("quiz-root");
}

function renderLogin() {
  getRoot().innerHTML = `
    <div class="quiz-public__card">
      <p>Ingresa tu código de estudiante para unirte al cuestionario activo.</p>
      <form class="quiz-public__login" id="quiz-login-form">
        <input
          id="quiz-code-input"
          maxlength="4"
          inputmode="numeric"
          pattern="[0-9]{4}"
          placeholder="0000"
          value="${studentCode}"
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
  getRoot().innerHTML = `
    <div class="quiz-public__card">
      <div class="quiz-public__score">Puntos: ${score}</div>
      <p class="quiz-public__waiting">${message}</p>
    </div>
  `;
}

function renderFinished(state) {
  getRoot().innerHTML = `
    <div class="quiz-public__card">
      <h2>Juego finalizado</h2>
      <div class="quiz-public__score">Puntos totales: ${state.total_score || 0}</div>
      <p class="quiz-public__empty">Gracias por participar. Puedes cerrar esta ventana o volver al temario.</p>
    </div>
  `;
}

function renderQuestion(state) {
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
    feedback = `<p class="quiz-public__waiting">Respuesta enviada. Esperando que el docente revele la respuesta…</p>`;
  }
  if (isReveal && myResponse) {
    feedback = `<div class="quiz-public__feedback ${
      myResponse.is_correct ? "quiz-public__feedback--ok" : "quiz-public__feedback--bad"
    }">
      ${myResponse.is_correct ? "¡Correcto! +1 punto" : "Respuesta incorrecta"}
      ${question.explanation_text ? `<p>${question.explanation_text}</p>` : ""}
    </div>`;
  }

  getRoot().innerHTML = `
    <div class="quiz-public__card">
      <div class="quiz-public__score">Puntos: ${state.total_score || 0}</div>
      <p class="quiz-public__question">${question.question_text}</p>
      ${question.question_image_url ? `<img class="quiz-public__question-image" src="${question.question_image_url}" alt="" />` : ""}
      <div class="quiz-public__options">${optionsHtml}</div>
      ${feedback}
    </div>
  `;

  getRoot().querySelectorAll("[data-option]").forEach((button) => {
    button.addEventListener("click", () => submitAnswer(question.id, button.dataset.option));
  });
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
    renderLogin();
    alert(data.error);
    return;
  }

  if (data.status === "waiting") {
    renderWaiting(`Conectado al cuestionario "${data.quiz_title}". Esperando que el docente inicie…`, data.total_score || 0);
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
    renderWaiting("No hay un cuestionario activo en este momento. Vuelve a intentar cuando el docente lo lance.");
    return;
  }
  gameId = active.game_id;
  await pollState();
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(() => {
    pollState().catch(() => {});
  }, 2000);
}

async function init() {
  client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  if (studentCode) {
    try {
      await bootstrap();
      return;
    } catch (err) {
      console.warn(err);
    }
  }
  renderLogin();
}

init().catch((err) => {
  getRoot().innerHTML = `<p class="quiz-public__empty">Error: ${err.message}</p>`;
});
