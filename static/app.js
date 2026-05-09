/* =====================================================
   FLL Academy — client-side app
   - Skill tree rendering
   - Lesson player
   - Progress saved in localStorage
   - Optional AI coach (uses /api/ask)
   ===================================================== */

const STORAGE_KEY = "fll-academy-progress-v1";

let DATA = null;             // loaded from /api/lessons
let state = loadProgress();  // { xp, hearts, streak, lastVisit, completed: { lessonId: true } }

let currentLesson = null;    // { id, ...lesson }
let currentQuestion = 0;
let currentSelected = null;
let correctCount = 0;

/* ---------- Persistence ---------- */
function loadProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return {
    xp: 0,
    hearts: 5,
    streak: 0,
    lastVisit: null,
    completed: {},
  };
}

function saveProgress() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  renderStats();
}

function updateStreak() {
  const today = new Date().toDateString();
  if (state.lastVisit !== today) {
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    if (state.lastVisit === yesterday) {
      state.streak += 1;
    } else if (state.lastVisit !== null) {
      state.streak = 1;
    } else {
      state.streak = 1;
    }
    state.lastVisit = today;
    saveProgress();
  }
}

/* ---------- Stats UI ---------- */
function renderStats() {
  document.getElementById("xp").textContent = state.xp;
  document.getElementById("streak").textContent = state.streak;
  document.getElementById("hearts").textContent = state.hearts;
}

/* ---------- View switching ---------- */
function showView(name) {
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.getElementById(`view-${name}`).classList.add("active");
  window.scrollTo({ top: 0, behavior: "instant" });
}

function goHome() {
  closeAI();
  renderTracks();
  showView("home");
}

/* ---------- Track / Skill tree rendering ---------- */
function renderTracks() {
  const container = document.getElementById("tracks-container");
  container.innerHTML = "";

  DATA.tracks.forEach((track, trackIdx) => {
    const trackEl = document.createElement("div");
    trackEl.className = "track";
    trackEl.style.borderTopColor = track.color;

    const totalLessons = track.skills.reduce((n, s) => n + s.lessons.length, 0);
    const doneLessons = track.skills.reduce((n, s) =>
      n + s.lessons.filter(l => state.completed[l]).length, 0);

    trackEl.innerHTML = `
      <div class="track-header" style="border-color: ${track.color}40">
        <div class="track-emoji">${track.emoji}</div>
        <div class="track-info">
          <h2 style="color: ${track.color}">${track.title}</h2>
          <p>${track.description} · ${doneLessons}/${totalLessons} lessons</p>
        </div>
      </div>
      <div class="skills" id="skills-${track.id}"></div>
    `;
    container.appendChild(trackEl);

    const skillsEl = trackEl.querySelector(".skills");

    // Determine which skills are unlocked: first is always unlocked,
    // each next unlocks when ALL lessons of the previous are completed.
    let prevAllDone = true;
    track.skills.forEach((skill, skillIdx) => {
      const allDone = skill.lessons.every(l => state.completed[l]);
      const anyDone = skill.lessons.some(l => state.completed[l]);
      const isUnlocked = (skillIdx === 0) || prevAllDone;

      const skillEl = document.createElement("div");
      skillEl.className = "skill" + (isUnlocked ? "" : " locked");

      const completeClass = allDone ? " complete" : "";
      const lockedClass = isUnlocked ? "" : " locked";
      const bg = isUnlocked
        ? `background: linear-gradient(135deg, ${track.color}, ${shade(track.color, -15)})`
        : "";

      skillEl.innerHTML = `
        <div class="skill-node${completeClass}${lockedClass}" style="${bg}"
             onclick="${isUnlocked ? `startSkill('${skill.id}')` : ''}">
          ${isUnlocked ? skill.icon : '🔒'}
        </div>
        <div class="skill-title">${skill.title}</div>
        <div class="skill-dots">
          ${skill.lessons.map(l => `<div class="skill-dot${state.completed[l] ? ' done' : ''}"></div>`).join("")}
        </div>
      `;
      skillsEl.appendChild(skillEl);

      prevAllDone = prevAllDone && allDone;
    });
  });
}

/* ---------- Helper: shade a hex color ---------- */
function shade(hex, percent) {
  const num = parseInt(hex.replace("#", ""), 16);
  const amt = Math.round(2.55 * percent);
  const R = (num >> 16) + amt;
  const G = ((num >> 8) & 0x00FF) + amt;
  const B = (num & 0x0000FF) + amt;
  return "#" + (
    0x1000000 +
    (Math.max(Math.min(R, 255), 0) << 16) +
    (Math.max(Math.min(G, 255), 0) << 8) +
    Math.max(Math.min(B, 255), 0)
  ).toString(16).slice(1);
}

/* ---------- Skill / Lesson playback ---------- */
function startSkill(skillId) {
  // Find the first uncompleted lesson in the skill, or the first lesson
  for (const track of DATA.tracks) {
    const skill = track.skills.find(s => s.id === skillId);
    if (skill) {
      const next = skill.lessons.find(l => !state.completed[l]) || skill.lessons[0];
      startLesson(next);
      return;
    }
  }
}

function startLesson(lessonId) {
  const lesson = DATA.lessons[lessonId];
  if (!lesson) return;
  currentLesson = { id: lessonId, ...lesson };
  currentQuestion = -1;        // -1 = intro screen
  currentSelected = null;
  correctCount = 0;

  showView("lesson");
  renderLessonStep();
}

