/* =====================================================
   FLL Academy — client-side app v2
   - Skill tree with curved SVG paths
   - Lesson player
   - Progress saved in localStorage
   - Confetti celebration
   - Optional AI coach
   ===================================================== */

const STORAGE_KEY = "fll-academy-progress-v1";

let DATA = null;
let state = loadProgress();

let currentLesson = null;
let currentQuestion = 0;
let currentSelected = null;
let correctCount = 0;

const CONFETTI_COLORS = ["#FF7A1A", "#FFC857", "#4ECDC4", "#FF6B6B", "#A78BFA", "#58CC02", "#5BAEFF"];

/* ---------- Persistence ---------- */
function loadProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return { xp: 0, hearts: 5, streak: 0, lastVisit: null, completed: {} };
}

function saveProgress() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  renderStats();
}

function updateStreak() {
  const today = new Date().toDateString();
  if (state.lastVisit !== today) {
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    state.streak = state.lastVisit === yesterday ? state.streak + 1 : 1;
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
  clearConfetti();
  renderTracks();
  showView("home");
}

/* ---------- Helper: shade a hex color ---------- */
function shade(hex, percent) {
  const num = parseInt(hex.replace("#", ""), 16);
  const amt = Math.round(2.55 * percent);
  const R = Math.max(Math.min((num >> 16) + amt, 255), 0);
  const G = Math.max(Math.min(((num >> 8) & 0x00FF) + amt, 255), 0);
  const B = Math.max(Math.min((num & 0x0000FF) + amt, 255), 0);
  return "#" + ((R << 16) + (G << 8) + B).toString(16).padStart(6, "0");
}

/* ---------- Track / Skill tree rendering ---------- */
function renderTracks() {
  const container = document.getElementById("tracks-container");
  container.innerHTML = "";

  DATA.tracks.forEach((track) => {
    const trackEl = document.createElement("div");
    trackEl.className = "track";
    trackEl.style.setProperty("--track-color", track.color);

    const totalLessons = track.skills.reduce((n, s) => n + s.lessons.length, 0);
    const doneLessons = track.skills.reduce(
      (n, s) => n + s.lessons.filter(l => state.completed[l]).length,
      0
    );

    trackEl.innerHTML = `
      <div class="track-header">
        <div class="track-emoji">${track.emoji}</div>
        <div class="track-info">
          <h2 style="color: ${track.color}">${track.title}</h2>
          <p>${track.description} · <strong>${doneLessons}/${totalLessons}</strong> lessons</p>
        </div>
      </div>
      <div class="skills" id="skills-${track.id}"></div>
    `;
    container.appendChild(trackEl);

    renderSkills(track, trackEl.querySelector(".skills"));
  });
}

function renderSkills(track, skillsEl) {
  // Determine unlock state for each skill (sequential)
  let prevAllDone = true;
  let nextUpFound = false;

  track.skills.forEach((skill, skillIdx) => {
    const allDone = skill.lessons.every(l => state.completed[l]);
    const isUnlocked = skillIdx === 0 || prevAllDone;
    const isNextUp = isUnlocked && !allDone && !nextUpFound;
    if (isNextUp) nextUpFound = true;

    const skillEl = document.createElement("div");
    skillEl.className = "skill" + (isUnlocked ? "" : " locked");
    skillEl.dataset.pos = skillIdx % 7;

    const bg = isUnlocked
      ? `background: linear-gradient(135deg, ${track.color}, ${shade(track.color, -18)})`
      : "";
    const completeClass = allDone ? " complete" : "";
    const stateClass = isUnlocked ? " unlocked" : " locked";
    const nextUpClass = isNextUp ? " next-up" : "";

    skillEl.innerHTML = `
      <div class="skill-node${completeClass}${stateClass}${nextUpClass}" style="${bg}"
           ${isUnlocked ? `onclick="startSkill('${skill.id}')"` : ''}
           role="button" aria-label="${skill.title}${isUnlocked ? '' : ' (locked)'}">
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

  // Draw curved SVG paths between skill nodes after layout
  requestAnimationFrame(() => drawSkillPaths(track, skillsEl));
}

function drawSkillPaths(track, skillsEl) {
  // Remove old SVG layer
  const oldSvg = skillsEl.querySelector(".skills-paths");
  if (oldSvg) oldSvg.remove();

  const skills = skillsEl.querySelectorAll(".skill");
  if (skills.length < 2) return;

  const containerRect = skillsEl.getBoundingClientRect();
  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.classList.add("skills-paths");
  svg.setAttribute("width", containerRect.width);
  svg.setAttribute("height", containerRect.height);
  svg.style.width = "100%";
  svg.style.height = "100%";

  for (let i = 0; i < skills.length - 1; i++) {
    const node1 = skills[i].querySelector(".skill-node");
    const node2 = skills[i + 1].querySelector(".skill-node");
    if (!node1 || !node2) continue;

    const r1 = node1.getBoundingClientRect();
    const r2 = node2.getBoundingClientRect();

    const x1 = r1.left + r1.width / 2 - containerRect.left;
    const y1 = r1.bottom - containerRect.top - 4;
    const x2 = r2.left + r2.width / 2 - containerRect.left;
    const y2 = r2.top - containerRect.top + 4;

    // Quadratic curve with control point between
    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2;
    // Bow the curve outward based on horizontal delta
    const offsetX = (x2 - x1) * 0.4;

    const path = document.createElementNS(svgNS, "path");
    const d = `M ${x1} ${y1} Q ${cx + offsetX} ${cy} ${x2} ${y2}`;
    path.setAttribute("d", d);

    const skill1Lessons = track.skills[i].lessons;
    const allDone1 = skill1Lessons.every(l => state.completed[l]);
    if (allDone1) path.classList.add("done");

    svg.appendChild(path);
  }

  skillsEl.insertBefore(svg, skillsEl.firstChild);
}

// Re-draw paths on resize
let resizeTimer = null;
window.addEventListener("resize", () => {
  if (!DATA) return;
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (document.getElementById("view-home").classList.contains("active")) {
      renderTracks();
    }
  }, 150);
});

/* ---------- Skill / Lesson playback ---------- */
function startSkill(skillId) {
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
  currentQuestion = -1;
  currentSelected = null;
  correctCount = 0;

  showView("lesson");
  renderLessonStep();
}

function renderLessonStep() {
  const body = document.getElementById("lesson-body");
  const checkBtn = document.getElementById("check-btn");

  const totalSteps = currentLesson.questions.length + 1;
  const stepIdx = currentQuestion + 1;
  document.getElementById("progress-fill").style.width = `${(stepIdx / totalSteps) * 100}%`;

  if (currentQuestion === -1) {
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
  if (state.hearts < 5) state.hearts = Math.min(5, state.hearts + 1);
  saveProgress();

  document.getElementById("complete-xp").textContent = `+${xpEarned}`;
  document.getElementById("complete-acc").textContent = `${accuracy}%`;
  showView("complete");
  spawnConfetti();
}

/* ---------- Confetti ---------- */
function spawnConfetti() {
  const layer = document.getElementById("confetti-layer");
  layer.innerHTML = "";
  const count = 70;
  for (let i = 0; i < count; i++) {
    const piece = document.createElement("div");
    piece.className = "confetti-piece";
    const left = Math.random() * 100;
    const delay = Math.random() * 0.6;
    const duration = 2.6 + Math.random() * 1.6;
    const size = 8 + Math.random() * 8;
    const color = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];
    piece.style.left = `${left}%`;
    piece.style.background = color;
    piece.style.width = `${size}px`;
    piece.style.height = `${size * 1.4}px`;
    piece.style.animationDelay = `${delay}s`;
    piece.style.animationDuration = `${duration}s`;
    layer.appendChild(piece);
  }
  setTimeout(clearConfetti, 5000);
}

function clearConfetti() {
  const layer = document.getElementById("confetti-layer");
  if (layer) layer.innerHTML = "";
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

document.getElementById("ai-modal").addEventListener("click", (e) => {
  if (e.target.id === "ai-modal") closeAI();
});

boot();
