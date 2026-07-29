/**
 * canvas.js — Bootstrap del editor.
 *
 * Responsable de:
 *   1) Construir la paleta lateral leyendo HMIRegistry.byCategory()
 *   2) Conectar drag&drop entre paleta y canvas
 *   3) Pintar el lienzo inicial
 *   4) Configurar atajos de teclado mínimos (Delete, Ctrl+Z, Ctrl+Y)
 *
 * NUNCA toca tipos concretos de componentes — todo se descubre por registry.
 */
(function () {
  'use strict';

  /**
   * Construye el árbol de la paleta a partir del registry.
   * @param {HTMLElement} container
   */
  function buildPalette(container) {
    if (!container) return;
    const groups = window.HMIRegistry.byCategory();
    const cats   = Object.keys(groups).sort();
    container.innerHTML = cats.map(cat => `
      <details class="palette-cat" open>
        <summary>${escAttr(cat)} <span class="count">(${groups[cat].length})</span></summary>
        <div class="palette-items">
          ${groups[cat].map(def => `
            <div class="palette-item" data-palette-item data-type="${escAttr(def.type)}"
                 title="${escAttr(def.label)}">
              <span class="palette-icon">${def.icon || '⬛'}</span>
              <span class="palette-label">${escAttr(def.label)}</span>
            </div>
          `).join('')}
        </div>
      </details>
    `).join('');
    window.HMIDragDrop.autoBindPalette(container);
  }

  /**
   * Inicializa el editor completo. Llamar UNA vez tras cargar los componentes.
   * @param {Object} opts
   * @param {HTMLElement} opts.palette   contenedor de la paleta
   * @param {HTMLElement} opts.canvas    contenedor del lienzo
   * @param {Array}       [opts.variables]  variables iniciales del proyecto
   * @param {Object}      [opts.snapshot]   estado serializado a restaurar
   * @param {Function}    [opts.onWrite]    handler de escritura runtime
   */
  function init(opts) {
    if (!window.HMIRegistry || !window.HMIState || !window.HMIRenderer) {
      console.error('[HMICanvas] Faltan módulos del core (registry/state/renderer)');
      return;
    }
    window.HMIContext.init(window.HMIState, opts.onWrite);

    if (opts.variables) window.HMIState.setVars(opts.variables);
    if (opts.snapshot)  window.HMIState.deserialize(opts.snapshot);

    // Paleta
    buildPalette(opts.palette);
    // Drop en canvas
    window.HMIDragDrop.bindCanvas(opts.canvas);

    // Render inicial
    window.HMIRenderer.renderAll(opts.canvas);
    window.HMIPropertiesPanel.render();

    // Atajos
    document.addEventListener('keydown', e => {
      if (e.target.matches('input,textarea,select')) return;
      const A = window.HMIActions;

      // Delete elimina TODOS los seleccionados (usa el nuevo HMIActions)
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (A && A.deleteSelected) A.deleteSelected();
        return;
      }
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;

      // Ctrl+Z / Ctrl+Y / Ctrl+S ya existían
      if (e.key === 'z') { e.preventDefault(); window.HMIState.undo(); return; }
      if (e.key === 'y') { e.preventDefault(); window.HMIState.redo(); return; }

      // Nuevos: Ctrl+C / Ctrl+V / Ctrl+D / Ctrl+A
      if (!A) return;
      if (e.key === 'c') { e.preventDefault(); A.copy(); return; }
      if (e.key === 'v') { e.preventDefault(); A.paste(); return; }
      if (e.key === 'd') { e.preventDefault(); A.duplicate(); return; }
      if (e.key === 'a') {
        // Ctrl+A: seleccionar todo lo de la página actual
        e.preventDefault();
        const pg = window.HMIState._raw.currentPage;
        const ids = window.HMIState.listComponents(pg).map(c => c.id);
        window.HMIState.setSelection(ids);
        return;
      }
      // Ctrl+G / Ctrl+Shift+G: agrupar / desagrupar
      if (e.key === 'g' || e.key === 'G') {
        e.preventDefault();
        if (e.shiftKey) { A.ungroup(); } else { A.group(); }
        return;
      }
    });

    // Re-build paleta si llegan componentes nuevos en tiempo real
    window.HMIRegistry.on('register', () => buildPalette(opts.palette));

    console.log('[HMICanvas] Editor inicializado. Componentes registrados:',
                window.HMIRegistry.all().length);
  }

  function escAttr(s) {
    return String(s ?? '').replace(/[&<>"]/g, m => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'
    }[m]));
  }

  window.HMICanvas = { init, buildPalette };
})();
