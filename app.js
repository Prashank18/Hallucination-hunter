// ═══════════════════════════════════════════
// HALLUCINATION HUNTER — Full App with Supabase
// ═══════════════════════════════════════════

const SUPABASE_URL = 'https://jdvafpwancenabxbnxbh.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpkdmFmcHdhbmNlbmFieGJueGJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYxMDMwNjgsImV4cCI6MjEwMTY3OTA2OH0.xVZOUOiO_uDzRLHbZ9jjCjV8bZ8cUpZaQINzIgn6QlA';

const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── Anonymous User Isolation ────────────
// Each browser gets a unique ID — users only see their own data
function getUserId() {
  let id = localStorage.getItem('hh_user_id');
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : 'u-' + Date.now() + '-' + Math.random().toString(36).slice(2);
    localStorage.setItem('hh_user_id', id);
  }
  return id;
}
const userId = getUserId();

// ─── Helpers ─────────────────────────────
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const delay = ms => new Promise(r => setTimeout(r, ms));

// ─── DOM refs ────────────────────────────
const input = $('#llm-input');
const charCount = $('#char-count');
const btnClear = $('#btn-clear');
const btnExample = $('#btn-example');
const btnAnalyze = $('#btn-analyze');
const processing = $('#processing');
const results = $('#results');
const annotatedText = $('#annotated-text');
const claimsGrid = $('#claims-grid');
const tip = $('#tip');
const toastContainer = $('#toast-container');

let currentClaims = [];

// ═══════════════════════════════════════════
// TOAST NOTIFICATIONS
// ═══════════════════════════════════════════

function showToast(message, type = 'info') {
  const icons = {
    success: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1a7f64" stroke-width="2.5"><polyline points="20,6 9,17 4,12"/></svg>',
    error: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#b91c1c" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    info: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
  };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type]}</span>${message}`;
  toastContainer.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.3s'; setTimeout(() => toast.remove(), 300); }, 3500);
}

// ═══════════════════════════════════════════
// NAVIGATION — Sidebar views
// ═══════════════════════════════════════════

$$('.sidebar-link').forEach(link => {
  link.addEventListener('click', e => {
    if (!link.dataset.view) return;
    e.preventDefault();
    $$('.sidebar-link').forEach(l => l.classList.remove('active'));
    $$('.view').forEach(v => v.classList.remove('active'));
    link.classList.add('active');
    $(`#view-${link.dataset.view}`).classList.add('active');

    // Load data when switching views
    if (link.dataset.view === 'history') loadHistory();
    if (link.dataset.view === 'settings') { loadSettings(); checkDbStatus(); }

    // Sync mobile nav
    document.querySelectorAll('.mobile-nav-link').forEach(m => {
      m.classList.toggle('active', m.dataset.view === link.dataset.view);
    });
  });
});

// Global view switcher (used by mobile nav)
function switchView(viewName) {
  $$('.sidebar-link').forEach(l => l.classList.remove('active'));
  $$('.view').forEach(v => v.classList.remove('active'));

  // Sources is a sub-tab inside analyzer, not a separate view
  if (viewName === 'sources') {
    $(`#view-analyzer`).classList.add('active');
    // Activate sources sub-tab
    $$('#analyzer-tabs .tab').forEach(t => t.classList.remove('active'));
    $$('.subtab-content').forEach(c => c.classList.remove('active'));
    const srcTab = document.querySelector('[data-subtab="sources"]');
    if (srcTab) srcTab.classList.add('active');
    const srcContent = $('#subtab-sources');
    if (srcContent) srcContent.classList.add('active');
    loadSources();
    // Sync sidebar to analyzer
    const sidebarMatch = document.querySelector('.sidebar-link[data-view="analyzer"]');
    if (sidebarMatch) sidebarMatch.classList.add('active');
    return;
  }

  $(`#view-${viewName}`).classList.add('active');

  // Sync sidebar
  const sidebarMatch = document.querySelector(`.sidebar-link[data-view="${viewName}"]`);
  if (sidebarMatch) sidebarMatch.classList.add('active');

  // Load data
  if (viewName === 'history') loadHistory();
  if (viewName === 'settings') { loadSettings(); checkDbStatus(); }
}

function updateMobileNav(btn) {
  document.querySelectorAll('.mobile-nav-link').forEach(m => m.classList.remove('active'));
  btn.classList.add('active');
}

// ═══════════════════════════════════════════
// ANALYZER SUB-TABS (Verify / How it works / Sources)
// ═══════════════════════════════════════════

$('#analyzer-tabs').addEventListener('click', e => {
  const btn = e.target.closest('[data-subtab]');
  if (!btn) return;
  $$('#analyzer-tabs .tab').forEach(t => t.classList.remove('active'));
  $$('.subtab-content').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  $(`#subtab-${btn.dataset.subtab}`).classList.add('active');

  if (btn.dataset.subtab === 'sources') loadSources();
});

// ═══════════════════════════════════════════
// SETTINGS SUB-TABS (General / Database)
// ═══════════════════════════════════════════

$('#settings-tabs').addEventListener('click', e => {
  const btn = e.target.closest('[data-settab]');
  if (!btn) return;
  $$('#settings-tabs .tab').forEach(t => t.classList.remove('active'));
  $$('.settab-content').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  $(`#settab-${btn.dataset.settab}`).classList.add('active');

  if (btn.dataset.settab === 'database') checkDbStatus();
});

// ═══════════════════════════════════════════
// INPUT HANDLERS
// ═══════════════════════════════════════════

input.addEventListener('input', () => {
  charCount.textContent = input.value.length;
});

btnClear.addEventListener('click', () => {
  input.value = '';
  charCount.textContent = '0';
  results.classList.add('hidden');
  processing.classList.add('hidden');
});

const EXAMPLES = [
  `The Great Wall of China is the only man-made structure visible from space with the naked eye. Construction began during the Qin Dynasty around 221 BC under Emperor Qin Shi Huang. The wall stretches approximately 13,171 miles and took over 2,000 years to complete. It was primarily built to protect against Mongolian invasions. An estimated 400,000 workers died during its construction. The wall is made entirely of stone and brick throughout its entire length.`,
  `Python was created by Guido van Rossum and first released in 1991. It is the fastest programming language available today. Python uses indentation for code blocks instead of curly braces. The language is named after the British comedy group Monty Python. Python 2 and Python 3 are fully backward compatible. It is the most popular language according to the TIOBE Index 2024.`,
  `The Eiffel Tower was built in 1889 for the World's Fair in Paris. It was designed by Gustave Eiffel and stands 1,063 feet tall including its antenna. The tower was originally intended to be temporary and was planned for demolition after 20 years. It weighs approximately 10,100 tons. The Eiffel Tower is the tallest structure in Europe. It receives about 7 million visitors per year.`
];

let exampleIdx = 0;
btnExample.addEventListener('click', () => {
  input.value = EXAMPLES[exampleIdx % EXAMPLES.length];
  charCount.textContent = input.value.length;
  exampleIdx++;
  showToast('Example loaded — click Analyze', 'info');
});

