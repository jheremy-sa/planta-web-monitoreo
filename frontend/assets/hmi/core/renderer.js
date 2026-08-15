/**
 * renderer.js — Renderizado genérico de componentes en el canvas.
 *
 * Esta capa es DELIBERADAMENTE delgada: solo construye el wrapper común
 * (posición, tamaño, rotación, opacidad, handles de selección) y delega
 * todo el contenido visual al método `render()` de la definición del
 * componente registrado en HMIRegistry. No contiene NINGUNA lógica
 * específica por tipo de componente — esa es la promesa de la
 * arquitectura plugin.
 *
 * Funciones expuestas en window.HMIRenderer:
 *   renderAll(canvas)              limpia el canvas y pinta todos los componentes
 *   renderComponent(c, canvas)     pinta un componente (crea o reemplaza)
 *   updateComponent(c)             repinta el SVG interno cuando cambian datos
 *   removeComponent(id)            quita el DOM de un componente
 */
(function () {
  'use strict';

  /**
   * Crea el wrapper común y delega el contenido al render() del componente.
   * @param {Object} c          objeto-componente del estado
   * @param {HTMLElement} root  contenedor del canvas
   * @returns {HTMLElement}     elemento DOM creado
   */
  function renderComponent(c, root) {
    const def = window.HMIRegistry.get(c.type);
    if (!def) {
      console.warn(`[HMIRenderer] Tipo desconocido: ${c.type}`);
      return null;
    }
    // Si solo está en otra página, no se renderiza
    if (c.page && c.page !== window.HMIState._raw.currentPage) return null;
    // Si ya existe, removerlo (re-render limpio)
    const old = root.querySelector(`[data-id="${c.id}"]`);
    if (old) old.remove();

    const el = document.createElement('div');
    el.className = 'hc' + (window.HMIState.getSelected()?.id === c.id ? ' sel' : '');
    el.setAttribute('data-id', c.id);
    el.setAttribute('data-type', c.type);
    applyTransform(el, c);

    // Contenido delegado al componente
    try {
      el.innerHTML = def.render(c, window.HMIContext);
    } catch (e) {
      console.error(`[HMIRenderer] render() de '${c.type}' falló:`, e);
      el.innerHTML = `<div style="padding:6px;background:#fee;color:#900;font:11px monospace">
        ⚠ ${c.type}: ${e.message}</div>`;
    }
    root.appendChild(el);
    return el;
  }

  /** Aplica posición, tamaño, rotación y opacidad al wrapper. */
  function applyTransform(el, c) {
    el.style.position  = 'absolute';
    el.style.left      = (c.x || 0) + 'px';
    el.style.top       = (c.y || 0) + 'px';
    el.style.width     = (c.w || 100) + 'px';
    el.style.height    = (c.h || 60)  + 'px';
    el.style.transform = c.rot ? `rotate(${c.rot}deg)` : '';
    el.style.opacity   = (c.opacity !== undefined ? c.opacity / 100 : 1);
    el.style.zIndex    = c.z || 1;
    if (c.locked)   el.classList.add('locked');   else el.classList.remove('locked');
    if (c.groupId) {
      el.classList.add('grouped');
      el.dataset.group = c.groupId;
    } else {
      el.classList.remove('grouped');
      delete el.dataset.group;
    }
    if (!c.visible) el.style.display = 'none';
    else            el.style.removeProperty('display');
    // Permisos de vista (solo en runtime — HMIPermissions.canView devuelve
    // true en modo editor). Al no verse ni tampoco recibir clicks, el
    // componente queda 100% inaccesible en modo view para roles no autorizados.
    if (window.HMIPermissions && !window.HMIPermissions.canView(c)) {
      el.style.display = 'none';
      el.classList.add('no-view');
    } else {
      el.classList.remove('no-view');
    }
  }

  /**
   * Actualiza el contenido SVG de un componente sin recrear el wrapper
   * — preferido en runtime para que las animaciones CSS no se reinicien.
   */
  function updateComponent(c) {
    const root = document.getElementById('canvasArea');
    if (!root) return;
    const el = root.querySelector(`[data-id="${c.id}"]`);
    if (!el) return renderComponent(c, root);
    const def = window.HMIRegistry.get(c.type);
    if (!def) return;
    applyTransform(el, c);
    try {
      el.innerHTML = def.render(c, window.HMIContext);
    } catch (e) {
      console.error(`[HMIRenderer/update] '${c.type}':`, e);
    }
  }

  /** Limpia el canvas y pinta todos los componentes visibles. */
  function renderAll(root) {
    if (!root) return;
    root.querySelectorAll('.hc').forEach(e => e.remove());
    const current = window.HMIState._raw.currentPage;
    window.HMIState.listComponents().forEach(c => {
      if (!c.page || c.page === current) renderComponent(c, root);
    });
  }

  /** Quita el DOM de un componente. */
  function removeComponent(id) {
    const el = document.querySelector(`.hc[data-id="${id}"]`);
    if (el) el.remove();
  }

  /**
   * Genera un objeto-componente NUEVO usando los defaults del registry.
   * No usa if/switch: 100% data-driven.
   * @param {string} type  tipo registrado en HMIRegistry
   * @param {Object} pos   { x, y, page }
   * @returns {Object|null}
   */
  function newComponent(type, pos = {}) {
    const def = window.HMIRegistry.get(type);
    if (!def) { console.error(`[HMIRenderer] newComponent: tipo desconocido '${type}'`); return null; }
    const sz   = def.defaultSize || { w: 120, h: 80 };
    const base = {
      id:       'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      type,
      label:    def.label,
      x:        Math.round(pos.x || 50),
      y:        Math.round(pos.y || 50),
      w:        sz.w,
      h:        sz.h,
      rot:      0,
      z:        window.HMIState.listComponents().length + 1,
      page:     pos.page || window.HMIState._raw.currentPage,
      visible:  true,
      locked:   false,
      opacity:  100,
      tag:      (def.label || type).replace(/\s+/g, '_').toUpperCase() + '_' +
                (window.HMIState.listComponents().length + 1),
    };
    // Mezcla con los defaults declarados por el componente
    return Object.assign(base, def.defaults || {});
  }

  window.HMIRenderer = {
    renderAll, renderComponent, updateComponent, removeComponent, newComponent,
  };

  // Reaccionar automáticamente a cambios del estado
  document.addEventListener('DOMContentLoaded', () => {
    if (!window.HMIState) return;
    window.HMIState.on('componentAdded',   c  => renderComponent(c, document.getElementById('canvasArea')));
    window.HMIState.on('componentChanged', c  => updateComponent(c));
    window.HMIState.on('componentRemoved', id => removeComponent(id));
    window.HMIState.on('selectionChanged', () => {
      // Limpiar clases previas
      document.querySelectorAll('.hc.sel').forEach(e => e.classList.remove('sel'));
      document.querySelectorAll('.hc.multi-sel').forEach(e => e.classList.remove('multi-sel'));
      // Marcar todos los seleccionados; el "primary" con `.sel` y el resto con `.multi-sel`
      const primaryId = window.HMIState._raw.selectionId;
      window.HMIState.getSelectionIds().forEach(id => {
        const el = document.querySelector(`.hc[data-id="${id}"]`);
        if (!el) return;
        el.classList.add(id === primaryId ? 'sel' : 'multi-sel');
      });
    });
    window.HMIState.on('pageChanged',        () => renderAll(document.getElementById('canvasArea')));
    window.HMIState.on('componentsReplaced', () => renderAll(document.getElementById('canvasArea')));
    window.HMIState.on('variablesUpdated', () => {
      // Repintar los componentes que dependen de variables
      window.HMIState.listComponents().forEach(c => { if (c.variable) updateComponent(c); });
    });
  });
})();
