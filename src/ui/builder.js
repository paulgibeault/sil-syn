/**
 * Visual instruction builder — tap-to-build assembly programs.
 *
 * Replaces the textarea with a slot-based editor where each instruction
 * is a row of tappable cells. Players pick opcodes and arguments from
 * context-aware pickers instead of typing.
 */

// ---------------------------------------------------------------------------
// Opcode metadata
// ---------------------------------------------------------------------------

const OPS = {
  mov: { args: 2, hint: 'Move a value',           argHints: ['from', 'to'] },
  add: { args: 1, hint: 'Add to acc',             argHints: ['value'] },
  sub: { args: 1, hint: 'Subtract from acc',      argHints: ['value'] },
  mul: { args: 1, hint: 'Multiply acc',           argHints: ['value'] },
  teq: { args: 1, hint: 'Test if equal',          argHints: ['compare to'] },  // teq acc X → compare acc to X
  tgt: { args: 1, hint: 'Test if greater',        argHints: ['compare to'] },  // tgt acc X → is acc > X?
  slp: { args: 1, hint: 'Sleep N cycles',         argHints: ['cycles'] },
  jmp: { args: 1, hint: 'Jump to label',          argHints: ['label'] },
  djt: { args: 1, hint: 'Jump if true',           argHints: ['label'] },
  djf: { args: 1, hint: 'Jump if false',          argHints: ['label'] },
};

// Simplified: teq/tgt always compare acc to the argument (less confusing for new players)
// Advanced mode (text editor) still supports the full 2-arg form

const MAX_SLOTS = 9;

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

/**
 * @param {object} opts
 * @param {HTMLElement} opts.container  - DOM element to render into
 * @param {string[]}   opts.pins       - MCU pins available (e.g. ['p0','p1'])
 * @param {string[]}   opts.extPins    - External pins readable (e.g. ['sensor'])
 * @param {function}   opts.onChange    - Called when code changes
 * @param {number}     [opts.maxSlots] - Max instruction slots
 */
