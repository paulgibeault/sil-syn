/**
 * Main entry point — wires the game UI to the simulation engine.
 */

// In sandboxed-iframe context (launcher), wait for postMessage-backed
// localStorage to hydrate before any save data is read.
if (typeof window !== 'undefined' && window.__storageReady) {
  await window.__storageReady;
}

import { createMCU, parseProgram } from './engine/mcu.js';
import { runLevel } from './engine/verifier.js';
import { level01 } from './levels/level01.js';
import { level02 } from './levels/level02.js';
import { level03 } from './levels/level03.js';
import { level04 } from './levels/level04.js';
import { level05 } from './levels/level05.js';
import { level06 } from './levels/level06.js';
import { level07 } from './levels/level07.js';
import { level08 } from './levels/level08.js';
import { trainingT1, trainingT2, trainingT3, trainingT4, trainingT5 } from './levels/training.js';
import { TUTORIAL_PAGES } from './tutorial.js';
import { createBuilder } from './ui/builder.js';
import { createCircuitBoard } from './ui/circuit-board.js';
import { createGuide, runGuideSequence } from './ui/guide.js';

// ---------------------------------------------------------------------------
// Level registry — training first, then puzzles
// ---------------------------------------------------------------------------

const LEVELS = [
  trainingT1, trainingT2, trainingT3, trainingT4, trainingT5,
  level01, level02, level03, level04, level05, level06, level07, level08,
];

// ---------------------------------------------------------------------------
// DOM refs
// ---------------------------------------------------------------------------