function renderLessonStep() {
  const body = document.getElementById("lesson-body");
  const checkBtn = document.getElementById("check-btn");

  // Progress bar: intro = 0, then each question fills more
  const totalSteps = currentLesson.questions.length + 1;
  const stepIdx = currentQuestion + 1;
  document.getElementById("progress-fill").style.width = `${(stepIdx / totalSteps) * 100}%`;

  if (currentQuestion === -1) {
    // Intro screen
    body.innerHTML = `
      <div class="lesson-intro">
        <strong>${currentLesson.title}</strong>
        ${currentLesson.intro}
      </div>
    `;
    checkBtn.textContent = "Let's go!";
    checkBtn.disabled = false;
    checkBtn.onclick = () => { currentQuestion = 0; renderLessonStep(); };
    return;
  }

  // Question screen
  const q = currentLesson.questions[currentQuestion];
  body.innerHTML = `
    <div class="question-prompt">${q.prompt}</div>
    <div class="options" id="options"></div>
    <div class="feedback" id="feedback"></div>
  `;

  const opts = document.getElementById("options");
  q.options.forEach((opt, i) => {
    const btn = document.createElement("button");
    btn.className = "option";
    btn.textContent = opt;
    btn.onclick = () => selectOption(i);
    opts.appendChild(btn);
  });

  checkBtn.textContent = "Check";
  checkBtn.disabled = true;
  checkBtn.onclick = checkAnswer;
  currentSelected = null;
}

function selectOption(i) {
  currentSelected = i;
  document.querySelectorAll(".option").forEach((el, idx) => {
    el.classList.toggle("selected", idx === i);
  });
  document.getElementById("check-btn").disabled = false;
}

function checkAnswer() {
  const q = currentLesson.questions[currentQuestion];
  const opts = document.querySelectorAll(".option");
  const feedback = document.getElementById("feedback");
  const isCorrect = currentSelected === q.correct;

  // Disable further clicks
  opts.forEach(el => el.onclick = null);

  opts[currentSelected].classList.remove("selected");
  if (isCorrect) {
    opts[currentSelected].classList.add("correct");
    feedback.className = "feedback correct";
    feedback.innerHTML = `<strong>Nice! ✅</strong>${q.explain}`;
    correctCount++;
  } else {
    opts[currentSelected].classList.add("incorrect");
    opts[q.correct].classList.add("correct");
    feedback.className = "feedback incorrect";
    feedback.innerHTML = `<strong>Not quite ❌</strong>${q.explain}`;
    if (state.hearts > 0) { state.hearts--; saveProgress(); }
  }

  const checkBtn = document.getElementById("check-btn");
  checkBtn.textContent = currentQuestion === currentLesson.questions.length - 1 ? "Finish" : "Continue";
  checkBtn.onclick = nextQuestion;
}

function nextQuestion() {
  currentQuestion++;
  if (currentQuestion >= currentLesson.questions.length) {
    finishLesson();
  } else {
    renderLessonStep();
  }
}

function finishLesson() {
  const total = currentLesson.questions.length;
  const accuracy = Math.round((correctCount / total) * 100);
  const xpEarned = 10 + correctCount * 2;

  state.completed[currentLesson.id] = true;
  state.xp += xpEarned;
  // Refill one heart on completion (small reward)
  if (state.hearts < 5) state.hearts = Math.min(5, state.hearts + 1);
  saveProgress();

  document.getElementById("complete-xp").textContent = `+${xpEarned}`;
  document.getElementById("complete-acc").textContent = `${accuracy}%`;
  showView("complete");
}

/* ---------- AI Coach ---------- */
function openAI() {
  document.getElementById("ai-modal").classList.add("active");
  document.getElementById("ai-question").focus();
  document.getElementById("ai-response").className = "ai-response";
  document.getElementById("ai-response").textContent = "";
}

function closeAI() {
  document.getElementById("ai-modal").classList.remove("active");
}

async function askAI() {
  const q = document.getElementById("ai-question").value.trim();
  if (!q) return;
  const btn = document.getElementById("ai-submit");
  const resp = document.getElementById("ai-response");

  btn.disabled = true;
  btn.textContent = "Thinking...";
  resp.className = "ai-response visible";
  resp.textContent = "🤔 Asking the coach...";

  try {
    const r = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: q,
        lesson_context: currentLesson ? currentLesson.title : null,
      }),
    });
    const data = await r.json();

    if (data.error === "no_api_key") {
      resp.className = "ai-response visible warning";
      resp.textContent = data.message;
    } else if (data.error) {
      resp.textContent = "Sorry — couldn't reach the AI coach. " + (data.message || "");
    } else {
      resp.textContent = data.answer || "(no response)";
    }
  } catch (err) {
    resp.textContent = "Network error — try again in a moment.";
  } finally {
    btn.disabled = false;
    btn.textContent = "Ask";
  }
}

/* ---------- Boot ---------- */
async function boot() {
  updateStreak();
  renderStats();
  try {
    const r = await fetch("/api/lessons");
    DATA = await r.json();
    renderTracks();
  } catch (err) {
    document.getElementById("tracks-container").innerHTML = `
      <div class="track" style="text-align: center;">
        <p>⚠️ Could not load lessons. Try refreshing.</p>
      </div>`;
  }
}

// Modal click-outside-to-close
document.getElementById("ai-modal").addEventListener("click", (e) => {
  if (e.target.id === "ai-modal") closeAI();
});

boot();