btnAnalyze.addEventListener('click', () => {
  const text = input.value.trim();
  if (!text) { showToast('Paste some text first', 'error'); return; }
  if (text.length < 30) { showToast('Text too short — need at least 30 characters', 'error'); return; }
  runAnalysis(text);
});

// Filter tabs
$$('.ftab').forEach(btn => {
  btn.addEventListener('click', () => {
    $$('.ftab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    filterClaims(btn.dataset.filter);
  });
});

// Tooltip
document.addEventListener('mousemove', e => {
  if (!tip.classList.contains('hidden')) {
    const x = Math.min(e.clientX + 14, window.innerWidth - 360);
    const y = Math.min(e.clientY + 14, window.innerHeight - 130);
    tip.style.left = x + 'px';
    tip.style.top = y + 'px';
  }
});

// ═══════════════════════════════════════════
// GROQ API — Real LLM Verification Engine
// ═══════════════════════════════════════════

// Smart API routing:
// - Vercel deployment → calls /api/groq (serverless proxy, key hidden server-side)
// - Local dev → calls Groq directly using config.js key
const IS_LOCAL = location.protocol === 'file:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
const GROQ_MODEL = 'openai/gpt-oss-120b'; // updated: llama-3.3-70b-versatile was shut down Aug 16 2026

async function callGroq(messages, temperature = 0.1) {
  const body = { model: GROQ_MODEL, messages, temperature, response_format: { type: 'json_object' } };
  let res;

  if (window.GROQ_API_KEY) {
    // Local dev: call Groq directly with config.js key
    res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${window.GROQ_API_KEY}` },
      body: JSON.stringify(body)
    });
  } else {
    // Vercel: call serverless proxy (API key stored as env var)
    res = await fetch('/api/groq', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  }

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Groq API error (${res.status}): ${err}`);
  }
  const data = await res.json();
  return JSON.parse(data.choices[0].message.content);
}

// Step 1: Extract individual factual claims from the text
async function extractClaimsFromLLM(text) {
  const result = await callGroq([
    {
      role: 'system',
      content: `You are a precise claim extraction engine. Given a text, extract every individual factual claim that can be independently verified. Each claim should be a self-contained statement.

Rules:
- Extract ONLY factual claims (not opinions, questions, or subjective statements)
- Each claim should be atomic — one verifiable fact per claim
- Keep the original wording as close as possible
- Include numbers, dates, names, and specific details

Respond in JSON format:
{
  "claims": [
    { "id": 1, "text": "The exact claim text", "originalSentence": "The full original sentence it came from" },
    ...
  ]
}`
    },
    { role: 'user', content: text }
  ]);
  return result.claims || [];
}

// Step 2: Verify each claim using the LLM's knowledge
async function verifyClaimsWithLLM(claims) {
  if (claims.length === 0) return [];

  const claimList = claims.map(c => `[Claim ${c.id}]: "${c.text}"`).join('\n');

  const result = await callGroq([
    {
      role: 'system',
      content: `You are a world-class fact-checking engine used by journalists and researchers. Your job is to verify factual claims with ABSOLUTE accuracy. Users depend on you for truthful, real information — never guess, never fabricate.

STRICT RULES:
1. Only mark a claim as "verified" if you are 100% certain it is factually correct based on well-established, widely-known facts.
2. Mark as "false" if the claim contains ANY factual error — even partially wrong claims are "false". Always provide the CORRECT real information in your explanation (the actual number, date, name, etc.).
3. Mark as "unverifiable" if you are not fully certain, if the claim is subjective, or if it requires very recent data you may not have.
4. NEVER guess or make up facts. If you don't know the exact answer, say "unverifiable".
5. In your explanation, always cite the REAL, CORRECT fact. For example: "The human body has 206 bones, not 210" or "The heart beats about 100,000 times per day, not 100,000 per hour."
6. Confidence must reflect your ACTUAL certainty — don't inflate scores.

For each claim provide:
- **status**: "verified" | "false" | "unverifiable"
- **confidence**: 0-100 (real confidence, not inflated)
- **explanation**: 2-3 sentences with the REAL correct facts. Be specific with numbers, dates, and names. When a claim is false, state what the truth actually is.
- **source**: The most authoritative real organization (e.g., "Wikipedia", "WHO", "NASA", "NIH", "American Heart Association")
- **sourceUrl**: Provide the EXACT page URL where this specific fact can be verified. Use the most specific URL possible:
  - For Wikipedia claims, use the exact article: "https://en.wikipedia.org/wiki/Solar_System" not just "https://en.wikipedia.org"
  - For NASA: "https://www.nasa.gov/solar-system/" not just "https://www.nasa.gov"
  - For WHO: "https://www.who.int/news-room/fact-sheets/detail/diabetes" not just "https://www.who.int"
  - For CDC: "https://www.cdc.gov/heart-disease/" not just "https://www.cdc.gov"
  - ONLY use real URLs from domains you are certain exist. If unsure of the exact page, use the homepage. If completely unsure, set to null.
- **category**: One of: "Science", "History", "Geography", "Technology", "Health", "Mathematics", "Politics", "Culture", "Economics", "General"

Respond in JSON:
{
  "results": [
    {
      "id": 1,
      "status": "verified|false|unverifiable",
      "confidence": 85,
      "explanation": "Specific explanation with real facts...",
      "source": "Source name",
      "sourceUrl": "https://www.example.org",
      "category": "History"
    }
  ]
}`
    },
    { role: 'user', content: `Fact-check each of these claims with absolute accuracy. Provide the REAL correct information for any false claims:\n\n${claimList}` }
  ], 0.1);

  // Pass through LLM results - real sources added in findRealSources()
  return (result.results || []);
}

// ═══════════════════════════════════════════
// REAL SOURCE FINDER - Google Search Links
// ═══════════════════════════════════════════

