/**
 * Main entry point — wires the game UI to the simulation engine.
 */

import { createMCU, parseProgram } from './engine/mcu.js';
import { runLevel } from './engine/verifier.js';
import { level01 } from './levels/level01.js';
import { level02 } from './levels/level02.js';
import { level03 } from './levels/level03.js';
import { level04 } from './levels/level04.js';
import { level05 } from './levels/level05.js';
import { trainingT1, trainingT2, trainingT3, trainingT4 } from './levels/training.js';
import { TUTORIAL_PAGES } from './tutorial.js';
import { createBuilder } from './ui/builder.js';
import { createGuide, runGuideSequence } from './ui/guide.js';

// ---------------------------------------------------------------------------
// Level registry — training first, then puzzles
// ---------------------------------------------------------------------------

const LEVELS = [
  trainingT1, trainingT2, trainingT3, trainingT4,
  level01, level02, level03, level04, level05,
];

// ---------------------------------------------------------------------------
// DOM refs
// ---------------------------------------------------------------------------

const levelMapEl = document.getElementById('level-map');
const missionTitle = document.getElementById('mission-title');
const missionDesc = document.getElementById('mission-desc');
const circuitEl = document.getElementById('circuit');
const builderContainer = document.getElementById('builder-container');
const codeError = document.getElementById('code-error');
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
let sim = null;
let builder = null;
let guide = null;
let running = false;
let runTimer = null;
let tutorialPage = 0;
let prevRegs = { acc: 0, dat: 0, pc: 0 };

// ---------------------------------------------------------------------------
// localStorage persistence
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'silicon-syndicate';

function loadSavedData() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
  catch { return {}; }
}
function saveData(data) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
}
function getSavedCode(id) { return loadSavedData().code?.[id] ?? ''; }
function setSavedCode(id, code) {
  const d = loadSavedData(); if (!d.code) d.code = {}; d.code[id] = code; saveData(d);
}
function markLevelPassed(id) {
  const d = loadSavedData(); if (!d.passed) d.passed = {}; d.passed[id] = true; saveData(d);
}
function isLevelPassed(id) { return loadSavedData().passed?.[id] === true; }

// ---------------------------------------------------------------------------
// Level map
// ---------------------------------------------------------------------------

function renderLevelMap() {
  levelMapEl.innerHTML = '';

  LEVELS.forEach((level, i) => {
    if (i > 0) {
      const wire = document.createElement('div');
      wire.className = 'level-wire' + (isLevelPassed(LEVELS[i - 1].id) ? ' passed' : '');
      levelMapEl.appendChild(wire);
    }

    const node = document.createElement('div');
    node.className = 'level-node' + (currentLevel === level ? ' active' : '');

    const dot = document.createElement('div');
    dot.className = 'level-dot';
    if (currentLevel === level) dot.classList.add('active');
    if (isLevelPassed(level.id)) dot.classList.add('passed');
    dot.textContent = level.id;
    node.appendChild(dot);

    const label = document.createElement('div');
    label.className = 'level-label';
    label.textContent = level.name;
    node.appendChild(label);

    node.addEventListener('click', () => loadLevel(level.id));
    levelMapEl.appendChild(node);
  });
}

// ---------------------------------------------------------------------------
// Circuit board visualization
// ---------------------------------------------------------------------------

function renderCircuit() {
  circuitEl.innerHTML = '';
  if (!currentLevel) return;

  const circuit = currentLevel.circuit || inferCircuit();

  // Render: [inputs] → [MCU] → [outputs]
  for (const input of circuit.inputs) {
    const comp = makeCircuitComp(input.name, '--', 'input-comp');
    comp.id = 'circuit-' + input.id;
    circuitEl.appendChild(comp);

    const wire = document.createElement('div');
    wire.className = 'circuit-wire';
    circuitEl.appendChild(wire);
  }

  const mcu = makeCircuitComp('MCU', 'p' + (currentLevel.playerMCU.simplePins?.length || 0), 'mcu-comp');
  circuitEl.appendChild(mcu);

  for (const output of circuit.outputs) {
    const wire = document.createElement('div');
    wire.className = 'circuit-wire';
    wire.id = 'wire-' + output.id;
    circuitEl.appendChild(wire);

    const comp = makeCircuitComp(output.name, '--', 'output-comp');
    comp.id = 'circuit-' + output.id;
    circuitEl.appendChild(comp);
  }
}

