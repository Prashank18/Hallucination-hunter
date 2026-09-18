// ═══════════════════════════════════════════
// HALLUCINATION HUNTER — Round 1 (No Database)
// Features: Core Analyzer + Voice Input
// ═══════════════════════════════════════════

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
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type] || icons.info}</span><span>${message}</span>`;
  toastContainer.appendChild(toast);
  setTimeout(() => { toast.classList.add('fade-out'); setTimeout(() => toast.remove(), 300); }, 3500);
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
  $(`#view-${viewName}`).classList.add('active');
  const sidebarMatch = document.querySelector(`.sidebar-link[data-view="${viewName}"]`);
  if (sidebarMatch) sidebarMatch.classList.add('active');
}

function updateMobileNav(btn) {
  document.querySelectorAll('.mobile-nav-link').forEach(m => m.classList.remove('active'));
  btn.classList.add('active');
}

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

const IS_LOCAL = location.protocol === 'file:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
const GROQ_MODEL = 'openai/gpt-oss-120b';

async function callGroq(messages, temperature = 0.1) {
  const body = { model: GROQ_MODEL, messages, temperature, response_format: { type: 'json_object' } };
  let res;

  if (window.GROQ_API_KEY) {
    res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${window.GROQ_API_KEY}` },
      body: JSON.stringify(body)
    });
  } else {
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
  const claimsList = claims.map(c => `${c.id}. "${c.text}"`).join('\n');

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
    { role: 'user', content: `Verify these claims:\n${claimsList}` }
  ], 0.1);

  // Map well-known source names to VERIFIED REAL URLs
  const knownSourceUrls = {
    'nasa': 'https://www.nasa.gov',
    'who': 'https://www.who.int',
    'world health organization': 'https://www.who.int',
    'cdc': 'https://www.cdc.gov',
    'wikipedia': 'https://en.wikipedia.org',
    'britannica': 'https://www.britannica.com',
    'national geographic': 'https://www.nationalgeographic.com',
    'nih': 'https://www.nih.gov',
    'python software foundation': 'https://www.python.org',
    'python.org': 'https://www.python.org',
    'no source available': null,
    'no source': null,
    'general knowledge': null,
    'common knowledge': null
  };

  const results = result.results || [];
  return results.map(r => {
    const srcName = (r.source || '').toLowerCase().trim();
    // If the LLM gave a specific URL (contains a path beyond domain), keep it
    // Otherwise fall back to whitelist
    if (r.sourceUrl && r.sourceUrl.includes('/') && r.sourceUrl.split('/').length > 4) {
      // Looks like a specific page URL — keep it
    } else if (knownSourceUrls.hasOwnProperty(srcName)) {
      r.sourceUrl = knownSourceUrls[srcName];
    } else {
      r.sourceUrl = null;
    }
    return r;
  });
}

// ═══════════════════════════════════════════
// ANALYSIS PIPELINE
// ═══════════════════════════════════════════

async function runAnalysis(text) {
  results.classList.add('hidden');
  processing.classList.remove('hidden');
  btnAnalyze.disabled = true;

  $$('.process-step').forEach(s => { s.classList.remove('active', 'done'); s.querySelector('.ps-status').innerHTML = ''; });

  const confThreshold = parseInt($('#s-conf-range')?.value || '75', 10);

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

    // Step 2: Search sources (visual step)
    await animateStepStart('ps-search');
    await delay(600);
    await animateStepDone('ps-search', 33, 66);

    // Step 3: Verify claims via Groq
    await animateStepStart('ps-verify');
    const verifyResults = await verifyClaimsWithLLM(rawClaims);
    await animateStepDone('ps-verify', 66, 100);

    // Merge extraction + verification
    const verified = rawClaims.map(c => {
      const v = verifyResults.find(r => r.id === c.id) || {};
      let status = v.status || 'unverifiable';
      let confidence = v.confidence || 30;

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

    currentClaims = verified;
    displayResults(text, verified);
    showToast('Analysis complete!', 'success');
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

  claims.forEach((c, i) => {
    const card = document.createElement('div');
    card.className = 'claim-card';
    card.dataset.status = c.status;
    card.style.animationDelay = `${i * 0.05}s`;
    const isOn = c.status === 'verified';
    const srcLink = c.sourceUrl
      ? `<a href="${c.sourceUrl}" target="_blank" rel="noopener">${escapeHtml(c.source)}</a>`
      : `<span>${escapeHtml(c.source)}</span>`;

    card.innerHTML = `
      <div class="claim-card-top">
        <div class="claim-icon">${icons[c.status]}</div>
        <div class="claim-card-info">
          <div class="claim-card-name">${labels[c.status]}</div>
          <div class="claim-card-sub">${c.confidence}% confidence</div>
        </div>
        <label class="toggle"><input type="checkbox" ${isOn ? 'checked' : ''} disabled><span class="toggle-slider"></span></label>
      </div>
      <p class="claim-desc">${escapeHtml(c.text)}</p>
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
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    const startText = input.value;
    let newSpeech = '';

    recognition.onstart = () => {
      isRecording = true;
      micBtn.classList.add('recording');
      showToast('Listening... speak now', 'info');
    };

    recognition.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          newSpeech += (newSpeech ? ' ' : '') + e.results[i][0].transcript.trim();
        }
      }
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
// UTILITIES
// ═══════════════════════════════════════════

function escapeRegExp(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function escapeHtml(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function escapeAttr(s) { return s.replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

// ═══════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════

console.log('Hallucination Hunter loaded (no-DB mode)');
