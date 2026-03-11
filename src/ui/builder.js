/**
 * Visual instruction builder — tap-to-build assembly programs.
 *
 * Supports constrained modes for training levels:
 *   - allowedOps: only show these opcodes in the picker
 *   - allowedArgs: only show these values in the argument picker
 *   - prefill: pre-filled slots with per-arg locking
 */

// ---------------------------------------------------------------------------
// Opcode metadata
// ---------------------------------------------------------------------------

const OPS = {
  mov: { args: 2, hint: 'Move a value',       argHints: ['from', 'to'] },
  add: { args: 1, hint: 'Add to acc',         argHints: ['value'] },
  sub: { args: 1, hint: 'Subtract from acc',  argHints: ['value'] },
  mul: { args: 1, hint: 'Multiply acc',       argHints: ['value'] },
  teq: { args: 1, hint: 'Test if equal',      argHints: ['compare to'] },
  tgt: { args: 1, hint: 'Test if greater',    argHints: ['compare to'] },
  slp: { args: 1, hint: 'Sleep N cycles',     argHints: ['cycles'] },
  jmp: { args: 1, hint: 'Jump to label',      argHints: ['label'] },
  djt: { args: 1, hint: 'Jump if true',       argHints: ['label'] },
  djf: { args: 1, hint: 'Jump if false',      argHints: ['label'] },
};

export { OPS };

const DEFAULT_MAX_SLOTS = 9;

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

/**
 * @param {object}    opts
 * @param {HTMLElement} opts.container
 * @param {string[]}    opts.pins          - MCU output pins
 * @param {string[]}    opts.extPins       - External/sensor pins
 * @param {function}    opts.onChange
 * @param {number}      [opts.maxSlots]
 * @param {string[]}    [opts.allowedOps]  - Restrict picker to these opcodes
 * @param {string[]}    [opts.allowedArgs] - Restrict arg picker to these values
 * @param {Array}       [opts.prefill]     - Pre-fill slots (see training.js)
 */