function makeCircuitComp(name, value, className) {
  const el = document.createElement('div');
  el.className = 'circuit-component ' + className;
  el.innerHTML = `<div class="comp-label">${name}</div><div class="comp-value off">${value}</div>`;
  return el;
}

function inferCircuit() {
  // Build circuit info from level definition if not explicitly set
  const inputs = Object.keys(currentLevel.sources || {}).map(id => ({
    id, name: id.toUpperCase(), pin: id,
  }));
  const outputs = Object.keys(currentLevel.expected || {}).map(id => ({
    id, name: id.toUpperCase(), pin: id,
  }));
  return { inputs, outputs };
}

function updateCircuitValues() {
  if (!sim || !currentLevel) return;
  const circuit = currentLevel.circuit || inferCircuit();
  const cycle = sim.scheduler.cycle;

  // Update input values
  for (const input of circuit.inputs) {
    const el = document.getElementById('circuit-' + input.id);
    if (!el) continue;
    const valEl = el.querySelector('.comp-value');
    if (currentLevel.sources?.[input.id]) {
      const v = currentLevel.sources[input.id](Math.max(1, cycle));
      valEl.textContent = v;
      valEl.className = 'comp-value' + (v > 0 ? ' on' : ' off');
    }
  }

  // Update output values
  for (const output of circuit.outputs) {
    const el = document.getElementById('circuit-' + output.id);
    if (!el) continue;
    const valEl = el.querySelector('.comp-value');
    const v = sim.board.readSimplePin(output.id);
    valEl.textContent = v;
    valEl.className = 'comp-value' + (v > 0 ? ' on' : ' off');

    // Animate wire
    const wire = document.getElementById('wire-' + output.id);
    if (wire) wire.className = 'circuit-wire' + (v > 0 ? ' active' : '');
  }
}

// ---------------------------------------------------------------------------
// Level loading
// ---------------------------------------------------------------------------

function loadLevel(levelId) {
  stopRun();
  currentLevel = LEVELS.find(l => l.id === levelId);
  if (!currentLevel) return;

  missionTitle.textContent = currentLevel.name;
  missionDesc.textContent = currentLevel.description;
  codeError.style.display = 'none';

  renderLevelMap();
  renderCircuit();

  // Create builder with level-specific pins
  const pins = currentLevel.playerMCU.simplePins || [];
  const extPins = Object.keys(currentLevel.sources || {});

  builder = createBuilder({
    container: builderContainer,
    pins,
    extPins,
    onChange: () => {
      setSavedCode(currentLevel.id, builder.getCode());
      clearError();
    },
  });

  // Restore saved code
  const saved = getSavedCode(levelId);
  if (saved) builder.setCode(saved);

  resetSim();

  // Run guide for training levels
  if (currentLevel.guide && !isLevelPassed(levelId)) {
    setTimeout(() => {
      if (!guide) guide = createGuide({ container: document.body });
      runGuideSequence(guide, currentLevel.guide);
    }, 500);
  }
}

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