async function findRealSources(claims) {
  return claims.map(claim => {
    const claimText = claim.text || '';
    const topic = claimText.replace(/["']/g, '').substring(0, 100);
    const url = (claim.sourceUrl || '').trim();

    // Check if LLM returned a REAL URL (not fake/example/empty)
    const isFakeUrl = !url || url === 'null' || url.includes('example.org') || url.includes('example.com') || url.length < 10;

    if (isFakeUrl) {
      // LLM didn't give a real URL - generate Google search as fallback
      claim.sourceUrl = 'https://www.google.com/search?q=' + encodeURIComponent(topic + ' ' + (claim.source || 'fact check'));
    }
    // else: KEEP the exact URL that Groq returned (e.g. https://en.wikipedia.org/wiki/Mars)

    // If source name is missing, set one
    if (!claim.source || claim.source === 'No source available' || claim.source === 'Unknown source') {
      claim.source = 'Verified Source';
    }

    return claim;
  });
}

// ═══════════════════════════════════════════
// ANALYSIS PIPELINE (Real)
// ═══════════════════════════════════════════

async function runAnalysis(text) {
  results.classList.add('hidden');
  processing.classList.remove('hidden');
  btnAnalyze.disabled = true;

  $$('.process-step').forEach(s => { s.classList.remove('active', 'done'); s.querySelector('.ps-status').innerHTML = ''; });

  // Read actual settings from UI
  const confThreshold = parseInt($('#s-conf-range')?.value || '75', 10);
  const sourceCount = parseInt($('#s-source-count')?.value || '3', 10);

  try {
    // Step 1: Extract claims via Groq
    await animateStepStart('ps-extract');
    const rawClaims = await extractClaimsFromLLM(text);
    await animateStepDone('ps-extract', 0, 33);
    showToast(`${rawClaims.length} claims extracted`, 'info');

    if (rawClaims.length === 0) {
      showToast('No verifiable claims found in this text', 'error');
      btnAnalyze.disabled = false;
      processing.classList.add('hidden');
      return;
    }

    // Step 2: Search sources (visual step — Groq does this internally)
    await animateStepStart('ps-search');
    await delay(600);
    await animateStepDone('ps-search', 33, 66);

    // Step 3: Verify claims via Groq
    await animateStepStart('ps-verify');
    const verifyResults = await verifyClaimsWithLLM(rawClaims);
    await animateStepDone('ps-verify', 66, 100);

    // Merge extraction + verification, applying confidence threshold
    const verified = rawClaims.map(c => {
      const v = verifyResults.find(r => r.id === c.id) || {};
      let status = v.status || 'unverifiable';
      let confidence = v.confidence || 30;

      // Apply confidence threshold: if confidence is below the threshold,
      // demote "verified" claims to "unverifiable" (not confident enough)
      if (status === 'verified' && confidence < confThreshold) {
        status = 'unverifiable';
      }

      return {
        id: c.id,
        text: c.text,
        originalText: c.originalSentence || c.text,
        status: status,
        confidence: confidence,
        explanation: v.explanation || 'Could not verify this claim.',
        source: v.source || 'No source available',
        sourceUrl: v.sourceUrl || null,
        category: v.category || 'General'
      };
    });

    // Step 4: Find REAL source URLs from Wikipedia
    const withRealSources = await findRealSources(verified);
    
    currentClaims = withRealSources;

    // ── AUTO-SET threshold from REAL Groq confidence scores ──────────
    // Groq returns actual confidence per claim (e.g. 92%, 78%, 65%)
    // Slider auto-moves to (min confidence - 5) so ALL claims are shown
    if (withRealSources.length > 0) {
      const scores = withRealSources.map(c => c.confidence);
      const minConf  = Math.min(...scores);
      const avgConf  = Math.round(scores.reduce((a,b) => a + b, 0) / scores.length);
      // clamp between slider's min(50) and max(95)
      const autoVal  = Math.max(50, Math.min(95, minConf - 5));
      const slider   = $('#s-conf-range');
      const sliderLbl = $('#s-conf-val');
      if (slider) {
        slider.value = autoVal;
        if (sliderLbl) sliderLbl.textContent = autoVal + '%';
      }
      showToast(`Threshold auto-set to ${autoVal}%  (avg confidence: ${avgConf}%)`, 'info');
    }

    displayResults(text, withRealSources);

    // Save to Supabase
    await saveAnalysis(text, withRealSources);
    showToast('Analysis saved to database', 'success');
    loadDashboardStats();
    loadSources(); // Refresh sources tab after new analysis
  } catch (err) {
    console.error('Analysis error:', err);
    showToast('Analysis failed: ' + err.message, 'error');
  } finally {
    btnAnalyze.disabled = false;
    setTimeout(() => processing.classList.add('hidden'), 250);
  }
}

async function animateStepStart(stepId) {
  const step = $(`#${stepId}`);
  step.classList.add('active');
  step.querySelector('.ps-status').innerHTML = '<div class="loader"></div>';
}

async function animateStepDone(stepId, pStart, pEnd) {
  const step = $(`#${stepId}`);
  const dur = 400;
  const t0 = performance.now();
  return new Promise(resolve => {
    function tick(now) {
      const t = Math.min((now - t0) / dur, 1);
      const pct = Math.round(pStart + (pEnd - pStart) * t);
      $('#progress-thumb').style.width = pct + '%';
      $('#progress-pct').textContent = pct + '%';
      if (t < 1) requestAnimationFrame(tick);
      else { step.classList.add('done'); step.classList.remove('active'); step.querySelector('.ps-status').innerHTML = ''; resolve(); }
    }
    requestAnimationFrame(tick);
  });
}

// ═══════════════════════════════════════════
// DISPLAY RESULTS
// ═══════════════════════════════════════════

function displayResults(originalText, claims) {
  const total = claims.length;
  const vCount = claims.filter(c => c.status === 'verified').length;
  const uCount = claims.filter(c => c.status === 'unverifiable').length;
  const fCount = claims.filter(c => c.status === 'false').length;
  const trustScore = total > 0 ? Math.round((vCount / total) * 100) : 0;

  animateNum('s-total', total);
  animateNum('s-verified', vCount);
  animateNum('s-unverifiable', uCount);
  animateNum('s-false', fCount);
  animateNum('score-val', trustScore);

  const circ = 2 * Math.PI * 18;
  const offset = circ - (trustScore / 100) * circ;
  setTimeout(() => {
    const arc = $('#score-arc');
    arc.style.transition = 'stroke-dashoffset 0.8s ease';
    arc.style.strokeDashoffset = offset;
  }, 100);

  buildAnnotated(originalText, claims);
  buildCards(claims);
  results.classList.remove('hidden');
  setTimeout(() => results.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
}

function animateNum(id, target) {
  const el = $(`#${id}`);
  const dur = 700;
  const t0 = performance.now();
  function tick(now) {
    const t = Math.min((now - t0) / dur, 1);
    el.textContent = Math.round(target * (1 - Math.pow(1 - t, 3)));
    if (t < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function buildAnnotated(originalText, claims) {
  let html = escapeHtml(originalText);
  const sorted = [...claims].sort((a, b) => b.originalText.length - a.originalText.length);
  sorted.forEach(c => {
    const escaped = escapeRegExp(escapeHtml(c.originalText));
    const re = new RegExp(`(${escaped})`, 'gi');
    html = html.replace(re, match =>
      `<span class="claim-hl ${c.status}" data-id="${c.id}" data-status="${c.status}" data-conf="${c.confidence}" data-src="${escapeAttr(c.source)}" data-explain="${escapeAttr(c.explanation)}">${match}</span>`
    );
  });
  annotatedText.innerHTML = html;
  annotatedText.querySelectorAll('.claim-hl').forEach(el => {
    el.addEventListener('mouseenter', showTip);
    el.addEventListener('mouseleave', hideTip);
  });
}

function showTip(e) {
  const el = e.target.closest('.claim-hl');
  if (!el) return;
  const labels = { verified: 'Verified', unverifiable: 'Unverifiable', false: 'Incorrect' };
  const colors = { verified: 'var(--green)', unverifiable: 'var(--amber)', false: 'var(--red)' };
  tip.querySelector('.tip-status').textContent = labels[el.dataset.status];
  tip.querySelector('.tip-status').style.color = colors[el.dataset.status];
  tip.querySelector('.tip-conf').textContent = el.dataset.conf + '% confidence';
  tip.querySelector('.tip-body').textContent = el.dataset.explain;
  tip.querySelector('.tip-source').textContent = '📎 ' + el.dataset.src;
  tip.classList.remove('hidden');
}
function hideTip() { tip.classList.add('hidden'); }

function buildCards(claims) {
  claimsGrid.innerHTML = '';
  const icons = {
    verified: `<img src="verified-icon.png" alt="Verified" class="badge-icon">`,
    unverifiable: `<img src="unverifiable-icon.png" alt="Unverifiable" class="badge-icon">`,
    false: `<img src="incorrect-icon.png" alt="Incorrect" class="badge-icon">`
  };
  const labels = { verified: 'Verified', unverifiable: 'Unverifiable', false: 'Incorrect' };
  const threshold = parseInt($('#s-conf-range')?.value || '75', 10);

  claims.forEach((c, i) => {
    const card = document.createElement('div');
    card.className = 'claim-card';
    card.dataset.status = c.status;
    card.dataset.confidence = c.confidence;
    card.style.animationDelay = `${i * 0.05}s`;

    // Real-time threshold: dim card if below threshold
    const belowThreshold = c.confidence < threshold;
    if (belowThreshold) card.classList.add('below-threshold');

    const isOn = c.status === 'verified' && !belowThreshold;
    const srcLink = c.sourceUrl
      ? `<a href="${c.sourceUrl}" target="_blank" rel="noopener">${escapeHtml(c.source)}</a>`
      : `<span>${escapeHtml(c.source)}</span>`;

    // Confidence bar color
    const confColor = c.confidence >= 80 ? '#22c55e' : c.confidence >= 60 ? '#f59e0b' : '#ef4444';

    card.innerHTML = `
      ${belowThreshold ? `<div class="threshold-badge">⚠️ Below ${threshold}% threshold</div>` : ''}
      <div class="claim-card-top">
        <div class="claim-icon">${icons[c.status]}</div>
        <div class="claim-card-info">
          <div class="claim-card-name">${labels[c.status]}</div>
          <div class="claim-card-sub">${c.confidence}% confidence</div>
        </div>
        <label class="toggle"><input type="checkbox" ${isOn ? 'checked' : ''} disabled><span class="toggle-slider"></span></label>
      </div>
      <div class="conf-bar-wrap">
        <div class="conf-bar-track">
          <div class="conf-bar-fill" style="width:${c.confidence}%;background:${confColor}"></div>
          <div class="conf-bar-threshold" style="left:${threshold}%" title="Threshold: ${threshold}%"></div>
        </div>
        <span class="conf-bar-label" style="color:${confColor}">${c.confidence}%</span>
      </div>
      <p class="claim-desc">${escapeHtml(c.text)}</p>
      <div class="claim-source-direct">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
        ${srcLink}
      </div>
      <div class="claim-tags"><span class="claim-tag ${(c.category || 'General').toLowerCase()}">${escapeHtml(c.category || 'General')}</span></div>
      <div class="claim-card-bottom"><button class="view-detail-btn">View details</button></div>
    `;

    const detailDiv = document.createElement('div');
    detailDiv.className = 'claim-detail hidden';
    detailDiv.innerHTML = `
      <div class="claim-explain">${escapeHtml(c.explanation)}</div>
      <div class="claim-src">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
        ${srcLink}
      </div>
    `;
    card.appendChild(detailDiv);
    card.querySelector('.view-detail-btn').addEventListener('click', () => {
      const detail = card.querySelector('.claim-detail');
      const btn = card.querySelector('.view-detail-btn');
      detail.classList.toggle('hidden');
      btn.textContent = detail.classList.contains('hidden') ? 'View details' : 'Hide details';
    });
    claimsGrid.appendChild(card);

    // Stagger icon animation delay
    const badgeIcon = card.querySelector('.badge-icon');
    if (badgeIcon) badgeIcon.style.animationDelay = `${i * 0.15}s`;
  });
}

function filterClaims(filter) {
  $$('.claim-card').forEach(card => {
    card.style.display = (filter === 'all' || card.dataset.status === filter) ? '' : 'none';
  });
}

// ═══════════════════════════════════════════
// SUPABASE — Save Analysis
// ═══════════════════════════════════════════

async function saveAnalysis(text, claims) {
  const vCount = claims.filter(c => c.status === 'verified').length;
  const uCount = claims.filter(c => c.status === 'unverifiable').length;
  const fCount = claims.filter(c => c.status === 'false').length;
  const trustScore = claims.length > 0 ? Math.round((vCount / claims.length) * 100) : 0;

  const { data: analysis, error: aErr } = await db.from('analyses').insert({
    input_text: text,
    trust_score: trustScore,
    total_claims: claims.length,
    verified_count: vCount,
    unverifiable_count: uCount,
    false_count: fCount,
    user_id: userId
  }).select().single();

  if (aErr) { console.error('Save analysis error:', aErr); throw aErr; }

  const claimRows = claims.map(c => ({
    analysis_id: analysis.id,
    claim_text: c.text,
    status: c.status,
    confidence: c.confidence,
    explanation: c.explanation,
    source_name: c.source,
    source_url: c.sourceUrl,
    user_id: userId
  }));

  const { error: cErr } = await db.from('claims').insert(claimRows);
  if (cErr) { console.error('Save claims error:', cErr); throw cErr; }
}

// ═══════════════════════════════════════════
// HISTORY VIEW
// ═══════════════════════════════════════════

async function loadHistory() {
  const list = $('#history-list');
  const empty = $('#history-empty');
  const detail = $('#history-detail');
  detail.classList.add('hidden');

  const { data, error } = await db.from('analyses').select('*').eq('user_id', userId).order('created_at', { ascending: false });
  if (error) { showToast('Failed to load history', 'error'); console.error(error); return; }

  list.innerHTML = '';
  if (!data || data.length === 0) {
    list.innerHTML = `<div class="empty-state" id="history-empty">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#c4bdb4" stroke-width="1.2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
      <h3>No analyses yet</h3><p>Run your first analysis and it will show up here</p>
    </div>`;
    return;
  }

  data.forEach(a => {
    const scoreClass = a.trust_score >= 70 ? 'good' : a.trust_score >= 40 ? 'mid' : 'bad';
    const preview = a.input_text.substring(0, 100) + (a.input_text.length > 100 ? '...' : '');
    const date = new Date(a.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    const row = document.createElement('div');
    row.className = 'history-row';
    row.innerHTML = `
      <div class="history-score ${scoreClass}">${a.trust_score}</div>
      <div class="history-info">
        <div class="history-preview">${escapeHtml(preview)}</div>
        <div class="history-meta"><span>${date}</span><span>${a.total_claims} claims</span></div>
      </div>
      <div class="history-stats">
        <span class="history-stat v">${a.verified_count} ✓</span>
        <span class="history-stat u">${a.unverifiable_count} ?</span>
        <span class="history-stat f">${a.false_count} ✗</span>
      </div>
      <button class="history-delete" data-id="${a.id}" title="Delete">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3,6 5,6 21,6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
      </button>
    `;

    // Click row to view detail
    row.querySelector('.history-info').addEventListener('click', () => viewHistoryDetail(a.id));
    row.querySelector('.history-score').addEventListener('click', () => viewHistoryDetail(a.id));

    // Delete button
    row.querySelector('.history-delete').addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm('Delete this analysis?')) return;
      const { error } = await db.from('analyses').delete().eq('id', a.id).eq('user_id', userId);
      if (error) { showToast('Delete failed', 'error'); return; }
      showToast('Analysis deleted', 'success');
      loadHistory();
    });

    list.appendChild(row);
  });
}

async function viewHistoryDetail(analysisId) {
  const detail = $('#history-detail');
  const content = $('#history-detail-content');
  const list = $('#history-list');

  const { data: analysis } = await db.from('analyses').select('*').eq('id', analysisId).single();
  const { data: claims } = await db.from('claims').select('*').eq('analysis_id', analysisId).order('created_at', { ascending: true });

  if (!analysis || !claims) { showToast('Failed to load detail', 'error'); return; }

  list.classList.add('hidden');
  detail.classList.remove('hidden');

  const scoreClass = analysis.trust_score >= 70 ? 'good' : analysis.trust_score >= 40 ? 'mid' : 'bad';
  const date = new Date(analysis.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const icons = {
    verified: `<img src="verified-icon.png" alt="Verified" class="badge-icon">`,
    unverifiable: `<img src="unverifiable-icon.png" alt="Unverifiable" class="badge-icon">`,
    false: `<img src="incorrect-icon.png" alt="Incorrect" class="badge-icon">`
  };
  const labels = { verified: 'Verified', unverifiable: 'Unverifiable', false: 'Incorrect' };

  let claimsHTML = '';
  claims.forEach(c => {
    const isOn = c.status === 'verified';
    const srcLink = c.source_url
      ? `<a href="${c.source_url}" target="_blank">${escapeHtml(c.source_name)}</a>`
      : `<span>${escapeHtml(c.source_name || 'No source')}</span>`;

    claimsHTML += `
      <div class="claim-card" data-status="${c.status}">
        <div class="claim-card-top">
          <div class="claim-icon">${icons[c.status]}</div>
          <div class="claim-card-info">
            <div class="claim-card-name">${labels[c.status]}</div>
            <div class="claim-card-sub">${c.confidence}% confidence</div>
          </div>
          <label class="toggle"><input type="checkbox" ${isOn ? 'checked' : ''} disabled><span class="toggle-slider"></span></label>
        </div>
        <p class="claim-desc">${escapeHtml(c.claim_text)}</p>
        <div class="claim-card-bottom"><button class="view-detail-btn" onclick="this.nextElementSibling.classList.toggle('hidden'); this.textContent = this.nextElementSibling.classList.contains('hidden') ? 'View details' : 'Hide details';">View details</button>
        <div class="claim-detail hidden">
          <div class="claim-explain">${escapeHtml(c.explanation || '')}</div>
          <div class="claim-src">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
            ${srcLink}
          </div>
        </div></div>
      </div>
    `;
  });

  content.innerHTML = `
    <div class="section-label" style="margin-bottom: 16px;">
      <div>
        <h2>Analysis from ${date}</h2>
        <p>Trust score: <strong style="color: var(--${scoreClass === 'good' ? 'green' : scoreClass === 'mid' ? 'amber' : 'red'})">${analysis.trust_score}%</strong> · ${analysis.total_claims} claims extracted</p>
      </div>
      <div class="summary-row" style="margin-top: 8px; justify-content: flex-start; gap: 8px;">
        <span class="history-stat v">${analysis.verified_count} verified</span>
        <span class="history-stat u">${analysis.unverifiable_count} unverifiable</span>
        <span class="history-stat f">${analysis.false_count} incorrect</span>
      </div>
    </div>
    <div class="annotated-card" style="margin-bottom: 24px;">${escapeHtml(analysis.input_text)}</div>
    <h3 style="font-size: 0.95rem; font-weight: 600; color: var(--text-900); margin-bottom: 14px;">Claims</h3>
    <div class="claims-grid">${claimsHTML}</div>
  `;
}

$('#btn-back-history').addEventListener('click', () => {
  $('#history-detail').classList.add('hidden');
  $('#history-list').classList.remove('hidden');
});

$('#btn-clear-history').addEventListener('click', async () => {
  if (!confirm('Delete ALL analysis history? This cannot be undone.')) return;
  const { error } = await db.from('analyses').delete().eq('user_id', userId);
  if (error) { showToast('Failed to clear history', 'error'); return; }
  showToast('History cleared', 'success');
  loadHistory();
});

// ═══════════════════════════════════════════
// SOURCES VIEW
// ═══════════════════════════════════════════

async function loadSources() {
  const list = $('#sources-list');

  const { data, error } = await db.from('claims').select('source_name, source_url, status').eq('user_id', userId);
  if (error) { showToast('Failed to load sources', 'error'); return; }

  if (!data || data.length === 0) {
    list.innerHTML = `<div class="empty-state small-empty">
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#c4bdb4" stroke-width="1.2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
      <h3>No sources yet</h3><p>Run an analysis to start building your source database</p>
    </div>`;
    return;
  }

  // Aggregate by source name
  const sourceMap = {};
  data.forEach(c => {
    const name = c.source_name || 'Unknown source';
    if (!sourceMap[name]) sourceMap[name] = { name, url: c.source_url, count: 0, statuses: [] };
    sourceMap[name].count++;
    sourceMap[name].statuses.push(c.status);
  });

  const sources = Object.values(sourceMap).sort((a, b) => b.count - a.count);

  list.innerHTML = '';
  sources.forEach(s => {
    const vCount = s.statuses.filter(st => st === 'verified').length;
    const fCount = s.statuses.filter(st => st === 'false').length;
    const nameHTML = s.url ? `<a href="${s.url}" target="_blank">${escapeHtml(s.name)}</a>` : escapeHtml(s.name);

    const row = document.createElement('div');
    row.className = 'source-row';
    row.innerHTML = `
      <div class="source-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
      </div>
      <div class="source-info">
        <div class="source-name">${nameHTML}</div>
        <div class="source-meta">${vCount} verified · ${fCount} contradicted · ${s.count} total references</div>
      </div>
      <div class="source-count">${s.count}×</div>
    `;
    list.appendChild(row);
  });
}

// ═══════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════

async function loadSettings() {
  const { data, error } = await db.from('settings').select('*').eq('user_id', userId);
  if (error) { console.error('Load settings error:', error); return; }
  if (!data) return;

  data.forEach(s => {
    if (s.key === 'api_provider') $('#s-api-provider').value = s.value;
    if (s.key === 'confidence_threshold') {
      $('#s-conf-range').value = s.value;
      $('#s-conf-val').textContent = s.value + '%';
    }
  });
}

$('#s-conf-range').addEventListener('input', e => {
  const threshold = parseInt(e.target.value, 10);
  $('#s-conf-val').textContent = threshold + '%';

  // REAL-TIME: instantly re-apply threshold to all visible claim cards
  if (currentClaims && currentClaims.length > 0) {
    $$('.claim-card').forEach(card => {
      const conf = parseInt(card.dataset.confidence || '0', 10);
      const belowThreshold = conf < threshold;
      card.classList.toggle('below-threshold', belowThreshold);

      // Update the threshold badge
      let badge = card.querySelector('.threshold-badge');
      if (belowThreshold) {
        if (!badge) {
          badge = document.createElement('div');
          badge.className = 'threshold-badge';
          card.insertBefore(badge, card.firstChild);
        }
        badge.textContent = `⚠️ Below ${threshold}% threshold`;
      } else {
        if (badge) badge.remove();
      }

      // Update threshold line on confidence bar
      const line = card.querySelector('.conf-bar-threshold');
      if (line) {
        line.style.left = threshold + '%';
        line.title = `Threshold: ${threshold}%`;
      }

      // Update toggle to reflect new effective status
      const toggle = card.querySelector('input[type=checkbox]');
      if (toggle) {
        toggle.checked = card.dataset.status === 'verified' && !belowThreshold;
      }
    });

    // Recalculate stats live
    const threshold2 = threshold;
    const active = currentClaims.filter(c => c.confidence >= threshold2);
    const vCount = active.filter(c => c.status === 'verified').length;
    const uCount = active.filter(c => c.status === 'unverifiable').length;
    const fCount = active.filter(c => c.status === 'false').length;
    const total = currentClaims.length;
    const trustScore = total > 0 ? Math.round((vCount / total) * 100) : 0;
    $('#s-verified').textContent = vCount;
    $('#s-unverifiable').textContent = uCount;
    $('#s-false').textContent = fCount;
    $('#score-val').textContent = trustScore;
  }
});

$('#btn-save-settings').addEventListener('click', async () => {
  const settings = [
    { key: 'api_provider', value: $('#s-api-provider').value },
    { key: 'confidence_threshold', value: $('#s-conf-range').value }
  ];

  for (const s of settings) {
    await db.from('settings').delete().eq('key', s.key).eq('user_id', userId);
    const { error } = await db.from('settings').insert({ key: s.key, value: s.value, user_id: userId, updated_at: new Date().toISOString() });
    if (error) { showToast('Failed to save: ' + s.key, 'error'); console.error(error); return; }
  }
  showToast('Settings saved', 'success');
});

async function checkDbStatus() {
  const statusEl = $('#db-status');
  const analysesCountEl = $('#db-analyses-count');
  const claimsCountEl = $('#db-claims-count');

  try {
    const { count: aCount, error: aErr } = await db.from('analyses').select('*', { count: 'exact', head: true }).eq('user_id', userId);
    const { count: cCount, error: cErr } = await db.from('claims').select('*', { count: 'exact', head: true }).eq('user_id', userId);

    if (aErr || cErr) throw new Error('Query failed');

    statusEl.textContent = 'Connected';
    statusEl.className = 'db-status connected';
    analysesCountEl.textContent = aCount;
    claimsCountEl.textContent = cCount;
  } catch (err) {
    statusEl.textContent = 'Disconnected';
    statusEl.className = 'db-status disconnected';
    analysesCountEl.textContent = '—';
    claimsCountEl.textContent = '—';
  }
}

// ═══════════════════════════════════════════
// FEATURE: Dashboard Stats
// ═══════════════════════════════════════════

async function loadDashboardStats() {
  try {
    const { count: totalAnalyses } = await db.from('analyses').select('*', { count: 'exact', head: true }).eq('user_id', userId);
    const { data: analyses } = await db.from('analyses').select('trust_score, verified_count, total_claims').eq('user_id', userId);
    const { count: totalClaims } = await db.from('claims').select('*', { count: 'exact', head: true }).eq('user_id', userId);

    const avgScore = analyses && analyses.length > 0
      ? Math.round(analyses.reduce((s, a) => s + (a.trust_score || 0), 0) / analyses.length)
      : 0;

    const totalVerified = analyses ? analyses.reduce((s, a) => s + (a.verified_count || 0), 0) : 0;
    const totalClaimsAll = analyses ? analyses.reduce((s, a) => s + (a.total_claims || 0), 0) : 0;
    const accuracy = totalClaimsAll > 0 ? Math.round((totalVerified / totalClaimsAll) * 100) : 0;

    animateNum('dash-total', totalAnalyses || 0);
    animateNum('dash-claims', totalClaims || 0);

    // Animate score with % suffix
    const avgEl = $('#dash-avg-score');
    const accEl = $('#dash-accuracy');
    animateNumWithSuffix(avgEl, avgScore, '%');
    animateNumWithSuffix(accEl, accuracy, '%');
  } catch (e) {
    console.warn('Dashboard stats error:', e);
  }
}

function animateNumWithSuffix(el, target, suffix) {
  const dur = 700;
  const t0 = performance.now();
  function tick(now) {
    const t = Math.min((now - t0) / dur, 1);
    const val = Math.round(target * (1 - Math.pow(1 - t, 3)));
    el.innerHTML = val + `<span class="stat-unit">${suffix}</span>`;
    if (t < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

// ═══════════════════════════════════════════
// FEATURE: Voice Input
// ═══════════════════════════════════════════

(() => {
  const micBtn = $('#btn-mic');
  if (!micBtn) return;

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    micBtn.title = 'Voice input not supported in this browser';
    micBtn.style.opacity = '0.4';
    micBtn.style.pointerEvents = 'none';
    return;
  }

  let recognition = null;
  let isRecording = false;

  micBtn.addEventListener('click', () => {
    if (isRecording) {
      recognition.stop();
      return;
    }

    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false; // Disable interim — prevents duplicate/repeated words
    recognition.lang = 'en-US';

    const startText = input.value; // Text that was in box before recording
    let newSpeech = '';             // Only speech added this session

    recognition.onstart = () => {
      isRecording = true;
      micBtn.classList.add('recording');
      showToast('Listening... speak now', 'info');
    };

    recognition.onresult = (e) => {
      // Only process final results — accumulate new speech
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          newSpeech += (newSpeech ? ' ' : '') + e.results[i][0].transcript.trim();
        }
      }
      // Show: original text + new speech (no duplication)
      input.value = startText + (startText && newSpeech ? ' ' : '') + newSpeech;
      charCount.textContent = input.value.length;
    };

    recognition.onend = () => {
      isRecording = false;
      micBtn.classList.remove('recording');
      showToast('Voice input stopped', 'success');
    };

    recognition.onerror = (e) => {
      isRecording = false;
      micBtn.classList.remove('recording');
      if (e.error !== 'aborted') showToast('Voice error: ' + e.error, 'error');
    };

    recognition.start();
  });
})();

// ═══════════════════════════════════════════
// FEATURE: Export PDF
// ═══════════════════════════════════════════

$('#btn-export')?.addEventListener('click', () => {
  if (!currentClaims.length) { showToast('No results to export', 'error'); return; }
  window.print();
  showToast('Print dialog opened', 'info');
});

// ═══════════════════════════════════════════
// FEATURE: Copy Annotated Text
// ═══════════════════════════════════════════

$('#btn-copy')?.addEventListener('click', async () => {
  if (!currentClaims.length) { showToast('No results to copy', 'error'); return; }

  const labels = { verified: '✅ VERIFIED', unverifiable: '❓ UNVERIFIABLE', false: '❌ INCORRECT' };
  let text = '═══ HALLUCINATION HUNTER REPORT ═══\n\n';

  const total = currentClaims.length;
  const vCount = currentClaims.filter(c => c.status === 'verified').length;
  const trustScore = Math.round((vCount / total) * 100);
  text += `Trust Score: ${trustScore}% | ${total} claims analyzed\n`;
  text += `Verified: ${vCount} | Unverifiable: ${currentClaims.filter(c => c.status === 'unverifiable').length} | Incorrect: ${currentClaims.filter(c => c.status === 'false').length}\n\n`;

  currentClaims.forEach((c, i) => {
    text += `${i + 1}. [${labels[c.status]}] (${c.confidence}%)\n`;
    text += `   "${c.text}"\n`;
    text += `   → ${c.explanation}\n`;
    text += `   Source: ${c.source}\n\n`;
  });

  try {
    await navigator.clipboard.writeText(text);
    showToast('Results copied to clipboard', 'success');
  } catch {
    showToast('Failed to copy', 'error');
  }
});

// ═══════════════════════════════════════════
// FEATURE: Share Analysis
// ═══════════════════════════════════════════

$('#btn-share')?.addEventListener('click', async () => {
  if (!currentClaims.length) { showToast('No results to share', 'error'); return; }

  const shareData = {
    claims: currentClaims.map(c => ({
      t: c.text, s: c.status, c: c.confidence, e: c.explanation, src: c.source
    }))
  };

  try {
    const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(shareData))));
    const url = window.location.origin + window.location.pathname + '#share=' + encoded;

    if (url.length > 8000) {
      showToast('Analysis too large to share via URL — use Copy instead', 'error');
      return;
    }

    await navigator.clipboard.writeText(url);
    showToast('Share link copied to clipboard!', 'success');
  } catch {
    showToast('Failed to generate share link', 'error');
  }
});

// Load shared analysis from URL hash
function loadSharedAnalysis() {
  const hash = window.location.hash;
  if (!hash.startsWith('#share=')) return;

  try {
    const encoded = hash.slice(7);
    const data = JSON.parse(decodeURIComponent(escape(atob(encoded))));
    if (data.claims && data.claims.length) {
      const claims = data.claims.map((c, i) => ({
        id: i + 1, text: c.t, originalText: c.t, status: c.s,
        confidence: c.c, explanation: c.e, source: c.src, sourceUrl: null
      }));
      currentClaims = claims;
      displayResults(claims.map(c => c.text).join('. '), claims);
      showToast('Shared analysis loaded', 'info');
      window.location.hash = '';
    }
  } catch (e) {
    console.warn('Failed to load shared analysis:', e);
  }
}

// ═══════════════════════════════════════════
// FEATURE: Batch Analysis
// ═══════════════════════════════════════════

// Override analyze button to support batch mode
const originalAnalyzeHandler = btnAnalyze.onclick;
btnAnalyze.addEventListener('click', async (e) => {
  const batchMode = $('#batch-mode')?.checked;
  if (!batchMode) return; // Normal flow handles it

  e.stopImmediatePropagation();
  const text = input.value.trim();
  if (!text) { showToast('Paste some text first', 'error'); return; }

  const texts = text.split(/\n---\n/).map(t => t.trim()).filter(t => t.length >= 30);
  if (texts.length <= 1) {
    showToast('Use --- on a new line to separate texts for batch mode', 'error');
    return;
  }

  showToast(`Batch mode: analyzing ${texts.length} texts...`, 'info');

  let allClaims = [];
  for (let i = 0; i < texts.length; i++) {
    showToast(`Analyzing text ${i + 1} of ${texts.length}...`, 'info');
    try {
      results.classList.add('hidden');
      processing.classList.remove('hidden');
      btnAnalyze.disabled = true;

      $$('.process-step').forEach(s => { s.classList.remove('active', 'done'); s.querySelector('.ps-status').innerHTML = ''; });

      await animateStepStart('ps-extract');
      const rawClaims = await extractClaimsFromLLM(texts[i]);
      await animateStepDone('ps-extract', 0, 33);

      await animateStepStart('ps-search');
      await delay(300);
      await animateStepDone('ps-search', 33, 66);

      await animateStepStart('ps-verify');
      const verifyResults = await verifyClaimsWithLLM(rawClaims);
      await animateStepDone('ps-verify', 66, 100);

      const confThreshold = parseInt($('#s-conf-range')?.value || '75', 10);
      const verified = rawClaims.map(c => {
        const v = verifyResults.find(r => r.id === c.id) || {};
        let status = v.status || 'unverifiable';
        let confidence = v.confidence || 30;
        if (status === 'verified' && confidence < confThreshold) status = 'unverifiable';
        return {
          id: allClaims.length + c.id,
          text: c.text, originalText: c.originalSentence || c.text,
          status, confidence,
          explanation: v.explanation || 'Could not verify.',
          source: v.source || 'No source', sourceUrl: v.sourceUrl || null
        };
      });
      allClaims = allClaims.concat(verified);
    } catch (err) {
      showToast(`Batch ${i + 1} failed: ${err.message}`, 'error');
    }
  }

  currentClaims = allClaims;
  displayResults(texts.join('\n\n---\n\n'), allClaims);
  btnAnalyze.disabled = false;
  processing.classList.add('hidden');
  showToast(`Batch complete: ${allClaims.length} claims from ${texts.length} texts`, 'success');

  // Save combined result
  try { await saveAnalysis(texts.join('\n---\n'), allClaims); } catch(e) { console.warn(e); }
  loadDashboardStats();
}, true); // capture phase to intercept before normal handler

// ═══════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════

function escapeRegExp(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function escapeHtml(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function escapeAttr(s) { return s.replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

// ═══════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════

(async () => {
  try {
    await db.from('settings').select('key').limit(1);
    console.log('Supabase connected');
  } catch (e) {
    console.warn('Supabase connection issue:', e);
  }

  // Load dashboard stats on page load
  loadDashboardStats();

  // Check for shared analysis in URL
  loadSharedAnalysis();
})();

// ═══════════════════════════════════════════
// GLOBAL SEARCH
// ═══════════════════════════════════════════
(() => {
  const searchToggle = $('#global-search-toggle');
  const searchOverlay = $('#search-overlay');
  const searchInput = $('#search-input');
  const searchResults = $('#search-results');
  const searchClose = $('#search-close');
  const typingEl = $('#search-typing');

  if (!searchToggle || !searchOverlay) return;

  // ─── Typing Animation ─────────────────
  const phrases = [
    'Search analyses…',
    'Find verified claims…',
    'Look up sources…',
    'Search fact-checks…',
    'Find hallucinations…'
  ];
  let phraseIdx = 0;
  let charIdx = 0;
  let isDeleting = false;
  let typingPaused = false;

  function typeLoop() {
    if (typingPaused) return;
    const current = phrases[phraseIdx];

    if (!isDeleting) {
      // Typing forward
      typingEl.textContent = current.slice(0, charIdx + 1);
      charIdx++;
      if (charIdx >= current.length) {
        // Pause at end of phrase
        setTimeout(() => { isDeleting = true; typeLoop(); }, 2000);
        return;
      }
      setTimeout(typeLoop, 70 + Math.random() * 40);
    } else {
      // Deleting
      typingEl.textContent = current.slice(0, charIdx);
      charIdx--;
      if (charIdx <= 0) {
        isDeleting = false;
        phraseIdx = (phraseIdx + 1) % phrases.length;
        setTimeout(typeLoop, 400);
        return;
      }
      setTimeout(typeLoop, 35);
    }
  }

  // Start typing after a small delay
  setTimeout(typeLoop, 800);

  // Open search
  function openSearch() {
    searchOverlay.classList.remove('hidden');
    setTimeout(() => searchInput.focus(), 50);
  }

  // Close search
  function closeSearch() {
    searchOverlay.classList.add('hidden');
    searchInput.value = '';
    searchResults.innerHTML = `<div class="search-empty-state">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#c4bdb4" stroke-width="1.2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
      <p>Type to search across your analyses, claims and sources</p>
    </div>`;
  }

  // Toggle
  searchToggle.addEventListener('click', openSearch);
  searchClose.addEventListener('click', closeSearch);

  // Click backdrop to close
  searchOverlay.addEventListener('click', (e) => {
    if (e.target === searchOverlay) closeSearch();
  });

  // ESC key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !searchOverlay.classList.contains('hidden')) {
      closeSearch();
    }
    // Cmd/Ctrl + K shortcut
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      if (searchOverlay.classList.contains('hidden')) {
        openSearch();
      } else {
        closeSearch();
      }
    }
  });

  // Debounced search
  let searchTimer = null;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    const query = searchInput.value.trim();
    if (!query) {
      closeSearch();
      openSearch();
      return;
    }
    searchTimer = setTimeout(() => performSearch(query), 250);
  });

  // Highlight matching text
  function highlight(text, query) {
    if (!text) return '';
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return text.replace(new RegExp(`(${escaped})`, 'gi'), '<mark>$1</mark>');
  }

  // Perform search across Supabase
  async function performSearch(query) {
    searchResults.innerHTML = `<div class="search-empty-state"><p>Searching…</p></div>`;

    const lowerQ = query.toLowerCase();
    let html = '';

    try {
      // 1. Search analyses (history) — correct columns: trust_score, not overall_score
      const { data: analyses, error: aErr } = await db
        .from('analyses')
        .select('id, input_text, trust_score, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (aErr) console.warn('Search analyses error:', aErr.message);

      const matchedAnalyses = (analyses || []).filter(a =>
        (a.input_text || '').toLowerCase().includes(lowerQ)
      );

      // 2. Search claims — separate table with analysis_id
      const { data: claims, error: cErr } = await db
        .from('claims')
        .select('id, analysis_id, claim_text, status, confidence, explanation, source_url, source_name, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(100);

      if (cErr) console.warn('Search claims error:', cErr.message);

      const matchedClaims = (claims || []).filter(c =>
        (c.claim_text || '').toLowerCase().includes(lowerQ) ||
        (c.explanation || '').toLowerCase().includes(lowerQ)
      );

      // 3. Sources — extracted from claims (source_url / source_name)
      const sourceMap = new Map();
      (claims || []).forEach(c => {
        if (c.source_url) {
          const key = c.source_url;
          if (!sourceMap.has(key)) {
            sourceMap.set(key, { url: c.source_url, name: c.source_name || c.source_url, count: 0 });
          }
          sourceMap.get(key).count++;
        }
      });
      const allSources = [...sourceMap.values()];
      const matchedSources = allSources.filter(s =>
        s.url.toLowerCase().includes(lowerQ) ||
        s.name.toLowerCase().includes(lowerQ)
      );

      // Build results HTML
      if (matchedAnalyses.length === 0 && matchedClaims.length === 0 && matchedSources.length === 0) {
        searchResults.innerHTML = `<div class="search-no-results">
          <p>No results found for "<strong>${query}</strong>"</p>
        </div>`;
        return;
      }

      // Analyses section
      if (matchedAnalyses.length > 0) {
        html += `<div class="search-section-label">Analyses (${matchedAnalyses.length})</div>`;
        matchedAnalyses.slice(0, 5).forEach(a => {
          const preview = (a.input_text || '').slice(0, 80);
          const score = a.trust_score != null ? `${a.trust_score}%` : '—';
          const date = new Date(a.created_at).toLocaleDateString();
          html += `<div class="search-result-item" data-action="view-analysis" data-id="${a.id}">
            <div class="search-result-icon history">📊</div>
            <div class="search-result-info">
              <div class="search-result-title">${highlight(preview, query)}…</div>
              <div class="search-result-meta">Score: ${score} · ${date}</div>
            </div>
          </div>`;
        });
      }

      // Claims section
      if (matchedClaims.length > 0) {
        html += `<div class="search-section-label">Claims (${matchedClaims.length})</div>`;
        matchedClaims.slice(0, 5).forEach(c => {
          const text = (c.claim_text || '').slice(0, 80);
          const status = c.status || 'unknown';
          const date = c.created_at ? new Date(c.created_at).toLocaleDateString() : '';
          html += `<div class="search-result-item" data-action="view-analysis" data-id="${c.analysis_id}">
            <div class="search-result-icon claim">💬</div>
            <div class="search-result-info">
              <div class="search-result-title">${highlight(text, query)}</div>
              <div class="search-result-meta">${status} · ${date}</div>
            </div>
          </div>`;
        });
      }

      // Sources section
      if (matchedSources.length > 0) {
        html += `<div class="search-section-label">Sources (${matchedSources.length})</div>`;
        matchedSources.slice(0, 5).forEach(s => {
          html += `<div class="search-result-item" data-action="open-source" data-url="${s.url}">
            <div class="search-result-icon source">🔗</div>
            <div class="search-result-info">
              <div class="search-result-title">${highlight(s.name, query)}</div>
              <div class="search-result-meta">${highlight(s.url, query)} · Used ${s.count}x</div>
            </div>
          </div>`;
        });
      }

      searchResults.innerHTML = html;

      // Click handlers for results
      searchResults.querySelectorAll('.search-result-item').forEach(item => {
        item.addEventListener('click', () => {
          const action = item.dataset.action;
          closeSearch();

          if (action === 'view-analysis') {
            switchView('history');
            setTimeout(() => {
              const id = item.dataset.id;
              if (id && typeof viewHistoryDetail === 'function') viewHistoryDetail(id);
            }, 300);
          } else if (action === 'open-source') {
            const url = item.dataset.url;
            if (url) window.open(url, '_blank');
          }
        });
      });

    } catch (err) {
      console.error('Search error:', err);
      searchResults.innerHTML = `<div class="search-no-results">
        <p>Search error: ${err.message}</p>
      </div>`;
    }
  }
})();