export function createBuilder({
  container, pins = [], extPins = [], onChange,
  maxSlots = DEFAULT_MAX_SLOTS,
  allowedOps = null,
  allowedArgs = null,
  prefill = null,
}) {
  // Slot shape: { label, cond, op, args[], opLocked, argLocked[] }
  const slots = [];
  for (let i = 0; i < maxSlots; i++) {
    slots.push({ label: null, cond: null, op: null, args: [], opLocked: false, argLocked: [] });
  }

  // Apply prefill
  if (prefill) {
    for (let i = 0; i < prefill.length && i < maxSlots; i++) {
      const pf = prefill[i];
      if (!pf) continue; // null = empty, player fills

      const slot = slots[i];
      slot.op = pf.op || null;
      slot.args = (pf.args || []).map(a => a); // copy, nulls = blanks
      slot.label = pf.label || null;
      slot.cond = pf.cond ?? null;
      slot.opLocked = pf.opLocked || false;
      slot.argLocked = pf.locked || [];
    }
  }

  let pickerEl = null;
  let advancedMode = false;
  let textareaEl = null;

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  function render() {
    container.innerHTML = '';
    container.classList.add('builder');

    if (advancedMode) { renderTextMode(); return; }

    const slotsDiv = document.createElement('div');
    slotsDiv.className = 'builder-slots';
    for (let i = 0; i < maxSlots; i++) {
      slotsDiv.appendChild(renderSlot(i));
    }
    container.appendChild(slotsDiv);

    // Mode toggle (hide in heavily constrained training)
    if (!prefill) {
      const toggle = document.createElement('button');
      toggle.className = 'builder-toggle';
      toggle.textContent = 'text mode';
      toggle.addEventListener('click', () => { advancedMode = true; render(); });
      container.appendChild(toggle);
    }
  }

  function renderTextMode() {
    textareaEl = document.createElement('textarea');
    textareaEl.className = 'builder-textarea';
    textareaEl.spellcheck = false;
    textareaEl.autocapitalize = 'none';
    textareaEl.value = toAssembly();
    textareaEl.addEventListener('input', () => { fromAssembly(textareaEl.value); onChange?.(); });
    container.appendChild(textareaEl);

    const toggle = document.createElement('button');
    toggle.className = 'builder-toggle';
    toggle.textContent = 'visual mode';
    toggle.addEventListener('click', () => {
      fromAssembly(textareaEl.value);
      advancedMode = false;
      render();
    });
    container.appendChild(toggle);
  }

  function renderSlot(idx) {
    const slot = slots[idx];
    const isEmpty = !slot.op && !slot.label;
    const isFullyLocked = slot.opLocked && slot.argLocked.every(Boolean);

    const row = document.createElement('div');
    row.className = 'slot-row' + (isEmpty ? ' empty' : '') + (isFullyLocked ? ' locked' : '');
    row.dataset.idx = idx;

    // Line number
    const num = document.createElement('span');
    num.className = 'slot-num';
    num.textContent = String(idx + 1).padStart(2, '0');
    row.appendChild(num);

    // Label badge (before the instruction)
    if (slot.label) {
      const badge = document.createElement('span');
      badge.className = 'slot-label-badge';
      badge.textContent = slot.label + ':';
      row.appendChild(badge);
    }

    // Condition badge
    if (slot.op && hasTestAbove(idx)) {
      const condBtn = document.createElement('button');
      condBtn.className = 'slot-cond' +
        (slot.cond === true ? ' cond-plus' : slot.cond === false ? ' cond-minus' : '');
      condBtn.textContent = slot.cond === true ? '+' : slot.cond === false ? '\u2212' : '\u00B7';
      if (!isFullyLocked) {
        condBtn.addEventListener('click', () => {
          if (slot.cond === null) slot.cond = true;
          else if (slot.cond === true) slot.cond = false;
          else slot.cond = null;
          onChange?.(); render();
        });
      }
      row.appendChild(condBtn);
    }

    // Opcode cell
    const opCell = document.createElement('button');
    opCell.className = 'slot-cell slot-op' + (slot.op ? '' : ' placeholder');
    opCell.textContent = slot.op || '+';
    if (!slot.opLocked) {
      opCell.addEventListener('click', () => showOpPicker(idx));
    } else {
      opCell.classList.add('cell-locked');
    }
    row.appendChild(opCell);

    // Argument cells
    if (slot.op && OPS[slot.op]) {
      const meta = OPS[slot.op];
      for (let a = 0; a < meta.args; a++) {
        const val = slot.args[a];
        const isBlank = val === null || val === undefined;
        const isLocked = slot.argLocked[a] === true;

        const argCell = document.createElement('button');
        argCell.className = 'slot-cell slot-arg' +
          (isBlank ? ' placeholder blank-arg' : '') +
          (isLocked ? ' cell-locked' : '');
        argCell.textContent = isBlank ? (meta.argHints[a] || '?') : val;

        if (!isLocked) {
          argCell.addEventListener('click', () => showArgPicker(idx, a));
        }
        row.appendChild(argCell);
      }
    }

    return row;
  }

  function hasTestAbove(idx) {
    for (let i = 0; i < idx; i++) {
      if (slots[i].op === 'teq' || slots[i].op === 'tgt') return true;
    }
    return false;
  }

  // -----------------------------------------------------------------------
  // Pickers
  // -----------------------------------------------------------------------

  function closePicker() {
    if (pickerEl) { pickerEl.remove(); pickerEl = null; }
  }

  function showPicker(title, items, onSelect) {
    closePicker();
    pickerEl = document.createElement('div');
    pickerEl.className = 'picker-overlay';

    const sheet = document.createElement('div');
    sheet.className = 'picker-sheet';

    const header = document.createElement('div');
    header.className = 'picker-header';
    header.textContent = title;
    sheet.appendChild(header);

    const grid = document.createElement('div');
    grid.className = 'picker-grid';

    for (const item of items) {
      const btn = document.createElement('button');
      btn.className = 'picker-item' + (item.className ? ' ' + item.className : '');
      if (item.desc) {
        const l = document.createElement('span');
        l.className = 'picker-item-label';
        l.textContent = item.label;
        const d = document.createElement('span');
        d.className = 'picker-item-desc';
        d.textContent = item.desc;
        btn.appendChild(l);
        btn.appendChild(d);
      } else {
        btn.textContent = item.label;
      }
      btn.addEventListener('click', () => { closePicker(); onSelect(item.value); });
      grid.appendChild(btn);
    }

    sheet.appendChild(grid);
    pickerEl.appendChild(sheet);
    pickerEl.addEventListener('click', (e) => { if (e.target === pickerEl) closePicker(); });
    document.body.appendChild(pickerEl);
  }

  function showOpPicker(slotIdx) {
    const ops = allowedOps || Object.keys(OPS);
    const items = ops.filter(op => OPS[op]).map(op => ({
      label: op, desc: OPS[op].hint, value: op,
    }));

    // Label option (only if jumps are allowed)
    if (ops.some(o => ['jmp', 'djt', 'djf'].includes(o))) {
      items.push({ label: 'label:', desc: 'Mark a jump target', value: '__label__' });
    }

    // Clear option
    if (slots[slotIdx].op || slots[slotIdx].label) {
      items.push({ label: 'clear', desc: 'Remove this line', value: '__clear__', className: 'picker-clear' });
    }

    showPicker('Select Instruction', items, (value) => {
      const slot = slots[slotIdx];
      if (value === '__clear__') {
        slot.op = null; slot.args = []; slot.label = null; slot.cond = null;
      } else if (value === '__label__') {
        slot.label = promptLabel(slotIdx);
      } else {
        slot.op = value; slot.args = []; slot.cond = null;
      }
      onChange?.(); render();
    });
  }

  function showArgPicker(slotIdx, argIdx) {
    const slot = slots[slotIdx];
    const meta = OPS[slot.op];
    if (!meta) return;

    const items = [];

    // If allowedArgs is set, only show those + number pad
    if (allowedArgs) {
      // Categorize allowed args
      const isJump = ['jmp', 'djt', 'djf'].includes(slot.op);

      for (const arg of allowedArgs) {
        // Skip labels for non-jump args, skip non-labels for jumps
        const labels = getDefinedLabels();
        if (isJump && !labels.includes(arg) && !isNaN(Number(arg))) continue;

        let desc = '';
        if (arg === 'acc') desc = 'Accumulator';
        else if (arg === 'dat') desc = 'Data register';
        else if (pins.includes(arg)) desc = 'Output pin';
        else if (extPins.includes(arg)) desc = 'Input';
        else if (labels.includes(arg)) desc = 'Jump target';
        else if (!isNaN(Number(arg))) desc = '';

        items.push({ label: arg, desc, value: arg });
      }

      // Always allow number pad entry
      items.push({ label: '#', desc: 'Enter a number', value: '__number__' });
    } else {
      // Full picker
      items.push({ label: '#', desc: 'Enter a number', value: '__number__' });
      items.push({ label: 'acc', desc: 'Accumulator', value: 'acc' });
      items.push({ label: 'dat', desc: 'Data register', value: 'dat' });
      for (const pin of pins) items.push({ label: pin, desc: 'Output pin', value: pin });
      for (const pin of extPins) items.push({ label: pin, desc: 'Input', value: pin });

      if (['jmp', 'djt', 'djf'].includes(slot.op)) {
        for (const lbl of getDefinedLabels()) {
          items.push({ label: lbl, desc: 'Jump target', value: lbl });
        }
      }
    }

    showPicker(meta.argHints[argIdx] || 'Select Value', items, (value) => {
      if (value === '__number__') { showNumberPad(slotIdx, argIdx); return; }
      slot.args[argIdx] = value;
      onChange?.(); render();
    });
  }

  function showNumberPad(slotIdx, argIdx) {
    closePicker();
    pickerEl = document.createElement('div');
    pickerEl.className = 'picker-overlay';

    const sheet = document.createElement('div');
    sheet.className = 'picker-sheet numpad-sheet';

    const display = document.createElement('div');
    display.className = 'numpad-display';
    display.textContent = '0';
    sheet.appendChild(display);

    let value = '';
    let negative = false;
    function updateDisplay() { display.textContent = (negative ? '-' : '') + (value || '0'); }

    const keys = ['7','8','9','4','5','6','1','2','3','+/-','0','OK'];
    const grid = document.createElement('div');
    grid.className = 'numpad-grid';

    for (const key of keys) {
      const btn = document.createElement('button');
      btn.className = 'numpad-key' + (key === 'OK' ? ' numpad-ok' : '');
      btn.textContent = key;
      btn.addEventListener('click', () => {
        if (key === 'OK') {
          const num = parseInt((negative ? '-' : '') + (value || '0'), 10);
          slots[slotIdx].args[argIdx] = String(Math.max(-999, Math.min(999, num)));
          closePicker(); onChange?.(); render();
        } else if (key === '+/-') { negative = !negative; updateDisplay(); }
        else { if (value.length < 3) value += key; updateDisplay(); }
      });
      grid.appendChild(btn);
    }
    sheet.appendChild(grid);

    const clearBtn = document.createElement('button');
    clearBtn.className = 'numpad-clear';
    clearBtn.textContent = 'Clear';
    clearBtn.addEventListener('click', () => { value = ''; negative = false; updateDisplay(); });
    sheet.appendChild(clearBtn);

    pickerEl.appendChild(sheet);
    pickerEl.addEventListener('click', (e) => { if (e.target === pickerEl) closePicker(); });
    document.body.appendChild(pickerEl);
  }

  function promptLabel(slotIdx) {
    const existing = getDefinedLabels();
    for (const name of ['loop', 'start', 'skip', 'done', 'end', 'next']) {
      if (!existing.includes(name)) return name;
    }
    return 'L' + slotIdx;
  }

  function getDefinedLabels() {
    return slots.filter(s => s.label).map(s => s.label);
  }

  // -----------------------------------------------------------------------
  // Serialization
  // -----------------------------------------------------------------------

  function toAssembly() {
    const lines = [];
    for (const slot of slots) {
      if (slot.label) lines.push(slot.label + ':');
      if (!slot.op) continue;

      let line = '';
      if (slot.cond === true) line += '+ ';
      else if (slot.cond === false) line += '- ';

      if ((slot.op === 'teq' || slot.op === 'tgt') && slot.args.length === 1) {
        line += slot.op + ' acc ' + (slot.args[0] ?? '0');
      } else {
        const args = slot.args.map(a => a ?? '0');
        line += slot.op + (args.length ? ' ' + args.join(' ') : '');
      }
      lines.push(line);
    }
    return lines.join('\n');
  }

  function fromAssembly(text) {
    for (const slot of slots) {
      slot.label = null; slot.cond = null; slot.op = null;
      slot.args = []; slot.opLocked = false; slot.argLocked = [];
    }

    const lines = text.split('\n').filter(l => l.replace(/#.*$/, '').trim());
    let slotIdx = 0;

    for (const raw of lines) {
      if (slotIdx >= maxSlots) break;
      let line = raw.replace(/#.*$/, '').trim();
      if (!line) continue;

      if (line.endsWith(':')) {
        slots[slotIdx].label = line.slice(0, -1).toLowerCase();
        continue;
      }

      let cond = null;
      if (line.startsWith('+ ') || line.startsWith('+\t')) { cond = true; line = line.slice(2).trim(); }
      else if (line.startsWith('- ') || line.startsWith('-\t')) { cond = false; line = line.slice(2).trim(); }

      const [op, ...args] = line.split(/\s+/);
      const lower = op.toLowerCase();
      if (OPS[lower]) {
        slots[slotIdx].cond = cond;
        slots[slotIdx].op = lower;
        slots[slotIdx].args = args;
        slotIdx++;
      }
    }
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  render();

  return {
    getCode: toAssembly,
    setCode(text) { fromAssembly(text); render(); },
    render,
    getSlots: () => slots,
    highlightSlot(idx) {
      const rows = container.querySelectorAll('.slot-row');
      rows.forEach(r => r.classList.remove('highlight'));
      if (rows[idx]) rows[idx].classList.add('highlight');
    },
    clearHighlight() {
      container.querySelectorAll('.slot-row').forEach(r => r.classList.remove('highlight'));
    },
    updatePins(p, e) { pins.length = 0; pins.push(...p); extPins.length = 0; extPins.push(...e); },
    isAdvancedMode: () => advancedMode,
    hasPrefill: () => !!prefill,
  };
}
