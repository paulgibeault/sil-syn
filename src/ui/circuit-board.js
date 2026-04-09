/**
 * Circuit Board — interactive grid where players place components and draw wires.
 *
 * Components are DOM elements positioned on a grid. Wires are SVG paths.
 * Interaction: tap tray → tap grid to place, tap output pin → tap input pin to wire.
 */

import { routeWire } from './wire-router.js';

// ---------------------------------------------------------------------------
// Component type definitions
// Colors use CSS variables where possible; helper reads them at runtime.
// ---------------------------------------------------------------------------

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || name;
}

const COMP_TYPES = {
  mcu: {
    w: 2, h: 2,
    label: 'MCU',
    get borderColor() { return cssVar('--accent'); },
    get bgColor() { return cssVar('--board'); },
    icon: '\u2588\u2588',
    get iconColor() { return cssVar('--accent'); },
  },
  sensor: {
    w: 2, h: 1,
    label: 'SENSOR',
    get borderColor() { return cssVar('--cyan'); },
    get bgColor() { return cssVar('--board'); },
    icon: '\u2261',
    get iconColor() { return cssVar('--cyan'); },
  },
  light: {
    w: 2, h: 1,
    label: 'LIGHT',
    borderColor: cssVar('--border'),
    get bgColor() { return cssVar('--board'); },
    icon: '\u2B24',
    get iconColor() { return cssVar('--dim'); },
  },
  output: {
    w: 2, h: 1,
    label: 'OUTPUT',
    get borderColor() { return cssVar('--yellow'); },
    get bgColor() { return cssVar('--board'); },
    icon: '\u25C9',
    get iconColor() { return cssVar('--yellow'); },
  },
};

// ---------------------------------------------------------------------------
// Circuit Board
// ---------------------------------------------------------------------------

/**
 * @param {object} opts
 * @param {HTMLElement} opts.container    - DOM element to render into
 * @param {number}      opts.gridCols    - Grid columns (default 8)
 * @param {number}      opts.gridRows    - Grid rows (default 5)
 * @param {function}    opts.onOpenBuilder - Called when MCU is tapped: (mcuId)
 * @param {function}    opts.onWiringChange - Called when wires change
 */