const levelMapEl = document.getElementById('level-map');
const missionTitle = document.getElementById('mission-title');
const missionDesc = document.getElementById('mission-desc');
const circuitEl = document.getElementById('circuit');
const missionHint = document.getElementById('mission-hint');
const hintText = document.getElementById('hint-text');
const componentTray = document.getElementById('component-tray');
const builderContainer = document.getElementById('builder-container');
const builderModal = document.getElementById('builder-modal');
const builderModalClose = document.getElementById('builder-modal-close');
const builderModalClear = document.getElementById('builder-modal-clear');
const codeError = document.getElementById('code-error');
const btnRun = document.getElementById('btn-run');
const btnStep = document.getElementById('btn-step');
const btnReset = document.getElementById('btn-reset');
const btnHelp = document.getElementById('btn-help');
const cycleDisplay = document.getElementById('cycle-display');
const regAcc = document.getElementById('reg-acc');
const regDat = document.getElementById('reg-dat');
const regPc = document.getElementById('reg-pc');
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
let board = null;  // circuit board instance
let currentBoardConfig = null; // for readiness checks
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

  // Create nodes
  LEVELS.forEach((level) => {
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

  // Draw connecting line segments after layout
  requestAnimationFrame(() => {
    const lineContainer = document.createElement('div');
    lineContainer.id = 'level-map-line';
    levelMapEl.appendChild(lineContainer);

    const nodes = levelMapEl.querySelectorAll('.level-node');
    const mapRect = levelMapEl.getBoundingClientRect();

    for (let i = 0; i < nodes.length - 1; i++) {
      const dotA = nodes[i].querySelector('.level-dot');
      const dotB = nodes[i + 1].querySelector('.level-dot');
      const rA = dotA.getBoundingClientRect();
      const rB = dotB.getBoundingClientRect();

      const seg = document.createElement('div');
      seg.className = 'level-line-seg' + (isLevelPassed(LEVELS[i].id) ? ' passed' : '');
      seg.style.left = (rA.right - mapRect.left) + 'px';
      seg.style.width = (rB.left - rA.right) + 'px';
      lineContainer.appendChild(seg);
    }
  });
}

// ---------------------------------------------------------------------------
// Circuit board setup from level definition
// ---------------------------------------------------------------------------

function setupCircuitBoard() {
  if (!currentLevel) return;

  const boardConfig = currentLevel.boardConfig || inferBoardConfig();
  currentBoardConfig = boardConfig;

  board = createCircuitBoard({
    container: circuitEl,
    gridCols: boardConfig.gridCols || 8,
    gridRows: boardConfig.gridRows || 4,
    onOpenBuilder: (mcuId) => openBuilderModal(mcuId),
    onWiringChange: () => {
      updateRunButton();
    },
  });

  // Place components
  for (const comp of boardConfig.components) {
    board.addComponent(
      comp.type, comp.id, comp.col, comp.row,
      comp.outputPins || [], comp.inputPins || [],
      comp.locked ?? true,
    );
  }

  // Wires are player-drawn — no pre-wiring

  // Setup component tray for player-placeable components
  renderComponentTray(boardConfig);
}

function inferBoardConfig() {
  // Build a reasonable board from old-style level definitions
  const components = [];
  const wires = [];
  const circuit = currentLevel.circuit || {
    inputs: Object.keys(currentLevel.sources || {}).map(id => ({ id, name: id.toUpperCase(), pin: id })),
    outputs: Object.keys(currentLevel.expected || {}).map(id => ({ id, name: id.toUpperCase(), pin: id })),
  };

  // Place inputs on the left
  circuit.inputs.forEach((input, i) => {
    components.push({
      type: 'sensor', id: input.id, col: 0, row: i * 2,
      outputPins: [input.pin || input.id], inputPins: [],
      locked: true,
    });
  });

  // Place MCU in the center
  const mcuRow = 0;
  components.push({
    type: 'mcu', id: currentLevel.playerMCU.id, col: 3, row: mcuRow,
    outputPins: currentLevel.playerMCU.simplePins || [],
    inputPins: Object.keys(currentLevel.sources || {}),
    locked: true,
  });

  // Place outputs on the right — use the output's own id as the pin id
  circuit.outputs.forEach((output, i) => {
    const outType = output.id === 'light' ? 'light' : 'output';
    components.push({
      type: outType, id: output.id, col: 6, row: i * 2,
      outputPins: [], inputPins: [output.id],
      locked: true,
    });
  });

  // Auto-wire based on level wiring definition
  if (currentLevel.wiring) {
    for (const w of currentLevel.wiring) {
      wires.push({
        from: w.from.mcuId, fromPin: w.from.pin,
        to: w.to, toPin: w.to,
        locked: true,
      });
    }
  }

  // Auto-wire sources to MCU inputs
  for (const inputId of Object.keys(currentLevel.sources || {})) {
    wires.push({
      from: inputId, fromPin: inputId,
      to: currentLevel.playerMCU.id, toPin: inputId,
      locked: true,
    });
  }

  return {
    gridCols: 8,
    gridRows: Math.max(4, (circuit.inputs.length + circuit.outputs.length) * 2),
    components,
    wires,
  };
}

// ---------------------------------------------------------------------------
// Component tray
// ---------------------------------------------------------------------------

function renderComponentTray(boardConfig) {
  componentTray.innerHTML = '';

  const available = boardConfig.availableComponents || [];
  if (available.length === 0) {
    componentTray.style.display = 'none';
    return;
  }
  componentTray.style.display = 'flex';

  const TRAY_ICONS = {
    mcu: '\u2588\u2588',
    sensor: '\u2261',
    light: '\u2B24',
    output: '\u25C9',
  };
  const TRAY_LABELS = {
    mcu: 'MCU', sensor: 'Sensor', light: 'Light', output: 'Output',
  };

  for (const item of available) {
    const btn = document.createElement('button');
    btn.className = 'tray-item';
    btn.innerHTML = `<span class="tray-icon">${TRAY_ICONS[item.type] || '?'}</span>${TRAY_LABELS[item.type] || item.type}`;

    // Check if already placed
    const alreadyPlaced = board.placed.some(c => c.id === item.id);
    if (alreadyPlaced) {
      btn.classList.add('placed');
    }

    btn.addEventListener('click', () => {
      if (board.placed.some(c => c.id === item.id)) return;
      board.startPlacing(item.type, item.id, item.outputPins || [], item.inputPins || []);
      btn.classList.add('active');

      // Deactivate on place or cancel
      const check = setInterval(() => {
        if (board.mode !== 'placing') {
          clearInterval(check);
          btn.classList.remove('active');
          if (board.placed.some(c => c.id === item.id)) {
            btn.classList.add('placed');
          }
        }
      }, 100);
    });

    componentTray.appendChild(btn);
  }
}

// ---------------------------------------------------------------------------
// Builder modal
// ---------------------------------------------------------------------------

function openBuilderModal() {
  builderModalClear.style.display = (builder && builder.hasPrefill()) ? 'none' : '';
  builderModal.classList.add('visible');
}

function closeBuilderModal() {
  builderModal.classList.remove('visible');
}

builderModalClose.addEventListener('click', closeBuilderModal);
builderModal.addEventListener('click', (e) => {
  if (e.target === builderModal) closeBuilderModal();
});
builderModalClear.addEventListener('click', () => {
  if (!builder) return;
  builder.setCode('');
  if (currentLevel) setSavedCode(currentLevel.id, '');
  clearError();
  updateRunButton();
});

// ---------------------------------------------------------------------------
// Level loading
// ---------------------------------------------------------------------------

function loadLevel(levelId) {
  stopRun();
  currentLevel = LEVELS.find(l => l.id === levelId);
  if (!currentLevel) return;

  missionTitle.textContent = currentLevel.name;
  missionDesc.textContent = currentLevel.description;
  if (currentLevel.hint) {
    hintText.textContent = currentLevel.hint;
    missionHint.classList.add('visible');
  } else {
    missionHint.classList.remove('visible');
  }
  codeError.style.display = 'none';

  renderLevelMap();
  setupCircuitBoard();

  // Create builder with level-specific constraints
  const pins = currentLevel.playerMCU.simplePins || [];
  const extPins = Object.keys(currentLevel.sources || {});

  builder = createBuilder({
    container: builderContainer,
    pins,
    extPins,
    maxSlots: currentLevel.maxSlots || 9,
    allowedOps: currentLevel.allowedOps || null,
    allowedArgs: currentLevel.allowedArgs || null,
    prefill: currentLevel.prefill || null,
    onChange: () => {
      setSavedCode(currentLevel.id, builder.getCode());
      clearError();
      updateRunButton();
    },
  });

  // Restore saved code (only for non-prefilled levels)
  if (!currentLevel.prefill) {
    const saved = getSavedCode(levelId);
    if (saved) builder.setCode(saved);
  }

  resetSim();
  updateRunButton();

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

  if (currentLevel && builder) setSavedCode(currentLevel.id, builder.getCode());

  const source = builder ? builder.getCode() : '';
  if (!source.trim()) {
    sim = null;
    updateRegisters(null);
    cycleDisplay.textContent = 'Cycle: 0';
    resultBanner.className = ''; resultBanner.style.display = 'none';
    renderWaveform();
    if (board) board.resetValues();
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
  if (board) board.resetValues();
}

// ---------------------------------------------------------------------------
// Registers
// ---------------------------------------------------------------------------

function updateRegisters(mcu) {
  if (!mcu) {
    regAcc.textContent = '-'; regDat.textContent = '-';
    regPc.textContent = '-';
    regAcc.className = regDat.className = regPc.className = 'reg-val';
    prevRegs = { acc: 0, dat: 0, pc: 0 };
    return;
  }
  const { acc, dat } = mcu.registers;
  const pc = mcu.pc;
  regAcc.textContent = acc;
  regDat.textContent = dat;
  regPc.textContent = pc;

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

  // Update circuit board live values
  if (board) {
    board.updateValues(sim.board, sim.scheduler.cycle, currentLevel);
  }

  renderWaveform();

  // Highlight current instruction in builder
  if (builder && !builder.isAdvancedMode()) {
    builder.highlightSlot(mcu.pc);
  }

  if (sim.verifier.complete) { showResult(); stopRun(); }
}

// ---------------------------------------------------------------------------
// Run readiness — disable Run when board is incomplete
// ---------------------------------------------------------------------------

function checkReadiness() {
  if (!currentLevel || !board || !builder) return { ready: false, reason: 'No level' };

  // Check code
  const code = builder.getCode().trim();
  if (!code) return { ready: false, reason: 'No code' };

  // Check for blank args in prefilled slots
  if (builder.hasPrefill()) {
    const slots = builder.getSlots();
    for (const slot of slots) {
      if (slot.op && slot.args.some(a => a === null || a === undefined)) {
        return { ready: false, reason: 'Fill all blanks' };
      }
    }
  }

  // Check wires — every expected wire in boardConfig must exist on board
  const expectedWires = currentBoardConfig?.wires || [];
  if (expectedWires.length > 0) {
    const boardWires = board.wires;
    for (const ew of expectedWires) {
      const found = boardWires.some(bw =>
        bw.fromComp === ew.from && bw.fromPin === ew.fromPin &&
        bw.toComp === ew.to && bw.toPin === ew.toPin
      );
      if (!found) return { ready: false, reason: 'Connect all wires' };
    }
  }

  return { ready: true };
}

function updateRunButton() {
  if (running) return; // don't change during run
  const { ready, reason } = checkReadiness();
  if (ready) {
    btnRun.disabled = false;
    btnRun.className = 'btn-run';
    btnRun.textContent = 'Run';
    btnRun.title = '';
  } else {
    btnRun.disabled = true;
    btnRun.className = 'btn-not-ready';
    btnRun.textContent = reason || 'Not ready';
    btnRun.title = reason || '';
  }
}

function startRun() {
  if (running) return;
  const { ready } = checkReadiness();
  if (!ready) return;
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
  if (builder) builder.clearHighlight();
  updateRunButton();
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
  const pinIds = Object.keys(currentLevel.expected);
  const maxVal = 100;
  const barMax = 48; // max bar height in px

  for (const pinId of pinIds) {
    const section = document.createElement('div');
    section.className = 'wave-pin-section';

    // Pin label on the left
    const label = document.createElement('div');
    label.className = 'wave-pin-label';
    label.textContent = pinId;
    section.appendChild(label);

    // Track area with columns
    const track = document.createElement('div');
    track.className = 'wave-track';

    for (let cycle = 1; cycle <= currentLevel.testCycles; cycle++) {
      const col = document.createElement('div');
      col.className = 'wave-col';
      const cycleData = summary.find(s => s.cycle === cycle);
      const expectedVal = currentLevel.expected[pinId](cycle);
      const expectedHeight = Math.max(2, (Math.abs(expectedVal) / maxVal) * barMax);

      const barWrap = document.createElement('div');
      barWrap.className = 'wave-bar-wrap';

      if (cycleData && cycleData.pins[pinId]) {
        const { actual, pass } = cycleData.pins[pinId];
        const actualHeight = Math.max(2, (Math.abs(actual) / maxVal) * barMax);

        // Actual value bar
        const bar = document.createElement('div');
        bar.className = `wave-bar ${pass ? 'pass' : 'fail'}`;
        bar.style.height = actualHeight + 'px';
        barWrap.appendChild(bar);

        // Expected marker line (only if mismatch)
        if (!pass) {
          const marker = document.createElement('div');
          marker.className = 'wave-expect-marker';
          marker.style.bottom = expectedHeight + 'px';
          barWrap.appendChild(marker);
        }

        // Hover value
        const tip = document.createElement('div');
        tip.className = 'wave-value-tip';
        tip.textContent = actual;
        barWrap.appendChild(tip);
      } else {
        // Not yet run — show expected as ghost
        const bar = document.createElement('div');
        bar.className = 'wave-bar expected';
        bar.style.height = expectedHeight + 'px';
        barWrap.appendChild(bar);

        // Hover value for expected
        const tip = document.createElement('div');
        tip.className = 'wave-value-tip';
        tip.textContent = expectedVal;
        barWrap.appendChild(tip);
      }

      col.appendChild(barWrap);

      // Cycle number
      const lbl = document.createElement('div');
      lbl.className = 'wave-label';
      lbl.textContent = cycle;
      col.appendChild(lbl);

      track.appendChild(col);
    }

    section.appendChild(track);
    waveformEl.appendChild(section);
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

// Defer to ensure layout is computed (iOS Safari needs a paint cycle first)
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    loadLevel(LEVELS[0].id);
  });
});
