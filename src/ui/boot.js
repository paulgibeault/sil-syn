/**
 * Boot Sequence — cold boot cinematic + training completion screens.
 *
 * Shows a terminal-style typewriter animation on first launch.
 * Sets localStorage flag 'boot_complete' when training finishes.
 */

const BOOT_LINES = [
  { text: 'SILICON SYNDICATE OS v1.0', delay: 0, color: '#39bae6', bold: true },
  { text: '', delay: 300 },
  { text: 'INITIALIZING MCU-001...', delay: 400, color: '#7fd962' },
  { text: '', delay: 200 },
  { text: '░░░░░░░░░░░░░░░░░░░░ 0%', delay: 100, id: 'boot-progress' },
  { text: '', delay: 800 },
  { text: '> CORE REGISTERS: ', delay: 200, inline: 'OK', inlineColor: '#7fd962' },
  { text: '> PIN ARRAY: ', delay: 300, inline: 'OK', inlineColor: '#7fd962' },
  { text: '> ROM CHECKSUM: ', delay: 250, inline: 'PASS', inlineColor: '#7fd962' },
  { text: '> CLOCK SYNC: ', delay: 300, inline: '1.0 MHz', inlineColor: '#5ccfe6' },
  { text: '', delay: 400 },
  { text: 'READY.', delay: 200, color: '#7fd962', bold: true },
  { text: '', delay: 600 },
  { text: '> ENGINEER DETECTED', delay: 300, color: '#e6b450' },
  { text: '> LOADING TRAINING PROTOCOL...', delay: 500, color: '#e6b450' },
];

const TRAINING_COMPLETE_LINES = [
  { text: '', delay: 0 },
  { text: '>', delay: 100, color: '#39bae6' },
  { text: '> TRAINING PROTOCOL COMPLETE', delay: 200, color: '#7fd962', bold: true },
  { text: '>', delay: 300, color: '#39bae6' },
  { text: '> ALL SYSTEMS NOMINAL', delay: 200, color: '#7fd962' },
  { text: '> REAL ASSIGNMENTS INCOMING', delay: 500, color: '#e6b450' },
  { text: '>', delay: 200, color: '#39bae6' },
  { text: '> GOOD LUCK, ENGINEER.', delay: 600, color: '#39bae6', bold: true },
  { text: '', delay: 800 },
];

/**
 * Show the cold-boot cinematic overlay.
 * @param {function} onComplete - Called when animation finishes (or is skipped).
 */
export function showBootCinematic(onComplete) {
  const overlay = document.createElement('div');
  overlay.id = 'boot-overlay';
  overlay.innerHTML = `
    <div id="boot-terminal">
      <div id="boot-output"></div>
      <div id="boot-cursor">█</div>
    </div>
    <div id="boot-skip">tap to skip</div>
  `;
  document.body.appendChild(overlay);

  const outputEl = document.getElementById('boot-output');
  let skipped = false;
  let finished = false;
  let timeouts = [];

  function finish() {
    if (finished) return;
    finished = true;
    timeouts.forEach(t => clearTimeout(t));
    overlay.classList.add('boot-fade-out');
    setTimeout(() => {
      overlay.remove();
      onComplete?.();
    }, 600);
  }

  function skip() {
    if (finished) return;
    skipped = true;
    // Fill in remaining lines instantly
    outputEl.innerHTML = '';
    renderAllLines();
    setTimeout(finish, 400);
  }

  overlay.addEventListener('click', skip);
  overlay.addEventListener('touchstart', skip, { passive: true });

  function renderAllLines() {
    for (const line of BOOT_LINES) {
      const row = buildLineEl(line);
      outputEl.appendChild(row);
    }
    // Replace progress bar with full
    const progress = document.getElementById('boot-progress');
    if (progress) progress.innerHTML = progressBar(100);
  }

  function buildLineEl(line) {
    const row = document.createElement('div');
    row.className = 'boot-line';
    if (line.id) row.id = line.id;

    if (line.bold) row.style.fontWeight = 'bold';
    if (line.color) row.style.color = line.color;

    if (line.inline) {
      const span = document.createElement('span');
      span.style.color = line.inlineColor || '#7fd962';
      span.textContent = line.inline;
      row.textContent = line.text;
      row.appendChild(span);
    } else {
      row.textContent = line.text;
    }

    return row;
  }

  function progressBar(pct) {
    const filled = Math.round(pct / 5);
    const empty = 20 - filled;
    const fill = '█'.repeat(filled) + '░'.repeat(empty);
    return `<span style="color:#7fd962">${fill}</span> <span style="color:#5ccfe6">${pct}%</span>`;
  }

  // Animate progress bar
  function animateProgress(lineEl) {
    let pct = 0;
    const step = () => {
      pct = Math.min(100, pct + Math.floor(Math.random() * 15) + 5);
      lineEl.innerHTML = progressBar(pct);
      if (pct < 100 && !skipped) {
        const t = setTimeout(step, 80 + Math.random() * 60);
        timeouts.push(t);
      }
    };
    step();
  }

  // Type out lines with delays
  let elapsed = 0;
  for (const line of BOOT_LINES) {
    elapsed += line.delay || 0;
    const capturedLine = line;
    const capturedElapsed = elapsed;

    const t = setTimeout(() => {
      if (skipped) return;
      const row = buildLineEl(capturedLine);
      outputEl.appendChild(row);

      if (capturedLine.id === 'boot-progress') {
        animateProgress(row);
      }

      // Auto-scroll
      row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, capturedElapsed);
    timeouts.push(t);

    // Add per-character typing delay for non-empty lines
    elapsed += capturedLine.text.length * 18;
  }

  // Wait a beat, then finish
  const totalTime = elapsed + 400;
  const finalT = setTimeout(() => {
    if (!skipped) finish();
  }, totalTime);
  timeouts.push(finalT);
}

/**
 * Show the "Training Complete" terminal overlay.
 * @param {function} onComplete - Called when the sequence finishes.
 */
export function showTrainingComplete(onComplete) {
  const overlay = document.createElement('div');
  overlay.id = 'boot-overlay';
  overlay.innerHTML = `
    <div id="boot-terminal">
      <div id="boot-output"></div>
      <div id="boot-cursor">█</div>
    </div>
    <div id="boot-skip">tap to continue</div>
  `;
  document.body.appendChild(overlay);

  const outputEl = document.getElementById('boot-output');
  let finished = false;
  let timeouts = [];

  function finish() {
    if (finished) return;
    finished = true;
    timeouts.forEach(t => clearTimeout(t));
    overlay.classList.add('boot-fade-out');
    setTimeout(() => {
      overlay.remove();
      onComplete?.();
    }, 600);
  }

  overlay.addEventListener('click', finish);
  overlay.addEventListener('touchstart', () => {
    if (!finished) finish();
  }, { passive: true });

  let elapsed = 200;
  for (const line of TRAINING_COMPLETE_LINES) {
    elapsed += line.delay || 0;
    const capturedLine = line;
    const capturedElapsed = elapsed;

    const t = setTimeout(() => {
      const row = document.createElement('div');
      row.className = 'boot-line';
      if (capturedLine.bold) row.style.fontWeight = 'bold';
      if (capturedLine.color) row.style.color = capturedLine.color;
      row.textContent = capturedLine.text;
      outputEl.appendChild(row);
      row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, capturedElapsed);
    timeouts.push(t);

    elapsed += capturedLine.text.length * 22;
  }

  const totalTime = elapsed + 1000;
  const finalT = setTimeout(() => {
    if (!finished) finish();
  }, totalTime);
  timeouts.push(finalT);
}
