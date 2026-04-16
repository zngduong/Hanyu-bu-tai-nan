// ============================================================
// quiz.js — Quiz mode (multiple choice) + stats
// ============================================================
import { supabase, user } from './auth.js';

// ── State ──
let pool        = [];   // toan bo tu vung theo HSK da chon
let questions   = [];   // cac cau hoi da tao cho session hien tai
let qIndex      = 0;
let score       = 0;
let sessionId   = null;

// ── DOM refs ──
const quizStart    = document.getElementById('quiz-start');
const quizGame     = document.getElementById('quiz-game');
const quizResult   = document.getElementById('quiz-result');
const btnStartQuiz = document.getElementById('btn-start-quiz');
const btnRetry     = document.getElementById('btn-retry-quiz');
const qHanzi       = document.getElementById('q-hanzi');
const qPinyin      = document.getElementById('q-pinyin');
const qCurrent     = document.getElementById('q-current');
const qTotal       = document.getElementById('q-total');
const qScore       = document.getElementById('q-score');
const choicesEl    = document.getElementById('quiz-choices');
const feedbackEl   = document.getElementById('quiz-feedback');
const progressFill = document.getElementById('quiz-progress-fill');
const resultCorrect= document.getElementById('result-correct');
const resultTotal  = document.getElementById('result-total');
const resultMsg    = document.getElementById('result-message');
const resultIcon   = document.getElementById('result-icon');

// ── Stats DOM refs ──
const statTotalSeen = document.getElementById('stat-total-seen');
const statMastered  = document.getElementById('stat-mastered');
const statDueToday  = document.getElementById('stat-due-today');
const statAccuracy  = document.getElementById('stat-accuracy');
const hskBarsEl     = document.getElementById('hsk-progress-bars');

// ── Load pool ──
async function loadPool(hskLevel = null) {
  let query = supabase
    .from('vocabulary')
    .select('id, hanzi, pinyin, meaning_vi, hsk_level')
    .limit(500);

  if (hskLevel) query = query.eq('hsk_level', hskLevel);

  const { data, error } = await query;
  if (error) { console.error('Loi tai quiz pool:', error); return []; }
  return data || [];
}

// ── Build quiz questions ──
function buildQuestions(vocabPool, count) {
  if (vocabPool.length < 4) return [];

  const shuffled = [...vocabPool].sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, count);

  return selected.map((word) => {
    // Lay 3 dap an sai tu cung HSK level neu co the
    const sameLevel = vocabPool.filter(
      (w) => w.id !== word.id && w.hsk_level === word.hsk_level
    );
    const otherLevel = vocabPool.filter(
      (w) => w.id !== word.id && w.hsk_level !== word.hsk_level
    );
    const distractor_pool = [
      ...sameLevel.sort(() => Math.random() - 0.5).slice(0, 3),
      ...otherLevel.sort(() => Math.random() - 0.5),
    ];
    const distractors = distractor_pool.slice(0, 3);

    const choices = [word, ...distractors].sort(() => Math.random() - 0.5);
    return { word, choices };
  });
}

// ── Start quiz ──
async function startQuiz() {
  const count = parseInt(document.getElementById('quiz-count-select').value);
  const hskLevel = document.getElementById('hsk-level-select').value
    ? parseInt(document.getElementById('hsk-level-select').value)
    : null;

  pool = await loadPool(hskLevel);
  if (pool.length < 4) {
    alert('Can it nhat 4 tu vung de bat dau quiz. Vui long seed du lieu HSK.');
    return;
  }

  questions = buildQuestions(pool, Math.min(count, pool.length));
  qIndex = 0;
  score  = 0;
  sessionId = null;

  qTotal.textContent = questions.length;
  qScore.textContent = 0;

  quizStart.classList.add('hidden');
  quizResult.classList.add('hidden');
  quizGame.classList.remove('hidden');

  // Tao quiz session tren DB
  const { data: sess } = await supabase.from('quiz_sessions').insert({
    user_id:         user.id,
    lesson_id:       null,
    score:           0,
    total_questions: questions.length,
  }).select('id').maybeSingle();
  sessionId = sess?.id ?? null;

  renderQuestion();
}

// ── Render question ──
function renderQuestion() {
  if (qIndex >= questions.length) {
    showResult();
    return;
  }

  const { word, choices } = questions[qIndex];

  qHanzi.textContent  = word.hanzi;
  qPinyin.textContent = word.pinyin;
  qCurrent.textContent = qIndex + 1;
  progressFill.style.width = `${((qIndex) / questions.length) * 100}%`;

  feedbackEl.className = 'quiz-feedback hidden';
  feedbackEl.textContent = '';

  choicesEl.innerHTML = '';
  choices.forEach((choice) => {
    const btn = document.createElement('button');
    btn.className = 'choice-btn';
    btn.type = 'button';
    btn.textContent = choice.meaning_vi;
    btn.addEventListener('click', () => onChoiceClick(btn, choice, word));
    choicesEl.appendChild(btn);
  });
}

