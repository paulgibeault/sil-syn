/**
 * Main entry point — wires the UI to the simulation engine.
 */

import { createMCU, parseProgram } from './engine/mcu.js';
import { runLevel } from './engine/verifier.js';
import { level01 } from './levels/level01.js';
import { level02 } from './levels/level02.js';
import { level03 } from './levels/level03.js';
import { level04 } from './levels/level04.js';
import { level05 } from './levels/level05.js';
import { TUTORIAL_PAGES } from './tutorial.js';

// ---------------------------------------------------------------------------
// Level registry
// ---------------------------------------------------------------------------

const LEVELS = [level01, level02, level03, level04, level05];

// ---------------------------------------------------------------------------
// DOM refs
// ---------------------------------------------------------------------------

const levelSelect = document.getElementById('level-select');
const levelName = document.getElementById('level-name');
const levelDesc = document.getElementById('level-desc');
const codeEditor = document.getElementById('code-editor');
const codeError = document.getElementById('code-error');
const hint = document.getElementById('hint');
const btnRun = document.getElementById('btn-run');
const btnStep = document.getElementById('btn-step');
const btnReset = document.getElementById('btn-reset');
const btnHelp = document.getElementById('btn-help');
const cycleDisplay = document.getElementById('cycle-display');
const regAcc = document.getElementById('reg-acc');
const regDat = document.getElementById('reg-dat');
const regPc = document.getElementById('reg-pc');
const regState = document.getElementById('reg-state');
const waveformEl = document.getElementById('waveform');
const resultBanner = document.getElementById('result-banner');
const tutorialOverlay = document.getElementById('tutorial-overlay');
const tutorialTitle = document.getElementById('tutorial-title');
const tutorialBody = document.getElementById('tutorial-body');
const tutPrev = document.getElementById('tut-prev');
const tutNext = document.getElementById('tut-next');
const tutDots = document.getElementById('tut-dots');

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let currentLevel = null;
let sim = null;          // { scheduler, verifier, board }
let running = false;
let runTimer = null;
let tutorialPage = 0;

// ---------------------------------------------------------------------------
// localStorage persistence
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'silicon-syndicate';

function loadSavedData() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch { return {}; }
}

function saveData(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch { /* quota exceeded or private mode */ }
}

function getSavedCode(levelId) {
  const data = loadSavedData();
  return data.code?.[levelId] ?? '';
}

function setSavedCode(levelId, code) {
  const data = loadSavedData();
  if (!data.code) data.code = {};
  data.code[levelId] = code;
  saveData(data);
}

function markLevelPassed(levelId) {
  const data = loadSavedData();
  if (!data.passed) data.passed = {};
  data.passed[levelId] = true;
  saveData(data);
}

function hasSeenTutorial() {
  return loadSavedData().tutorialSeen === true;
}

function setTutorialSeen() {
  const data = loadSavedData();
  data.tutorialSeen = true;
  saveData(data);
}

// ---------------------------------------------------------------------------
// Level loading
// ---------------------------------------------------------------------------

function populateLevelSelect() {
  const data = loadSavedData();
  for (const level of LEVELS) {
    const opt = document.createElement('option');
    opt.value = level.id;
    const check = data.passed?.[level.id] ? ' *' : '';
    opt.textContent = `${level.id}: ${level.name}${check}`;
    levelSelect.appendChild(opt);
  }
}

function loadLevel(levelId) {
  stopRun();
  currentLevel = LEVELS.find(l => l.id === levelId);
  if (!currentLevel) return;

  levelName.textContent = `Level ${currentLevel.id}: ${currentLevel.name}`;
  levelDesc.textContent = currentLevel.description;
  hint.textContent = currentLevel.hint || '';
  codeError.style.display = 'none';

  // Restore saved code or start blank
  codeEditor.value = getSavedCode(levelId);

  resetSim();
}

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

function validateCode(source) {
  const VALID_OPS = new Set(['MOV', 'ADD', 'SUB', 'MUL', 'TEQ', 'TGT', 'SLP', 'JMP', 'DJT', 'DJF']);
  const lines = source.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/#.*$/, '').trim();
    if (!line) continue;
    if (line.endsWith(':')) continue; // label

    // Strip conditional prefix
    let cleaned = line;
    if (cleaned.startsWith('+ ') || cleaned.startsWith('+\t')) cleaned = cleaned.slice(2).trim();
    else if (cleaned.startsWith('- ') || cleaned.startsWith('-\t')) cleaned = cleaned.slice(2).trim();

    const [op, ...args] = cleaned.split(/\s+/);
    if (!VALID_OPS.has(op.toUpperCase())) {
      return { error: `Line ${i + 1}: Unknown instruction "${op}"`, line: i };
    }

    const upper = op.toUpperCase();
    if ((upper === 'MOV') && args.length < 2) {
      return { error: `Line ${i + 1}: mov requires 2 arguments (src dest)`, line: i };
    }
    if (['ADD', 'SUB', 'MUL', 'SLP', 'JMP', 'DJT', 'DJF'].includes(upper) && args.length < 1) {
      return { error: `Line ${i + 1}: ${op} requires an argument`, line: i };
    }
    if (['TEQ', 'TGT'].includes(upper) && args.length < 2) {
      return { error: `Line ${i + 1}: ${op} requires 2 arguments`, line: i };
    }
  }

  // Check for undefined labels in jumps
  const program = parseProgram(source);
  const labels = new Set();
  for (const instr of program) {
    if (instr.type === 'LABEL') labels.add(instr.name);
  }
  for (let i = 0; i < program.length; i++) {
    if (['JMP', 'DJT', 'DJF'].includes(program[i].type)) {
      const target = program[i].args[0]?.toLowerCase();
      if (target && !labels.has(target)) {
        return { error: `Undefined label "${program[i].args[0]}"`, line: i };
      }
    }
  }

  return null;
}

