// ============================================================
// flashcard.js — Flashcard mode + SRS update
// ============================================================
import { supabase, user } from './auth.js';

// ── State ──
let words    = [];   // danh sach tu vung hien tai
let index    = 0;    // vi tri hien tai
let flipped  = false;

// ── DOM refs ──
const fcCard     = document.getElementById('flashcard');
const fcHanzi    = document.getElementById('fc-hanzi');
const fcHanziBk  = document.getElementById('fc-hanzi-back');
const fcPinyin   = document.getElementById('fc-pinyin');
const fcMeaning  = document.getElementById('fc-meaning');
const fcBadge    = document.getElementById('fc-hsk-badge');
const fcCurrent  = document.getElementById('fc-current');
const fcTotal    = document.getElementById('fc-total');
const fcActions  = document.getElementById('fc-actions');
const btnPrev    = document.getElementById('btn-fc-prev');
const btnNext    = document.getElementById('btn-fc-next');
const btnCorrect = document.getElementById('btn-correct');
const btnWrong   = document.getElementById('btn-wrong');
const loading    = document.getElementById('loading');
const section    = document.getElementById('mode-flashcard');

// ── Load vocabulary ──
async function loadVocabulary(hskLevel = null) {
  loading.classList.remove('hidden');
  section.classList.add('hidden');

  let query = supabase
    .from('vocabulary')
    .select('id, hanzi, pinyin, meaning_vi, hsk_level')
    .order('usage_count', { ascending: false })
    .limit(100);

  if (hskLevel) {
    query = query.eq('hsk_level', hskLevel);
  }

  const { data, error } = await query;

  loading.classList.add('hidden');

  if (error) {
    console.error('Loi tai vocabulary:', error);
    return;
  }

  words = data || [];
  index = 0;

  if (words.length === 0) {
    section.innerHTML = '<p style="text-align:center;color:var(--gray);padding:60px 0">Khong co tu vung nao. Vui long seed du lieu HSK.</p>';
    section.classList.remove('hidden');
    return;
  }

  fcTotal.textContent = words.length;
  renderCard();
  section.classList.remove('hidden');
}

// ── Render current card ──
function renderCard() {
  const word = words[index];
  if (!word) return;

  // Reset flip
  flipped = false;
  fcCard.classList.remove('flipped');
  fcActions.classList.add('hidden');

  fcHanzi.textContent   = word.hanzi;
  fcHanziBk.textContent = word.hanzi;
  fcPinyin.textContent  = word.pinyin;
  fcMeaning.textContent = word.meaning_vi;
  fcBadge.textContent   = `HSK ${word.hsk_level}`;
  fcCurrent.textContent = index + 1;

  btnPrev.disabled = index === 0;
  btnNext.disabled = index === words.length - 1;
}

// ── Flip card ──
function flipCard() {
  flipped = !flipped;
  fcCard.classList.toggle('flipped', flipped);
  fcActions.classList.toggle('hidden', !flipped);
}

// ── SM-2 update ──
async function updateSRS(wordId, correct) {
  const { data: existing } = await supabase
    .from('user_word_progress')
    .select('*')
    .eq('user_id', user.id)
    .eq('vocabulary_id', wordId)
    .maybeSingle();

  const now = new Date();
  let easeFactor   = existing?.ease_factor   ?? 2.5;
  let intervalDays = existing?.interval_days ?? 1;
  let mastery      = existing?.mastery_level ?? 0;
  let timesCorrect = existing?.times_correct ?? 0;
  let timesWrong   = existing?.times_wrong   ?? 0;

  if (correct) {
    timesCorrect += 1;
    mastery = Math.min(mastery + 1, 5);
    // SM-2: tang interval
    if (intervalDays === 1) {
      intervalDays = 6;
    } else {
      intervalDays = Math.round(intervalDays * easeFactor);
    }
    easeFactor = Math.max(1.3, easeFactor + 0.1);
  } else {
    timesWrong  += 1;
    mastery      = Math.max(mastery - 1, 0);
    intervalDays = 1;
    easeFactor   = Math.max(1.3, easeFactor - 0.2);
  }

  const nextReview = new Date(now.getTime() + intervalDays * 86400000);

  await supabase.from('user_word_progress').upsert({
    user_id:        user.id,
    vocabulary_id:  wordId,
    mastery_level:  mastery,
    last_seen_at:   now.toISOString(),
    next_review_at: nextReview.toISOString(),
    ease_factor:    easeFactor,
    interval_days:  intervalDays,
    times_correct:  timesCorrect,
    times_wrong:    timesWrong,
  }, { onConflict: 'user_id,vocabulary_id' });
}

// ── Event listeners ──
fcCard.addEventListener('click', flipCard);
fcCard.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') flipCard();
});

btnCorrect.addEventListener('click', async () => {
  const wordId = words[index]?.id;
  if (wordId) updateSRS(wordId, true);   // fire-and-forget
  if (index < words.length - 1) { index++; renderCard(); }
});

btnWrong.addEventListener('click', async () => {
  const wordId = words[index]?.id;
  if (wordId) updateSRS(wordId, false);  // fire-and-forget
  if (index < words.length - 1) { index++; renderCard(); }
});

btnPrev.addEventListener('click', () => {
  if (index > 0) { index--; renderCard(); }
});

btnNext.addEventListener('click', () => {
  if (index < words.length - 1) { index++; renderCard(); }
});

// Keyboard shortcuts: ArrowLeft/Right to navigate, Space to flip
document.addEventListener('keydown', (e) => {
  const activeMode = document.querySelector('.mode-section:not(.hidden)');
  if (activeMode?.id !== 'mode-flashcard') return;

  if (e.key === 'ArrowRight' && !flipped) {
    if (index < words.length - 1) { index++; renderCard(); }
  } else if (e.key === 'ArrowLeft' && !flipped) {
    if (index > 0) { index--; renderCard(); }
  } else if (e.key === ' ') {
    e.preventDefault();
    flipCard();
  }
});

// ── HSK level filter ──
document.getElementById('hsk-level-select').addEventListener('change', (e) => {
  const level = e.target.value ? parseInt(e.target.value) : null;
  loadVocabulary(level);
});

// ── Tab switching ──
document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');

    const mode = btn.dataset.mode;
    document.querySelectorAll('.mode-section').forEach((s) => s.classList.add('hidden'));
    document.getElementById(`mode-${mode}`).classList.remove('hidden');
  });
});

// ── Initial load ──
loadVocabulary();