export function createCircuitBoard({
  container,
  gridCols = 8,
  gridRows = 5,
  onOpenBuilder,
  onWiringChange,
}) {
  // State
  const placed = [];       // { type, id, col, row, pins[], locked, el }
  const wires = [];        // { id, fromComp, fromPin, toComp, toPin, pathEl, hitEl }
  let mode = 'idle';       // 'idle' | 'placing' | 'wiring'
  let placingType = null;  // component type being placed
  let placingId = null;    // id for the component being placed
  let placingPins = null;  // pin config for the component being placed
  let wiringFrom = null;   // { comp, pin, el } when in wiring mode
  let cellSize = 48;
  let wireIdCounter = 0;
  let selectedWire = null;
  let deleteBtn = null;

  // DOM elements
  let gridEl = null;
  let svgEl = null;
  let ghostEl = null;
  let statusEl = null;

  const isDesktop = window.matchMedia('(min-width: 768px)').matches;
  const PIN_SIZE = isDesktop ? 28 : 20;     // px — touch-friendly pin diameter

  // -----------------------------------------------------------------------
  // Render the board
  // -----------------------------------------------------------------------

  function render() {
    container.innerHTML = '';
    container.classList.add('circuit-board-container');

    // Calculate cell size to fill container
    const cw = container.clientWidth || 320;
    const ch = container.clientHeight || 300;
    const cellByW = Math.floor((cw - 16) / gridCols);
    const cellByH = Math.floor((ch - 30) / gridRows); // 30 for status bar
    cellSize = Math.min(cellByW, cellByH);
    cellSize = Math.max(44, cellSize);

    const boardW = cellSize * gridCols;
    const boardH = cellSize * gridRows;

    // Grid background
    gridEl = document.createElement('div');
    gridEl.className = 'cb-grid';
    gridEl.style.width = boardW + 'px';
    gridEl.style.height = boardH + 'px';
    gridEl.style.backgroundSize = `${cellSize}px ${cellSize}px`;
    container.appendChild(gridEl);

    // SVG overlay for wires (z-index 1, below components)
    svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svgEl.setAttribute('class', 'cb-svg');
    svgEl.setAttribute('width', boardW);
    svgEl.setAttribute('height', boardH);
    gridEl.appendChild(svgEl);

    // Status bar
    statusEl = document.createElement('div');
    statusEl.className = 'cb-status';
    container.appendChild(statusEl);

    // Grid click handler for placement
    gridEl.addEventListener('click', onGridTap);

    // Re-render placed components
    for (const comp of placed) {
      renderComponent(comp);
    }

    // Re-render wires
    rerouteAllWires();
  }

  // -----------------------------------------------------------------------
  // Components
  // -----------------------------------------------------------------------

  function addComponent(type, id, col, row, outputPins = [], inputPins = [], locked = false) {
    const def = COMP_TYPES[type];
    if (!def) return null;

    // Check bounds
    if (col + def.w > gridCols || row + def.h > gridRows) return null;

    // Check overlap
    if (isOccupied(col, row, def.w, def.h)) return null;

    const pins = [];
    outputPins.forEach((pId, i) => {
      pins.push({ id: pId, direction: 'out', side: 'right', offset: i });
    });
    inputPins.forEach((pId, i) => {
      pins.push({ id: pId, direction: 'in', side: 'left', offset: i });
    });

    const comp = { type, id, col, row, pins, locked, el: null, def };
    placed.push(comp);

    if (gridEl) {
      renderComponent(comp);
      rerouteAllWires();
    }

    return comp;
  }

  function removeComponent(id) {
    const idx = placed.findIndex(c => c.id === id);
    if (idx === -1) return;
    const comp = placed[idx];
    if (comp.locked) return;

    // Remove wires connected to this component
    const toRemove = wires.filter(w => w.fromComp === id || w.toComp === id);
    for (const w of toRemove) removeWire(w.id);

    if (comp.el) comp.el.remove();
    placed.splice(idx, 1);
  }

  function renderComponent(comp) {
    if (comp.el) comp.el.remove();

    const def = comp.def || COMP_TYPES[comp.type];
    const el = document.createElement('div');
    el.className = 'cb-comp' + (comp.locked ? ' locked' : '');
    el.style.left = (comp.col * cellSize) + 'px';
    el.style.top = (comp.row * cellSize) + 'px';
    el.style.width = (def.w * cellSize - 4) + 'px';
    el.style.height = (def.h * cellSize - 4) + 'px';
    el.style.borderColor = def.borderColor;
    el.style.background = def.bgColor;
    el.dataset.compId = comp.id;

    // Label
    const label = document.createElement('div');
    label.className = 'cb-comp-label';
    label.textContent = def.label;
    el.appendChild(label);

    // Icon
    const icon = document.createElement('div');
    icon.className = 'cb-comp-icon';
    icon.style.color = def.iconColor;
    icon.textContent = def.icon;
    icon.id = `cb-icon-${comp.id}`;
    el.appendChild(icon);

    // Value display
    const val = document.createElement('div');
    val.className = 'cb-comp-value';
    val.id = `cb-val-${comp.id}`;
    if (comp.type === 'light') {
      val.textContent = 'needs 100';
      val.style.color = cssVar('--yellow');
    } else if (comp.type === 'sensor') {
      val.textContent = '~';
    } else if (comp.type === 'mcu') {
      val.textContent = 'tap to code';
      val.style.color = cssVar('--accent');
    }
    el.appendChild(val);

    // Pins
    for (const pin of comp.pins) {
      const pinEl = document.createElement('div');
      pinEl.className = `cb-pin cb-pin-${pin.direction}`;
      pinEl.dataset.compId = comp.id;
      pinEl.dataset.pinId = pin.id;
      pinEl.dataset.direction = pin.direction;
      pinEl.title = pin.id;

      // Size
      pinEl.style.width = PIN_SIZE + 'px';
      pinEl.style.height = PIN_SIZE + 'px';

      // Position pin on component edge
      const totalPins = comp.pins.filter(p => p.side === pin.side).length;
      const pinIdx = comp.pins.filter(p => p.side === pin.side).indexOf(pin);
      const spacing = (def.h * cellSize - 4) / (totalPins + 1);

      const halfPin = PIN_SIZE / 2;
      if (pin.side === 'right') {
        pinEl.style.right = (-halfPin) + 'px';
        pinEl.style.top = (spacing * (pinIdx + 1) - halfPin) + 'px';
      } else {
        pinEl.style.left = (-halfPin) + 'px';
        pinEl.style.top = (spacing * (pinIdx + 1) - halfPin) + 'px';
      }

      // Pin label
      const pinLabel = document.createElement('span');
      pinLabel.className = 'cb-pin-label';
      pinLabel.textContent = pin.id;
      if (pin.side === 'right') {
        pinLabel.style.right = (PIN_SIZE + 4) + 'px';
      } else {
        pinLabel.style.left = (PIN_SIZE + 4) + 'px';
      }
      pinLabel.style.top = '2px';
      pinEl.appendChild(pinLabel);

      // Use click for reliable event handling on both desktop and mobile
      pinEl.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        onPinTap(comp, pin, pinEl);
      });

      el.appendChild(pinEl);
    }

    // Component tap handler
    el.addEventListener('click', (e) => {
      if (e.target.closest('.cb-pin')) return; // pin handles its own tap
      if (mode === 'wiring') {
        cancelWiring();
        return;
      }
      if (comp.type === 'mcu') {
        onOpenBuilder?.(comp.id);
      }
    });

    gridEl.appendChild(el);
    comp.el = el;
  }

  function isOccupied(col, row, w, h, excludeId = null) {
    for (const comp of placed) {
      if (comp.id === excludeId) continue;
      const def = COMP_TYPES[comp.type];
      if (col < comp.col + def.w && col + w > comp.col &&
          row < comp.row + def.h && row + h > comp.row) {
        return true;
      }
    }
    return false;
  }

  // -----------------------------------------------------------------------
  // Wires
  // -----------------------------------------------------------------------

  function addWire(fromCompId, fromPinId, toCompId, toPinId) {
    // Validate
    const fromComp = placed.find(c => c.id === fromCompId);
    const toComp = placed.find(c => c.id === toCompId);
    if (!fromComp || !toComp) return null;

    // Check for duplicate
    if (wires.some(w => w.fromComp === fromCompId && w.fromPin === fromPinId &&
                        w.toComp === toCompId && w.toPin === toPinId)) {
      setStatus('Already connected');
      setTimeout(() => { if (mode === 'idle') setStatus(''); }, 1500);
      return null;
    }

    const wire = {
      id: 'wire-' + (wireIdCounter++),
      fromComp: fromCompId,
      fromPin: fromPinId,
      toComp: toCompId,
      toPin: toPinId,
      pathEl: null,
      hitEl: null,
      locked: false,
    };
    wires.push(wire);
    renderWire(wire);
    onWiringChange?.();
    return wire;
  }

  function removeWire(wireId) {
    const idx = wires.findIndex(w => w.id === wireId);
    if (idx === -1) return;
    const wire = wires[idx];
    if (wire.locked) return;
    if (wire.pathEl) wire.pathEl.remove();
    if (wire.hitEl) wire.hitEl.remove();
    wires.splice(idx, 1);
    onWiringChange?.();
  }

  function renderWire(wire) {
    const fromPos = getPinPosition(wire.fromComp, wire.fromPin);
    const toPos = getPinPosition(wire.toComp, wire.toPin);
    if (!fromPos || !toPos) return;

    const fromPin = getPinDef(wire.fromComp, wire.fromPin);
    const toPin = getPinDef(wire.toComp, wire.toPin);
    const path = routeWire(fromPos, toPos, fromPin?.side || 'right', toPin?.side || 'left');

    // Remove old elements
    if (wire.pathEl) wire.pathEl.remove();
    if (wire.hitEl) wire.hitEl.remove();

    // Hit area (invisible, wide for touch)
    const hit = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    hit.setAttribute('d', path);
    hit.setAttribute('class', 'cb-wire-hit');
    hit.dataset.wireId = wire.id;
    hit.addEventListener('click', () => onWireTap(wire.id));
    svgEl.appendChild(hit);
    wire.hitEl = hit;

    // Visible wire
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    el.setAttribute('d', path);
    el.setAttribute('class', 'cb-wire');
    el.id = 'cb-wire-' + wire.id;
    svgEl.appendChild(el);
    wire.pathEl = el;
  }

  function rerouteAllWires() {
    for (const wire of wires) {
      renderWire(wire);
    }
  }

  function getPinPosition(compId, pinId) {
    const comp = placed.find(c => c.id === compId);
    if (!comp) return null;
    const def = COMP_TYPES[comp.type];
    const pin = comp.pins.find(p => p.id === pinId);
    if (!pin) return null;

    const totalPins = comp.pins.filter(p => p.side === pin.side).length;
    const pinIdx = comp.pins.filter(p => p.side === pin.side).indexOf(pin);
    const spacing = (def.h * cellSize - 4) / (totalPins + 1);

    const x = pin.side === 'right'
      ? comp.col * cellSize + def.w * cellSize - 4
      : comp.col * cellSize;
    const y = comp.row * cellSize + spacing * (pinIdx + 1);

    return { x, y };
  }

  function getPinDef(compId, pinId) {
    const comp = placed.find(c => c.id === compId);
    if (!comp) return null;
    return comp.pins.find(p => p.id === pinId);
  }

  // -----------------------------------------------------------------------
  // Interaction
  // -----------------------------------------------------------------------

  function startPlacing(type, id, outputPins = [], inputPins = []) {
    mode = 'placing';
    placingType = type;
    placingId = id;
    placingPins = { outputPins, inputPins };
    setStatus(`Tap the board to place ${COMP_TYPES[type]?.label || type}`);

    // Show ghost on grid
    showGhost(type);
  }

  function cancelPlacing() {
    mode = 'idle';
    placingType = null;
    placingId = null;
    placingPins = null;
    hideGhost();
    setStatus('');
  }

  function showGhost(type) {
    hideGhost();
    const def = COMP_TYPES[type];
    if (!def) return;
    ghostEl = document.createElement('div');
    ghostEl.className = 'cb-ghost';
    ghostEl.style.width = (def.w * cellSize - 4) + 'px';
    ghostEl.style.height = (def.h * cellSize - 4) + 'px';
    ghostEl.style.borderColor = def.borderColor;
    ghostEl.textContent = def.label;
    ghostEl.style.display = 'none';
    gridEl.appendChild(ghostEl);
  }

  function hideGhost() {
    if (ghostEl) { ghostEl.remove(); ghostEl = null; }
  }

  function onGridTap(e) {
    if (e.target.closest('.cb-comp') || e.target.closest('.cb-pin')) return;
    if (selectedWire) { deselectWire(); return; }

    const rect = gridEl.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const col = Math.floor(x / cellSize);
    const row = Math.floor(y / cellSize);

    if (mode === 'placing' && placingType) {
      const def = COMP_TYPES[placingType];
      if (!isOccupied(col, row, def.w, def.h)) {
        addComponent(placingType, placingId, col, row,
          placingPins.outputPins, placingPins.inputPins);
        cancelPlacing();
      } else {
        setStatus('Space occupied. Tap an empty area.');
      }
    } else if (mode === 'wiring') {
      // Cancel wiring
      cancelWiring();
    }
  }

  function onPinTap(comp, pin, pinEl) {
    if (mode === 'placing') {
      cancelPlacing();
      return;
    }

    if (mode === 'wiring') {
      // Complete wire if compatible
      if (wiringFrom && pin.direction !== wiringFrom.pin.direction &&
          comp.id !== wiringFrom.comp.id) {
        // Determine which is from (output) and which is to (input)
        let fromComp, fromPin, toComp, toPin;
        if (wiringFrom.pin.direction === 'out') {
          fromComp = wiringFrom.comp.id;
          fromPin = wiringFrom.pin.id;
          toComp = comp.id;
          toPin = pin.id;
        } else {
          fromComp = comp.id;
          fromPin = pin.id;
          toComp = wiringFrom.comp.id;
          toPin = wiringFrom.pin.id;
        }
        addWire(fromComp, fromPin, toComp, toPin);
        cancelWiring();
      } else {
        cancelWiring();
        // Start new wiring from this pin
        startWiring(comp, pin, pinEl);
      }
      return;
    }

    // Start wiring from this pin
    startWiring(comp, pin, pinEl);
  }

  function startWiring(comp, pin, pinEl) {
    mode = 'wiring';
    wiringFrom = { comp, pin, el: pinEl };
    pinEl.classList.add('active');

    // Disable each SVG wire hit area so they can't intercept pin clicks
    svgEl?.querySelectorAll('.cb-wire-hit').forEach(el => {
      el.style.pointerEvents = 'none';
    });

    const target = pin.direction === 'out' ? 'an input' : 'an output';
    setStatus(`Tap ${target} pin to connect`);

    // Highlight compatible pins
    for (const c of placed) {
      if (c.id === comp.id) continue;
      for (const p of c.pins) {
        if (p.direction !== pin.direction) {
          const pEl = c.el?.querySelector(`[data-pin-id="${p.id}"]`);
          if (pEl) pEl.classList.add('compatible');
        }
      }
    }
  }

  function cancelWiring() {
    if (wiringFrom?.el) wiringFrom.el.classList.remove('active');
    // Remove compatible highlights
    gridEl?.querySelectorAll('.cb-pin.compatible').forEach(el => el.classList.remove('compatible'));
    wiringFrom = null;
    mode = 'idle';
    // Re-enable SVG wire hit areas
    svgEl?.querySelectorAll('.cb-wire-hit').forEach(el => {
      el.style.pointerEvents = '';
    });
    setStatus('');
  }

  function onWireTap(wireId) {
    const wire = wires.find(w => w.id === wireId);
    if (!wire) return;

    if (selectedWire === wireId) {
      // Already selected — deselect
      deselectWire();
      return;
    }

    selectWire(wireId);
  }

  function selectWire(wireId) {
    deselectWire();
    const wire = wires.find(w => w.id === wireId);
    if (!wire || !wire.pathEl) return;

    selectedWire = wireId;
    wire.pathEl.classList.add('selected');

    // Show delete button at the midpoint of the wire
    const bbox = wire.pathEl.getBBox();
    const midX = bbox.x + bbox.width / 2;
    const midY = bbox.y + bbox.height / 2;

    deleteBtn = document.createElement('button');
    deleteBtn.className = 'cb-wire-delete';
    deleteBtn.textContent = '\u00D7';
    deleteBtn.style.left = midX + 'px';
    deleteBtn.style.top = midY + 'px';
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!wire.locked) {
        removeWire(wireId);
        setStatus('Wire removed');
        setTimeout(() => { if (mode === 'idle') setStatus(''); }, 1500);
      } else {
        setStatus('This wire is locked');
        setTimeout(() => setStatus(''), 1500);
      }
      deselectWire();
    });
    gridEl.appendChild(deleteBtn);
    setStatus('Tap \u00D7 to remove wire');
  }

  function deselectWire() {
    if (selectedWire) {
      const wire = wires.find(w => w.id === selectedWire);
      if (wire?.pathEl) wire.pathEl.classList.remove('selected');
      selectedWire = null;
    }
    if (deleteBtn) {
      deleteBtn.remove();
      deleteBtn = null;
    }
    if (mode === 'idle') setStatus('');
  }

  function setStatus(text) {
    if (statusEl) statusEl.textContent = text;
  }

  // -----------------------------------------------------------------------
  // Live value updates (during simulation)
  // -----------------------------------------------------------------------

  function updateValues(board, cycle, level) {
    for (const comp of placed) {
      const valEl = document.getElementById(`cb-val-${comp.id}`);
      const iconEl = document.getElementById(`cb-icon-${comp.id}`);
      if (!valEl) continue;

      if (comp.type === 'sensor' && level?.sources?.[comp.id]) {
        const v = level.sources[comp.id](Math.max(1, cycle));
        valEl.textContent = v;
        valEl.style.color = cssVar('--cyan');
      }

      if (comp.type === 'light' || comp.type === 'output') {
        const v = board.readSimplePin(comp.id);
        valEl.textContent = v;
        const brightness = Math.min(1, Math.abs(v) / 100);

        if (comp.type === 'light') {
          // Light intensity
          if (iconEl) {
            iconEl.style.color = brightness > 0 ? cssVar('--green') : 'transparent';
            iconEl.style.opacity = Math.max(0.15, brightness);
            iconEl.style.textShadow = brightness > 0.3
              ? `0 0 ${brightness * 12}px rgba(127,217,98,${brightness})` : 'none';
          }
          if (comp.el) {
            comp.el.style.borderColor = brightness > 0.5 ? cssVar('--green') : cssVar('--border');
            comp.el.style.boxShadow = brightness > 0.3
              ? `0 0 ${brightness * 16}px rgba(127,217,98,${brightness * 0.4})` : 'none';
          }
          valEl.style.color = brightness > 0 ? cssVar('--green') : cssVar('--dim');

          // Show expected vs actual
          if (level?.expected?.[comp.id]) {
            const expected = level.expected[comp.id](Math.max(1, cycle));
            valEl.textContent = v === expected ? `${v} \u2713` : `${v} (need ${expected})`;
          }
        } else {
          valEl.style.color = v > 0 ? cssVar('--green') : cssVar('--dim');
        }
      }
    }

    // Animate active wires
    for (const wire of wires) {
      if (!wire.pathEl) continue;
      const fromComp = placed.find(c => c.id === wire.fromComp);
      if (!fromComp) continue;

      let value = 0;
      if (fromComp.type === 'mcu') {
        const pin = wire.fromPin;
        try { value = board.readSimplePin(pin) || 0; } catch { value = 0; }
      }

      wire.pathEl.classList.toggle('active', value !== 0);
    }
  }

  function resetValues() {
    for (const comp of placed) {
      const valEl = document.getElementById(`cb-val-${comp.id}`);
      const iconEl = document.getElementById(`cb-icon-${comp.id}`);
      if (!valEl) continue;

      if (comp.type === 'light') {
        valEl.textContent = 'needs 100';
        valEl.style.color = cssVar('--yellow');
        if (iconEl) {
          iconEl.style.color = cssVar('--dim');
          iconEl.style.opacity = '0.2';
          iconEl.style.textShadow = 'none';
        }
        if (comp.el) {
          comp.el.style.borderColor = cssVar('--border');
          comp.el.style.boxShadow = 'none';
        }
      } else if (comp.type === 'sensor') {
        valEl.textContent = '~';
        valEl.style.color = cssVar('--cyan');
      } else if (comp.type === 'mcu') {
        valEl.textContent = 'tap to code';
        valEl.style.color = cssVar('--accent');
      }
    }

    for (const wire of wires) {
      if (wire.pathEl) wire.pathEl.classList.remove('active');
    }
  }

  // -----------------------------------------------------------------------
  // Engine integration
  // -----------------------------------------------------------------------

  /** Convert placed wires to the level.wiring format the engine expects. */
  function getWiring() {
    return wires
      .filter(w => {
        const fromComp = placed.find(c => c.id === w.fromComp);
        return fromComp && fromComp.type === 'mcu';
      })
      .map(w => ({
        from: { mcuId: w.fromComp, pin: w.fromPin },
        to: w.toPin,
      }));
  }

  /** Get list of placed component IDs by type. */
  function getPlacedByType(type) {
    return placed.filter(c => c.type === type);
  }

  // -----------------------------------------------------------------------
  // Keyboard shortcuts for wire management
  // -----------------------------------------------------------------------

  function onKeyDown(e) {
    if (!selectedWire) return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      const wire = wires.find(w => w.id === selectedWire);
      if (wire && !wire.locked) {
        removeWire(selectedWire);
        setStatus('Wire removed');
        setTimeout(() => { if (mode === 'idle') setStatus(''); }, 1500);
      }
      deselectWire();
    } else if (e.key === 'Escape') {
      deselectWire();
    }
  }
  document.addEventListener('keydown', onKeyDown);

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  render();

  /** Tear down event listeners and DOM content to prevent leaks. */
  function destroy() {
    document.removeEventListener('keydown', onKeyDown);
    container.innerHTML = '';
  }

  return {
    render,
    addComponent,
    removeComponent,
    addWire,
    startPlacing,
    cancelPlacing,
    getWiring,
    getPlacedByType,
    updateValues,
    resetValues,
    rerouteAllWires,
    setStatus,
    destroy,
    get placed() { return placed; },
    get wires() { return wires; },
    get mode() { return mode; },
    get cellSize() { return cellSize; },
  };
}