export function createBuilder({ container, pins = [], extPins = [], onChange, maxSlots = MAX_SLOTS }) {
  const slots = [];
  for (let i = 0; i < maxSlots; i++) {
    slots.push({ label: null, cond: null, op: null, args: [], locked: false });
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

    if (advancedMode) {
      renderTextMode();
      return;
    }

    // Slot rows
    const slotsDiv = document.createElement('div');
    slotsDiv.className = 'builder-slots';

    for (let i = 0; i < maxSlots; i++) {
      slotsDiv.appendChild(renderSlot(i));
    }
    container.appendChild(slotsDiv);

    // Mode toggle
    const toggle = document.createElement('button');
    toggle.className = 'builder-toggle';
    toggle.textContent = 'text mode';
    toggle.addEventListener('click', () => { advancedMode = true; render(); });
    container.appendChild(toggle);
  }

  function renderTextMode() {
    textareaEl = document.createElement('textarea');
    textareaEl.className = 'builder-textarea';
    textareaEl.spellcheck = false;
    textareaEl.autocapitalize = 'none';
    textareaEl.value = toAssembly();
    textareaEl.addEventListener('input', () => {
      fromAssembly(textareaEl.value);
      onChange?.();
    });
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
    const row = document.createElement('div');
    row.className = 'slot-row' + (slot.locked ? ' locked' : '') + (slot.op ? '' : ' empty');
    row.dataset.idx = idx;

    // Line number
    const num = document.createElement('span');
    num.className = 'slot-num';
    num.textContent = String(idx + 1).padStart(2, '0');
    row.appendChild(num);

    // Condition badge (shown only after a test instruction exists above)
    if (slot.op && hasTestAbove(idx)) {
      const condBtn = document.createElement('button');
      condBtn.className = 'slot-cond' + (slot.cond === true ? ' cond-plus' : slot.cond === false ? ' cond-minus' : '');
      condBtn.textContent = slot.cond === true ? '+' : slot.cond === false ? '-' : ' ';
      condBtn.addEventListener('click', () => {
        if (slot.locked) return;
        // Cycle: null → true → false → null
        if (slot.cond === null) slot.cond = true;
        else if (slot.cond === true) slot.cond = false;
        else slot.cond = null;
        onChange?.();
        render();
      });
      row.appendChild(condBtn);
    }

    // Opcode cell
    const opCell = document.createElement('button');
    opCell.className = 'slot-cell slot-op' + (slot.op ? '' : ' placeholder');
    opCell.textContent = slot.op || 'tap +';
    opCell.addEventListener('click', () => {
      if (slot.locked) return;
      showOpPicker(idx);
    });
    row.appendChild(opCell);

    // Argument cells
    if (slot.op && OPS[slot.op]) {
      const meta = OPS[slot.op];
      for (let a = 0; a < meta.args; a++) {
        const argCell = document.createElement('button');
        argCell.className = 'slot-cell slot-arg' + (slot.args[a] ? '' : ' placeholder');
        argCell.textContent = slot.args[a] || meta.argHints[a] || '?';
        argCell.addEventListener('click', () => {
          if (slot.locked) return;
          showArgPicker(idx, a);
        });
        row.appendChild(argCell);
      }
    }

    // Label badge
    if (slot.label) {
      const labelBadge = document.createElement('span');
      labelBadge.className = 'slot-label-badge';
      labelBadge.textContent = slot.label + ':';
      row.appendChild(labelBadge);
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
      if (item.label && item.desc) {
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
    container.appendChild(pickerEl);
  }

  function showOpPicker(slotIdx) {
    const items = Object.entries(OPS).map(([op, meta]) => ({
      label: op,
      desc: meta.hint,
      value: op,
    }));

    // Add label option
    items.push({ label: 'label:', desc: 'Mark a jump target', value: '__label__' });

    // Add clear option if slot has content
    if (slots[slotIdx].op || slots[slotIdx].label) {
      items.push({ label: 'clear', desc: 'Remove this line', value: '__clear__', className: 'picker-clear' });
    }

    showPicker('Select Instruction', items, (value) => {
      const slot = slots[slotIdx];
      if (value === '__clear__') {
        slot.op = null; slot.args = []; slot.label = null; slot.cond = null;
      } else if (value === '__label__') {
        const name = promptLabel(slotIdx);
        if (name) { slot.label = name; }
      } else {
        slot.op = value;
        slot.args = [];
        slot.cond = null;
      }
      onChange?.();
      render();
    });
  }

  function showArgPicker(slotIdx, argIdx) {
    const slot = slots[slotIdx];
    const meta = OPS[slot.op];
    if (!meta) return;

    const items = [];

    // Number entry
    items.push({ label: '0-999', desc: 'Enter a number', value: '__number__' });

    // Registers
    items.push({ label: 'acc', desc: 'Accumulator', value: 'acc' });
    items.push({ label: 'dat', desc: 'Data register', value: 'dat' });

    // MCU pins
    for (const pin of pins) {
      items.push({ label: pin, desc: 'Output pin', value: pin });
    }

    // External pins (sensors)
    for (const pin of extPins) {
      items.push({ label: pin, desc: 'Input pin', value: pin });
    }

    // Labels (for jump instructions)
    if (['jmp', 'djt', 'djf'].includes(slot.op)) {
      const labels = getDefinedLabels();
      for (const lbl of labels) {
        items.push({ label: lbl, desc: 'Jump target', value: lbl });
      }
    }

    showPicker(meta.argHints[argIdx] || 'Select Value', items, (value) => {
      if (value === '__number__') {
        showNumberPad(slotIdx, argIdx);
        return;
      }
      slot.args[argIdx] = value;
      onChange?.();
      render();
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

    function updateDisplay() {
      display.textContent = (negative ? '-' : '') + (value || '0');
    }

    const keys = [
      '7', '8', '9',
      '4', '5', '6',
      '1', '2', '3',
      '+/-', '0', 'OK',
    ];

    const grid = document.createElement('div');
    grid.className = 'numpad-grid';

    for (const key of keys) {
      const btn = document.createElement('button');
      btn.className = 'numpad-key' + (key === 'OK' ? ' numpad-ok' : '');
      btn.textContent = key;
      btn.addEventListener('click', () => {
        if (key === 'OK') {
          const num = parseInt((negative ? '-' : '') + (value || '0'), 10);
          const clamped = Math.max(-999, Math.min(999, num));
          slots[slotIdx].args[argIdx] = String(clamped);
          closePicker();
          onChange?.();
          render();
        } else if (key === '+/-') {
          negative = !negative;
          updateDisplay();
        } else {
          if (value.length < 3) value += key;
          updateDisplay();
        }
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
    container.appendChild(pickerEl);
  }

  function promptLabel(slotIdx) {
    // Simple: generate label names automatically
    const existing = getDefinedLabels();
    const names = ['loop', 'start', 'skip', 'done', 'end', 'pass', 'fail', 'next'];
    for (const name of names) {
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
      if (slot.label) {
        lines.push(slot.label + ':');
      }
      if (!slot.op) continue;

      let line = '';
      if (slot.cond === true) line += '+ ';
      else if (slot.cond === false) line += '- ';

      // For teq/tgt in visual mode, we always compare acc to the arg
      if ((slot.op === 'teq' || slot.op === 'tgt') && slot.args.length === 1) {
        line += slot.op + ' acc ' + (slot.args[0] ?? '0');
      } else {
        line += slot.op + (slot.args.length ? ' ' + slot.args.join(' ') : '');
      }

      lines.push(line);
    }
    return lines.join('\n');
  }

  function fromAssembly(text) {
    // Reset all slots
    for (const slot of slots) {
      slot.label = null; slot.cond = null; slot.op = null; slot.args = []; slot.locked = false;
    }

    const lines = text.split('\n').filter(l => l.replace(/#.*$/, '').trim());
    let slotIdx = 0;

    for (const raw of lines) {
      if (slotIdx >= maxSlots) break;
      let line = raw.replace(/#.*$/, '').trim();
      if (!line) continue;

      if (line.endsWith(':')) {
        slots[slotIdx].label = line.slice(0, -1).toLowerCase();
        continue; // label doesn't consume a slot on its own if no op
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
    lockSlot(idx) { if (slots[idx]) { slots[idx].locked = true; render(); } },
    highlightSlot(idx) {
      const rows = container.querySelectorAll('.slot-row');
      rows.forEach(r => r.classList.remove('highlight'));
      if (rows[idx]) rows[idx].classList.add('highlight');
    },
    clearHighlight() {
      container.querySelectorAll('.slot-row').forEach(r => r.classList.remove('highlight'));
    },
    updatePins(newPins, newExtPins) {
      pins.length = 0; pins.push(...newPins);
      extPins.length = 0; extPins.push(...newExtPins);
    },
    isAdvancedMode: () => advancedMode,
  };
}
