/**
 * pages.js — Tabs de páginas del HMI.
 *
 * Permite organizar un HMI en múltiples páginas (vista principal, alarmas,
 * detalle del proceso, etc). Cada componente tiene `c.page` que apunta a la
 * página en la que vive.
 *
 * Lee y muestra las páginas desde HMIState. Soporta:
 *   - cambiar de página activa
 *   - agregar página nueva
 *   - eliminar página (con sus componentes asociados)
 *   - renombrar (doble click)
 */
(function () {
  'use strict';

  let container = null;

  function render() {
    if (!container) return;
    const pages = window.HMIState._raw.pages;
    const current = window.HMIState._raw.currentPage;
    container.innerHTML = pages.map((p, i) => {
      // Las páginas pueden ser strings ('p1') o objetos ({id,name})
      const id   = (typeof p === 'object') ? p.id   : p;
      const name = (typeof p === 'object') ? (p.name || id) : `Página ${i+1}`;
      const isActive = id === current;
      return `<div class="hmi-page-tab ${isActive ? 'active' : ''}" data-page="${escAttr(id)}">
        <span class="lbl" title="Doble click para renombrar">${escAttr(name)}</span>
        ${pages.length > 1 ? `<span class="close" data-close="${escAttr(id)}" title="Eliminar página">×</span>` : ''}
      </div>`;
    }).join('') + `
      <button type="button" class="hmi-page-add" title="Nueva página"><i class="fa-solid fa-plus"></i> Nueva</button>`;

    // Bind events
    container.querySelectorAll('.hmi-page-tab').forEach(tab => {
      tab.addEventListener('click', e => {
        if (e.target.classList.contains('close')) return;
        window.HMIState.setCurrentPage(tab.dataset.page);
      });
      tab.querySelector('.lbl').addEventListener('dblclick', () => renamePage(tab.dataset.page));
      const close = tab.querySelector('.close');
      if (close) close.addEventListener('click', e => {
        e.stopPropagation();
        if (confirm('¿Eliminar esta página y todos sus componentes?')) {
          window.HMIState.pushUndo();
          window.HMIState.removePage(close.dataset.close);
        }
      });
    });
    container.querySelector('.hmi-page-add')?.addEventListener('click', addPage);
  }

  function addPage() {
    const pages = window.HMIState._raw.pages;
    let i = pages.length + 1, id = 'p' + i;
    while (pages.some(p => (typeof p === 'object' ? p.id : p) === id)) { i++; id = 'p' + i; }
    const name = prompt('Nombre de la nueva página:', `Página ${i}`);
    if (!name) return;
    window.HMIState.pushUndo();
    window.HMIState._raw.pages.push({ id, name });
    window.HMIState._raw.dirty = true;
    window.HMIState.setCurrentPage(id);
    render();
  }

  function renamePage(id) {
    const pages = window.HMIState._raw.pages;
    const idx = pages.findIndex(p => (typeof p === 'object' ? p.id : p) === id);
    if (idx < 0) return;
    const cur = pages[idx];
    const oldName = typeof cur === 'object' ? cur.name : cur;
    const nuevo = prompt('Renombrar página:', oldName);
    if (!nuevo) return;
    pages[idx] = { id, name: nuevo };
    window.HMIState._raw.dirty = true;
    render();
  }

  function escAttr(s) {
    return String(s ?? '').replace(/[&<>"]/g, m => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'
    }[m]));
  }

  /** Inicializa el módulo. Llamar después del DOM ready. */
  function init(el) {
    container = el;
    if (!container) return;
    render();
    window.HMIState.on('pageChanged',         render);
    window.HMIState.on('componentsReplaced',  render);
  }

  window.HMIPages = { init, render };
})();