function showError(msg) {
  codeError.textContent = msg;
  codeError.style.display = 'block';
}

function clearError() {
  codeError.style.display = 'none';
}

// ---------------------------------------------------------------------------
// Simulation setup
// ---------------------------------------------------------------------------

function buildMCU() {
  const def = currentLevel.playerMCU;
  return createMCU({
    id: def.id,
    source: codeEditor.value,
    simplePins: def.simplePins || [],
    xbusPins: def.xbusPins || [],
  });
}

function resetSim() {
  stopRun();
  clearError();

  // Save current code
  if (currentLevel) setSavedCode(currentLevel.id, codeEditor.value);

  // Validate before building
  const err = validateCode(codeEditor.value);
  if (err) {
    showError(err.error);
    sim = null;
    updateRegisters(null);
    return;
  }

  try {
    const mcu = buildMCU();
    sim = runLevel({ level: currentLevel, mcus: [mcu] });
    updateRegisters(mcu);
  } catch (e) {
    showError(e.message);
    sim = null;
    updateRegisters(null);
  }

  cycleDisplay.textContent = 'Cycle: 0';
  resultBanner.className = '';
  resultBanner.style.display = 'none';
  renderWaveform();
}

// ---------------------------------------------------------------------------
// Register display
// ---------------------------------------------------------------------------

let prevRegs = { acc: 0, dat: 0, pc: 0 };

function updateRegisters(mcu) {
  if (!mcu) {
    regAcc.textContent = '-';
    regDat.textContent = '-';
    regPc.textContent = '-';
    regState.textContent = '-';
    regAcc.className = 'reg-val';
    regDat.className = 'reg-val';
    regPc.className = 'reg-val';
    prevRegs = { acc: 0, dat: 0, pc: 0 };
    return;
  }

  const acc = mcu.registers.acc;
  const dat = mcu.registers.dat;
  const pc = mcu.pc;

  regAcc.textContent = acc;
  regDat.textContent = dat;
  regPc.textContent = pc;
  regState.textContent = mcu.state;

  // Highlight changed values
  regAcc.className = acc !== prevRegs.acc ? 'reg-val changed' : 'reg-val';
  regDat.className = dat !== prevRegs.dat ? 'reg-val changed' : 'reg-val';
  regPc.className = pc !== prevRegs.pc ? 'reg-val changed' : 'reg-val';

  prevRegs = { acc, dat, pc };
}

// ---------------------------------------------------------------------------
// Step / Run
// ---------------------------------------------------------------------------

function stepOnce() {
  if (!sim || sim.verifier.complete) return;

  try {
    sim.scheduler.tick();
  } catch (e) {
    showError(e.message);
    stopRun();
    return;
  }

  const mcu = sim.scheduler.mcus[0];
  cycleDisplay.textContent = `Cycle: ${sim.scheduler.cycle}`;
  updateRegisters(mcu);
  renderWaveform();

  if (sim.verifier.complete) {
    showResult();
    stopRun();
  }
}

function startRun() {
  if (running) return;
  resetSim();
  if (!sim) return; // validation failed
  running = true;
  btnRun.textContent = 'Stop';
  btnRun.id = 'btn-stop';

  runTimer = setInterval(() => {
    stepOnce();
    if (!running) clearInterval(runTimer);
  }, 150);
}

function stopRun() {
  running = false;
  if (runTimer) { clearInterval(runTimer); runTimer = null; }
  btnRun.textContent = 'Run';
  btnRun.id = 'btn-run';
}

function showResult() {
  if (sim.verifier.passed) {
    resultBanner.textContent = 'LEVEL PASSED';
    resultBanner.className = 'pass';
    markLevelPassed(currentLevel.id);
    // Update the level select to show the checkmark
    const opts = levelSelect.options;
    for (let i = 0; i < opts.length; i++) {
      if (opts[i].value === currentLevel.id && !opts[i].textContent.endsWith(' *')) {
        opts[i].textContent += ' *';
      }
    }
  } else {
    resultBanner.textContent = 'OUTPUT MISMATCH \u2014 TRY AGAIN';
    resultBanner.className = 'fail';
  }
  resultBanner.style.display = 'block';
}