function validateCode(source) {
  const VALID_OPS = new Set(['MOV', 'ADD', 'SUB', 'MUL', 'TEQ', 'TGT', 'SLP', 'JMP', 'DJT', 'DJF']);
  const lines = source.split('\n');

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].replace(/#.*$/, '').trim();
    if (!line) continue;
    if (line.endsWith(':')) continue;
    if (line.startsWith('+ ') || line.startsWith('+\t')) line = line.slice(2).trim();
    else if (line.startsWith('- ') || line.startsWith('-\t')) line = line.slice(2).trim();

    const [op, ...args] = line.split(/\s+/);
    if (!VALID_OPS.has(op.toUpperCase())) {
      return { error: `Unknown instruction: "${op}"` };
    }
    const upper = op.toUpperCase();
    if (upper === 'MOV' && args.length < 2) return { error: `mov requires 2 arguments` };
    if (['ADD','SUB','MUL','SLP','JMP','DJT','DJF'].includes(upper) && args.length < 1) {
      return { error: `${op} requires an argument` };
    }
    if (['TEQ','TGT'].includes(upper) && args.length < 2) return { error: `${op} requires 2 arguments` };
  }

  const program = parseProgram(source);
  const labels = new Set(program.filter(i => i.type === 'LABEL').map(i => i.name));
  for (const instr of program) {
    if (['JMP','DJT','DJF'].includes(instr.type)) {
      const t = instr.args[0]?.toLowerCase();
      if (t && !labels.has(t)) return { error: `Undefined label "${instr.args[0]}"` };
    }
  }
  return null;
}

function showError(msg) { codeError.textContent = msg; codeError.style.display = 'block'; }
function clearError() { codeError.style.display = 'none'; }

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------

function buildMCU() {
  const def = currentLevel.playerMCU;
  return createMCU({
    id: def.id,
    source: builder.getCode(),
    simplePins: def.simplePins || [],
    xbusPins: def.xbusPins || [],
  });
}

function resetSim() {
  stopRun();
  clearError();

  if (currentLevel) setSavedCode(currentLevel.id, builder.getCode());

  const source = builder.getCode();
  if (!source.trim()) {
    sim = null;
    updateRegisters(null);
    cycleDisplay.textContent = 'Cycle: 0';
    resultBanner.className = ''; resultBanner.style.display = 'none';
    renderWaveform();
    renderCircuit();
    return;
  }

  const err = validateCode(source);
  if (err) { showError(err.error); sim = null; updateRegisters(null); return; }

  try {
    const mcu = buildMCU();
    sim = runLevel({ level: currentLevel, mcus: [mcu] });
    updateRegisters(mcu);
  } catch (e) { showError(e.message); sim = null; updateRegisters(null); }

  cycleDisplay.textContent = 'Cycle: 0';
  resultBanner.className = ''; resultBanner.style.display = 'none';
  renderWaveform();
  renderCircuit();
}

// ---------------------------------------------------------------------------
// Registers
// ---------------------------------------------------------------------------

function updateRegisters(mcu) {
  if (!mcu) {
    regAcc.textContent = '-'; regDat.textContent = '-';
    regPc.textContent = '-'; regState.textContent = '-';
    regAcc.className = regDat.className = regPc.className = 'reg-val';
    prevRegs = { acc: 0, dat: 0, pc: 0 };
    return;
  }
  const { acc, dat } = mcu.registers;
  const pc = mcu.pc;
  regAcc.textContent = acc;
  regDat.textContent = dat;
  regPc.textContent = pc;
  // Shorten state names
  const stateNames = { READY: 'RDY', SLEEPING: 'SLP', XBUS_SENDING: 'XBS', XBUS_RECEIVING: 'XBR' };
  regState.textContent = stateNames[mcu.state] || mcu.state;

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

  try { sim.scheduler.tick(); }
  catch (e) { showError(e.message); stopRun(); return; }

  const mcu = sim.scheduler.mcus[0];
  cycleDisplay.textContent = `Cycle: ${sim.scheduler.cycle}`;
  updateRegisters(mcu);
  updateCircuitValues();
  renderWaveform();

  // Highlight current instruction in builder
  if (builder && !builder.isAdvancedMode()) {
    builder.highlightSlot(mcu.pc);
  }

  if (sim.verifier.complete) { showResult(); stopRun(); }
}

function startRun() {
  if (running) return;
  resetSim();
  if (!sim) return;
  running = true;
  btnRun.textContent = 'Stop';
  btnRun.className = 'btn-stop';

  runTimer = setInterval(() => {
    stepOnce();
    if (!running) clearInterval(runTimer);
  }, 200);
}