// ── Handle choice click ──
async function onChoiceClick(btn, choice, correctWord) {
  // Disable all buttons
  choicesEl.querySelectorAll('.choice-btn').forEach((b) => {
    b.disabled = true;
    if (b.textContent === correctWord.meaning_vi) b.classList.add('correct');
  });

  const isCorrect = choice.id === correctWord.id;

  if (isCorrect) {
    btn.classList.add('correct');
    score++;
    qScore.textContent = score;
    feedbackEl.textContent = 'Chinh xac!';
    feedbackEl.className = 'quiz-feedback correct';
  } else {
    btn.classList.add('wrong');
    feedbackEl.textContent = `Sai. Dap an dung: ${correctWord.meaning_vi}`;
    feedbackEl.className = 'quiz-feedback wrong';
  }
  feedbackEl.classList.remove('hidden');

  // Luu quiz answer
  if (sessionId) {
    supabase.from('quiz_answers').insert({
      session_id:    sessionId,
      vocabulary_id: correctWord.id,
      is_correct:    isCorrect,
    }).then(() => {});
  }

  // Chuyen sang cau tiep sau 1.2s
  setTimeout(() => {
    qIndex++;
    renderQuestion();
  }, 1200);
}

// ── Show result ──
async function showResult() {
  progressFill.style.width = '100%';
  quizGame.classList.add('hidden');
  quizResult.classList.remove('hidden');

  resultCorrect.textContent = score;
  resultTotal.textContent   = questions.length;

  const pct = Math.round((score / questions.length) * 100);
  if (pct >= 90) {
    resultIcon.textContent = '\uD83C\uDFC6';
    resultMsg.textContent  = `Tuyet voi! ${pct}% — Ban nam vung noi dung nay roi!`;
  } else if (pct >= 70) {
    resultIcon.textContent = '\uD83D\uDCAA';
    resultMsg.textContent  = `Tot lam! ${pct}% — Tiep tuc on luyen nhe.`;
  } else if (pct >= 50) {
    resultIcon.textContent = '\uD83D\uDCDA';
    resultMsg.textContent  = `${pct}% — Can on them mot chut nua!`;
  } else {
    resultIcon.textContent = '\uD83D\uDCAB';
    resultMsg.textContent  = `${pct}% — Hay dung flashcard de on truoc nhe.`;
  }

  // Cap nhat quiz session
  if (sessionId) {
    await supabase.from('quiz_sessions').update({
      score,
      completed_at: new Date().toISOString(),
    }).eq('id', sessionId);
  }
}

// ── Stats ──
async function loadStats() {
  const now = new Date().toISOString();

  const { data: progress } = await supabase
    .from('user_word_progress')
    .select('mastery_level, next_review_at, times_correct, times_wrong')
    .eq('user_id', user.id);

  if (!progress) return;

  const totalSeen = progress.length;
  const mastered  = progress.filter((p) => p.mastery_level >= 4).length;
  const dueToday  = progress.filter((p) => p.next_review_at && p.next_review_at <= now).length;

  const totalCorrect = progress.reduce((s, p) => s + (p.times_correct || 0), 0);
  const totalWrong   = progress.reduce((s, p) => s + (p.times_wrong   || 0), 0);
  const totalAttempts = totalCorrect + totalWrong;
  const accuracy = totalAttempts > 0
    ? Math.round((totalCorrect / totalAttempts) * 100) + '%'
    : '—';

  statTotalSeen.textContent = totalSeen;
  statMastered.textContent  = mastered;
  statDueToday.textContent  = dueToday;
  statAccuracy.textContent  = accuracy;

  // HSK progress bars
  const { data: vocab } = await supabase
    .from('vocabulary')
    .select('id, hsk_level');

  if (!vocab) return;

  const seenIds = new Set(
    await supabase
      .from('user_word_progress')
      .select('vocabulary_id')
      .eq('user_id', user.id)
      .then(({ data }) => (data || []).map((r) => r.vocabulary_id))
  );

  hskBarsEl.innerHTML = '<h3>Tien do theo cap do HSK</h3>';

  for (let lvl = 1; lvl <= 6; lvl++) {
    const total = vocab.filter((v) => v.hsk_level === lvl).length;
    if (total === 0) continue;
    const seen = vocab.filter((v) => v.hsk_level === lvl && seenIds.has(v.id)).length;
    const pct  = Math.round((seen / total) * 100);

    hskBarsEl.insertAdjacentHTML('beforeend', `
      <div class="hsk-progress-item">
        <span class="hsk-progress-label">HSK ${lvl}</span>
        <div class="hsk-bar-bg">
          <div class="hsk-bar-fill" style="width:${pct}%"></div>
        </div>
        <span class="hsk-progress-pct">${seen}/${total}</span>
      </div>
    `);
  }
}

// ── Event listeners ──
btnStartQuiz.addEventListener('click', startQuiz);
btnRetry.addEventListener('click', () => {
  quizResult.classList.add('hidden');
  quizStart.classList.remove('hidden');
});

// Load stats khi chuyen sang tab Stats
document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (btn.dataset.mode === 'stats') loadStats();
  });
});

// HSK level thay doi khi dang o quiz start → reset pool
document.getElementById('hsk-level-select').addEventListener('change', () => {
  pool = [];
  quizGame.classList.add('hidden');
  quizResult.classList.add('hidden');
  quizStart.classList.remove('hidden');
});