// ---------------------------------------------------------------------------
// Waveform rendering
// ---------------------------------------------------------------------------

function renderWaveform() {
  waveformEl.innerHTML = '';
  if (!currentLevel) return;

  const summary = sim ? sim.verifier.summary : [];
  const maxVal = 100; // scale bar heights to this max

  for (let cycle = 1; cycle <= currentLevel.testCycles; cycle++) {
    const col = document.createElement('div');
    col.className = 'wave-col';

    const cycleData = summary.find(s => s.cycle === cycle);

    for (const pinId of Object.keys(currentLevel.expected)) {
      const expectedVal = currentLevel.expected[pinId](cycle);
      const barHeight = Math.max(2, (Math.abs(expectedVal) / maxVal) * 60);

      if (cycleData && cycleData.pins[pinId]) {
        const { actual, pass } = cycleData.pins[pinId];
        const actualHeight = Math.max(2, (Math.abs(actual) / maxVal) * 60);

        const bar = document.createElement('div');
        bar.className = `wave-bar ${pass ? 'pass' : 'fail'}`;
        bar.style.height = actualHeight + 'px';
        bar.title = `Cycle ${cycle}: actual=${actual}, expected=${expectedVal}`;
        col.appendChild(bar);
      } else {
        const bar = document.createElement('div');
        bar.className = 'wave-bar expected';
        bar.style.height = barHeight + 'px';
        bar.title = `Cycle ${cycle}: expected=${expectedVal}`;
        col.appendChild(bar);
      }
    }

    const label = document.createElement('div');
    label.className = 'wave-label';
    label.textContent = cycle;
    col.appendChild(label);

    waveformEl.appendChild(col);
  }
}

// ---------------------------------------------------------------------------
// Tutorial system
// ---------------------------------------------------------------------------

function showTutorial(page = 0) {
  tutorialPage = Math.max(0, Math.min(page, TUTORIAL_PAGES.length - 1));
  const p = TUTORIAL_PAGES[tutorialPage];
  tutorialTitle.textContent = p.title;
  tutorialBody.innerHTML = p.body;

  tutPrev.disabled = tutorialPage === 0;
  tutNext.textContent = tutorialPage === TUTORIAL_PAGES.length - 1 ? 'Start' : 'Next';

  // Render dots
  tutDots.innerHTML = '';
  for (let i = 0; i < TUTORIAL_PAGES.length; i++) {
    const dot = document.createElement('div');
    dot.className = `tutorial-dot${i === tutorialPage ? ' active' : ''}`;
    tutDots.appendChild(dot);
  }

  tutorialOverlay.classList.add('visible');
}

function closeTutorial() {
  tutorialOverlay.classList.remove('visible');
  setTutorialSeen();
}

tutPrev.addEventListener('click', () => showTutorial(tutorialPage - 1));
tutNext.addEventListener('click', () => {
  if (tutorialPage === TUTORIAL_PAGES.length - 1) {
    closeTutorial();
  } else {
    showTutorial(tutorialPage + 1);
  }
});

tutorialOverlay.addEventListener('click', (e) => {
  if (e.target === tutorialOverlay) closeTutorial();
});

btnHelp.addEventListener('click', () => showTutorial(0));

// ---------------------------------------------------------------------------
// Instruction drawer
// ---------------------------------------------------------------------------

document.getElementById('instr-drawer').addEventListener('click', (e) => {
  const btn = e.target.closest('.instr-btn');
  if (!btn) return;
  const text = btn.dataset.instr;
  const start = codeEditor.selectionStart;
  const end = codeEditor.selectionEnd;
  const val = codeEditor.value;
  codeEditor.value = val.slice(0, start) + text + val.slice(end);
  codeEditor.selectionStart = codeEditor.selectionEnd = start + text.length;
  codeEditor.focus();
});

// ---------------------------------------------------------------------------
// Event listeners
// ---------------------------------------------------------------------------

levelSelect.addEventListener('change', () => loadLevel(levelSelect.value));

btnRun.addEventListener('click', () => {
  if (running) stopRun();
  else startRun();
});

btnStep.addEventListener('click', () => {
  if (running) stopRun();
  if (!sim || sim.verifier.complete) resetSim();
  stepOnce();
});

btnReset.addEventListener('click', resetSim);

// Save code on edit and clear errors
codeEditor.addEventListener('input', () => {
  if (currentLevel) setSavedCode(currentLevel.id, codeEditor.value);
  clearError();
});

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

populateLevelSelect();
loadLevel(LEVELS[0].id);

// Show tutorial on first visit
if (!hasSeenTutorial()) {
  showTutorial(0);
}