function stopRun() {
  running = false;
  if (runTimer) { clearInterval(runTimer); runTimer = null; }
  btnRun.textContent = 'Run';
  btnRun.className = 'btn-run';
  if (builder) builder.clearHighlight();
}

function showResult() {
  if (sim.verifier.passed) {
    resultBanner.textContent = 'MISSION COMPLETE';
    resultBanner.className = 'pass';
    markLevelPassed(currentLevel.id);
    renderLevelMap();
  } else {
    resultBanner.textContent = 'SIGNAL MISMATCH';
    resultBanner.className = 'fail';
  }
  resultBanner.style.display = 'block';
}

// ---------------------------------------------------------------------------
// Waveform
// ---------------------------------------------------------------------------

function renderWaveform() {
  waveformEl.innerHTML = '';
  if (!currentLevel) return;

  const summary = sim ? sim.verifier.summary : [];
  const maxVal = 100;

  for (let cycle = 1; cycle <= currentLevel.testCycles; cycle++) {
    const col = document.createElement('div');
    col.className = 'wave-col';
    const cycleData = summary.find(s => s.cycle === cycle);

    for (const pinId of Object.keys(currentLevel.expected)) {
      const expectedVal = currentLevel.expected[pinId](cycle);
      const barHeight = Math.max(2, (Math.abs(expectedVal) / maxVal) * 50);

      if (cycleData && cycleData.pins[pinId]) {
        const { actual, pass } = cycleData.pins[pinId];
        const actualHeight = Math.max(2, (Math.abs(actual) / maxVal) * 50);
        const bar = document.createElement('div');
        bar.className = `wave-bar ${pass ? 'pass' : 'fail'}`;
        bar.style.height = actualHeight + 'px';
        bar.title = `C${cycle}: got ${actual}, want ${expectedVal}`;
        col.appendChild(bar);
      } else {
        const bar = document.createElement('div');
        bar.className = 'wave-bar expected';
        bar.style.height = barHeight + 'px';
        bar.title = `C${cycle}: want ${expectedVal}`;
        col.appendChild(bar);
      }
    }

    const lbl = document.createElement('div');
    lbl.className = 'wave-label';
    lbl.textContent = cycle;
    col.appendChild(lbl);
    waveformEl.appendChild(col);
  }
}

// ---------------------------------------------------------------------------
// Reference guide (? button)
// ---------------------------------------------------------------------------

function showTutorial(page = 0) {
  tutorialPage = Math.max(0, Math.min(page, TUTORIAL_PAGES.length - 1));
  const p = TUTORIAL_PAGES[tutorialPage];
  tutorialTitle.textContent = p.title;
  tutorialBody.innerHTML = p.body;

  tutPrev.disabled = tutorialPage === 0;
  tutNext.textContent = tutorialPage === TUTORIAL_PAGES.length - 1 ? 'Close' : 'Next';

  tutDots.innerHTML = '';
  for (let i = 0; i < TUTORIAL_PAGES.length; i++) {
    const dot = document.createElement('div');
    dot.className = `tutorial-dot${i === tutorialPage ? ' active' : ''}`;
    tutDots.appendChild(dot);
  }
  tutorialOverlay.classList.add('visible');
}

function closeTutorial() { tutorialOverlay.classList.remove('visible'); }

tutPrev.addEventListener('click', () => showTutorial(tutorialPage - 1));
tutNext.addEventListener('click', () => {
  if (tutorialPage === TUTORIAL_PAGES.length - 1) closeTutorial();
  else showTutorial(tutorialPage + 1);
});
tutorialOverlay.addEventListener('click', (e) => { if (e.target === tutorialOverlay) closeTutorial(); });
btnHelp.addEventListener('click', () => showTutorial(0));

// ---------------------------------------------------------------------------
// Event listeners
// ---------------------------------------------------------------------------

btnRun.addEventListener('click', () => { if (running) stopRun(); else startRun(); });
btnStep.addEventListener('click', () => {
  if (running) stopRun();
  if (!sim || sim.verifier.complete) resetSim();
  stepOnce();
});
btnReset.addEventListener('click', resetSim);

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

loadLevel(LEVELS[0].id);
