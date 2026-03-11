/**
 * Guide — contextual hint overlay for tutorial levels.
 *
 * Shows a floating tooltip that points to a target element,
 * with a message telling the player what to do next.
 * Advances when the player performs the expected action.
 */

/**
 * @param {object} opts
 * @param {HTMLElement} opts.container - Parent element for the overlay
 * @returns {Guide}
 */
export function createGuide({ container }) {
  let overlayEl = null;
  let tooltipEl = null;
  let spotlightEl = null;
  let currentStep = null;
  let dismissCb = null;

  function show({ target, text, position = 'below', onDismiss }) {
    hide();

    currentStep = { target, text, position };
    dismissCb = onDismiss;

    // Overlay (dims everything except the target)
    overlayEl = document.createElement('div');
    overlayEl.className = 'guide-overlay';

    // Spotlight cutout around target
    if (target) {
      const rect = target.getBoundingClientRect();
      spotlightEl = document.createElement('div');
      spotlightEl.className = 'guide-spotlight';
      spotlightEl.style.top = (rect.top - 4) + 'px';
      spotlightEl.style.left = (rect.left - 4) + 'px';
      spotlightEl.style.width = (rect.width + 8) + 'px';
      spotlightEl.style.height = (rect.height + 8) + 'px';
      overlayEl.appendChild(spotlightEl);
    }

    // Tooltip
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'guide-tooltip';
    tooltipEl.innerHTML = `
      <div class="guide-text">${text}</div>
      <button class="guide-dismiss">Got it</button>
    `;
    overlayEl.appendChild(tooltipEl);

    // Position tooltip relative to target
    container.appendChild(overlayEl);

    if (target) {
      const rect = target.getBoundingClientRect();
      const contRect = container.getBoundingClientRect();

      if (position === 'below') {
        tooltipEl.style.top = (rect.bottom + 12 - contRect.top) + 'px';
        tooltipEl.style.left = Math.max(8, Math.min(
          rect.left - contRect.left,
          contRect.width - 280
        )) + 'px';
      } else if (position === 'above') {
        tooltipEl.style.bottom = (contRect.bottom - rect.top + 12) + 'px';
        tooltipEl.style.left = Math.max(8, rect.left - contRect.left) + 'px';
      }
    } else {
      // Center in container
      tooltipEl.style.top = '50%';
      tooltipEl.style.left = '50%';
      tooltipEl.style.transform = 'translate(-50%, -50%)';
    }

    // Dismiss handlers
    const dismissBtn = tooltipEl.querySelector('.guide-dismiss');
    dismissBtn.addEventListener('click', () => {
      hide();
      dismissCb?.();
    });

    // Also dismiss on overlay click
    overlayEl.addEventListener('click', (e) => {
      if (e.target === overlayEl) {
        hide();
        dismissCb?.();
      }
    });
  }

  function hide() {
    if (overlayEl) { overlayEl.remove(); overlayEl = null; }
    tooltipEl = null;
    spotlightEl = null;
    currentStep = null;
  }

  return { show, hide };
}

/**
 * Run a sequence of guide steps for a tutorial level.
 * Each step shows a tooltip, waits for dismissal, then shows the next.
 *
 * @param {Guide} guide
 * @param {object[]} steps - Array of { target, text, position, delay }
 * @returns {Promise} resolves when all steps are done
 */
export function runGuideSequence(guide, steps) {
  return new Promise((resolve) => {
    let idx = 0;

    function showNext() {
      if (idx >= steps.length) { resolve(); return; }
      const step = steps[idx];
      const target = typeof step.target === 'string'
        ? document.querySelector(step.target)
        : step.target;

      setTimeout(() => {
        guide.show({
          target,
          text: step.text,
          position: step.position || 'below',
          onDismiss: () => { idx++; showNext(); },
        });
      }, step.delay || 300);
    }

    showNext();
  });
}
