/**
 * handles.js — Handles visuales de resize y rotate.
 *
 * Cuando un componente está seleccionado se muestran:
 *   - 8 handles de resize (n, ne, e, se, s, sw, w, nw)
 *   - 1 handle de rotación encima del componente
 *
 * El módulo se subscribe a los eventos del HMIState; no toca el DOM del
 * componente, sino que añade un overlay propio (`.hmi-handles`) posicionado
 * encima del wrapper `.hc`.
 *
 * Snap a 5 px en resize y a múltiplos de 15° en rotación.
 */
(function () {
  'use strict';

  const SNAP_PX  = 5;
  const SNAP_DEG = 15;
  const HANDLES = ['nw','n','ne','e','se','s','sw','w'];

  let overlay = null;

  /** Crea (una vez) el overlay con todos los handles. */
  function ensureOverlay(canvas) {
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.className = 'hmi-handles hidden';
    overlay.innerHTML = `
      ${HANDLES.map(h => `<div class="hmi-handle h-${h}" data-handle="${h}"></div>`).join('')}
      <div class="hmi-handle h-rot" data-handle="rot"></div>
    `;
    canvas.appendChild(overlay);

    // Bind a cada handle
    overlay.querySelectorAll('.hmi-handle').forEach(h => {
      h.addEventListener('mousedown', e => startGesture(e, h.dataset.handle));
    });
    return overlay;
  }

  /** Posiciona el overlay sobre el componente seleccionado. */
  function reposition() {
    if (!overlay) return;
    const sel = window.HMIState.getSelected();
    if (!sel || sel.locked) { overlay.classList.add('hidden'); return; }
    const el = document.querySelector(`.hc[data-id="${sel.id}"]`);
    if (!el) { overlay.classList.add('hidden'); return; }
    overlay.classList.remove('hidden');
    overlay.style.left      = el.style.left;
    overlay.style.top       = el.style.top;
    overlay.style.width     = el.style.width;
    overlay.style.height    = el.style.height;
    overlay.style.transform = el.style.transform;
  }

  /** snap multiplo. */
  function snap(v, step) { return Math.round(v / step) * step; }

  /**
   * Inicia un gesto de resize o rotación.
   * @param {MouseEvent} e
   * @param {string} handle  'nw'|'n'|...|'rot'
   */
  function startGesture(e, handle) {
    e.preventDefault();
    e.stopPropagation();
    const sel = window.HMIState.getSelected();
    if (!sel) return;

    window.HMIState.pushUndo();

    const startX = e.clientX, startY = e.clientY;
    const o = { x: sel.x, y: sel.y, w: sel.w, h: sel.h, rot: sel.rot || 0 };

    const onMove = ev => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (handle === 'rot') {
        // Rotación: ángulo desde el centro del componente
        const cx = o.x + o.w / 2;
        const cy = o.y + o.h / 2;
        const canvasRect = document.getElementById('canvasArea').getBoundingClientRect();
        const mx = ev.clientX - canvasRect.left;
        const my = ev.clientY - canvasRect.top;
        let ang = Math.atan2(my - cy, mx - cx) * 180 / Math.PI + 90;  // 0° apunta arriba
        if (ev.shiftKey) ang = snap(ang, SNAP_DEG);
        sel.rot = Math.round(ang);
      } else {
        // Resize: cada handle modifica x/y/w/h de forma diferente
        applyResize(sel, handle, o, dx, dy, ev.shiftKey);
      }
      window.HMIRenderer.updateComponent(sel);
      reposition();
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);
      window.HMIState.emit('componentChanged', sel, handle === 'rot' ? 'rot' : 'size');
      if (window.HMIPropertiesPanel) window.HMIPropertiesPanel.render();
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
  }

  /**
   * Aplica resize a un componente según el handle activado.
   * @param {Object} sel    componente del estado
   * @param {string} h      handle
   * @param {Object} o      valores originales {x,y,w,h}
   * @param {number} dx,dy  desplazamiento del mouse
   * @param {boolean} keepRatio si shift está presionado
   */
  function applyResize(sel, h, o, dx, dy, keepRatio) {
    let x = o.x, y = o.y, w = o.w, hh = o.h;
    if (h.includes('e')) w  = o.w + dx;
    if (h.includes('w')) { w = o.w - dx; x = o.x + dx; }
    if (h.includes('s')) hh = o.h + dy;
    if (h.includes('n')) { hh = o.h - dy; y = o.y + dy; }
    // Tamaños mínimos
    if (w  < 20) { w  = 20; if (h.includes('w')) x = o.x + o.w - 20; }
    if (hh < 20) { hh = 20; if (h.includes('n')) y = o.y + o.h - 20; }
    // keepRatio con shift
    if (keepRatio) {
      const ratio = o.w / o.h;
      if (Math.abs(dx) > Math.abs(dy)) hh = w / ratio;
      else                              w  = hh * ratio;
    }
    sel.x = snap(x, SNAP_PX);
    sel.y = snap(y, SNAP_PX);
    sel.w = Math.max(20, snap(w, SNAP_PX));
    sel.h = Math.max(20, snap(hh, SNAP_PX));
  }

  /** Bootstrap: enganche a los eventos del HMIState. */
  function init() {
    const canvas = document.getElementById('canvasArea');
    if (!canvas) return;
    ensureOverlay(canvas);
    window.HMIState.on('selectionChanged',  reposition);
    window.HMIState.on('componentChanged',  reposition);
    window.HMIState.on('componentsReplaced', reposition);
    window.HMIState.on('pageChanged',        () => { if (overlay) overlay.classList.add('hidden'); });
  }

  // Init cuando el DOM esté listo
  document.addEventListener('DOMContentLoaded', init);
  window.HMIHandles = { init, reposition };
})();
