/**
 * navigation.component.js — Botones de navegación entre páginas del HMI.
 *
 * Se registran 3 componentes:
 *   goto-page  → salta a una página específica (seleccionada por el usuario)
 *   next-page  → avanza a la página siguiente (con opción "loop")
 *   prev-page  → retrocede a la página anterior (con opción "loop")
 *
 * Funcionan tanto en modo edición como en runtime. En runtime llaman a
 * `window.HMIState.setCurrentPage(id)` para cambiar la página activa.
 * En edición se muestran como botones inertes (no navegan al hacer click).
 */
(function () {
  'use strict';

  // ═════════ Helpers compartidos ═════════════════════════════════════════
  function getPages() {
    try {
      const raw = window.HMIState && window.HMIState._raw && window.HMIState._raw.pages;
      return Array.isArray(raw) ? raw : [];
    } catch (e) { return []; }
  }
  function pageId(p)  { return (typeof p === 'object' && p !== null) ? p.id   : p; }
  function pageName(p, i) {
    if (typeof p === 'object' && p !== null) return p.name || p.id || `Página ${i+1}`;
    return `Página ${i+1}`;
  }
  function currentPageIndex() {
    const pages = getPages();
    const cur = window.HMIState && window.HMIState._raw && window.HMIState._raw.currentPage;
    return pages.findIndex(p => pageId(p) === cur);
  }
  function goToPage(targetId) {
    if (!targetId) return;
    if (window.HMIState && typeof window.HMIState.setCurrentPage === 'function') {
      window.HMIState.setCurrentPage(targetId);
    }
  }
  function goRelative(delta, loop) {
    const pages = getPages();
    if (pages.length < 2) return;
    const idx = currentPageIndex();
    if (idx < 0) return;
    let target = idx + delta;
    if (loop) {
      target = ((target % pages.length) + pages.length) % pages.length;
    } else {
      if (target < 0 || target >= pages.length) return;
    }
    goToPage(pageId(pages[target]));
  }

  // Exponer para que los onclick puedan usarlos por nombre
  window.HMINav = { goToPage, goRelative };

  // ═════════ Estilo común ════════════════════════════════════════════════
  function baseButton(bg, color) {
    return `width:100%;height:100%;background:${bg};color:${color};
            border:none;border-radius:6px;font-weight:bold;font-size:13px;
            cursor:pointer;box-shadow:0 2px 0 rgba(0,0,0,0.18);
            display:flex;align-items:center;justify-content:center;gap:8px;
            padding:0 10px;box-sizing:border-box;
            transition:transform 0.08s`;
  }

  // ══════════════════════════════════════════════════════════════════════
  // goto-page — Ir a página específica
  // ══════════════════════════════════════════════════════════════════════
  HMIRegistry.register({
    type:        'goto-page',
    label:       'Ir a página',
    icon:        '⇥',
    category:    'Navegación',
    defaultSize: { w: 140, h: 44 },

    defaults: {
      targetPage: '',            // ID de la página destino
      text:       'Ir a…',
      bg:         '#0ea5e9',
      color:      '#ffffff',
      showIcon:   true,
    },

    properties: [
      { name: 'targetPage', label: 'Página destino', type: 'text',  group: 'General',
        placeholder: 'p1, p2, p3…' },
      { name: 'text',       label: 'Texto',          type: 'text',  group: 'Estilo' },
      { name: 'showIcon',   label: 'Mostrar icono',  type: 'checkbox', group: 'Estilo' },
      { name: 'bg',         label: 'Fondo',          type: 'color', group: 'Estilo' },
      { name: 'color',      label: 'Color texto',    type: 'color', group: 'Estilo' },
    ],

    render(c, ctx) {
      const txt = ctx.esc(c.text || 'Ir a página');
      const target = ctx.esc(c.targetPage || '');
      const icon = c.showIcon ? '<span style="font-size:16px">⇥</span>' : '';
      const disabled = !target ? 'opacity:0.5;cursor:not-allowed' : '';
      return `<button type="button" style="${baseButton(c.bg, c.color)};${disabled}"
              onclick="window.HMINav && window.HMINav.goToPage('${target}')"
              title="Ir a: ${target || 'sin destino'}">
        ${icon}<span>${txt}</span>
      </button>`;
    }
  });

  // ══════════════════════════════════════════════════════════════════════
  // next-page — Avanzar a la página siguiente
  // ══════════════════════════════════════════════════════════════════════
  HMIRegistry.register({
    type:        'next-page',
    label:       'Página siguiente',
    icon:        '→',
    category:    'Navegación',
    defaultSize: { w: 130, h: 44 },

    defaults: {
      text:       'Siguiente',
      loop:       true,
      bg:         '#22c55e',
      color:      '#ffffff',
      showIcon:   true,
    },

    properties: [
      { name: 'text',     label: 'Texto',              type: 'text',     group: 'Estilo' },
      { name: 'loop',     label: 'Ciclar al final',    type: 'checkbox', group: 'General' },
      { name: 'showIcon', label: 'Mostrar flecha',     type: 'checkbox', group: 'Estilo' },
      { name: 'bg',       label: 'Fondo',              type: 'color',    group: 'Estilo' },
      { name: 'color',    label: 'Color texto',        type: 'color',    group: 'Estilo' },
    ],

    render(c, ctx) {
      const txt = ctx.esc(c.text || 'Siguiente');
      const icon = c.showIcon ? '<span style="font-size:16px">→</span>' : '';
      const loopArg = c.loop ? 'true' : 'false';
      return `<button type="button" style="${baseButton(c.bg, c.color)}"
              onclick="window.HMINav && window.HMINav.goRelative(1, ${loopArg})">
        <span>${txt}</span>${icon}
      </button>`;
    }
  });

  // ══════════════════════════════════════════════════════════════════════
  // prev-page — Retroceder a la página anterior
  // ══════════════════════════════════════════════════════════════════════
  HMIRegistry.register({
    type:        'prev-page',
    label:       'Página anterior',
    icon:        '←',
    category:    'Navegación',
    defaultSize: { w: 130, h: 44 },

    defaults: {
      text:       'Anterior',
      loop:       true,
      bg:         '#64748b',
      color:      '#ffffff',
      showIcon:   true,
    },

    properties: [
      { name: 'text',     label: 'Texto',              type: 'text',     group: 'Estilo' },
      { name: 'loop',     label: 'Ciclar al inicio',   type: 'checkbox', group: 'General' },
      { name: 'showIcon', label: 'Mostrar flecha',     type: 'checkbox', group: 'Estilo' },
      { name: 'bg',       label: 'Fondo',              type: 'color',    group: 'Estilo' },
      { name: 'color',    label: 'Color texto',        type: 'color',    group: 'Estilo' },
    ],

    render(c, ctx) {
      const txt = ctx.esc(c.text || 'Anterior');
      const icon = c.showIcon ? '<span style="font-size:16px">←</span>' : '';
      const loopArg = c.loop ? 'true' : 'false';
      return `<button type="button" style="${baseButton(c.bg, c.color)}"
              onclick="window.HMINav && window.HMINav.goRelative(-1, ${loopArg})">
        ${icon}<span>${txt}</span>
      </button>`;
    }
  });
})();
