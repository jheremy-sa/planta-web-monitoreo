/**
 * commands.js — Comandos avanzados del editor (Entrega C1).
 *
 * Provee la implementación de:
 *   - Copiar / Pegar / Duplicar (Ctrl+C, Ctrl+V, Ctrl+D)
 *   - Z-order (Al frente / Adelante / Atrás / Al fondo)
 *   - Alineación (Izq / Centro-H / Der / Arriba / Centro-V / Abajo)
 *   - Toggle Visible / Bloqueado sobre la selección
 *
 * Se expone como `window.HMIActions`. Los botones de la toolbar y los
 * atajos de teclado llaman a estos comandos. Todos:
 *   - Empujan al undo al inicio de la operación
 *   - Operan sobre la selección múltiple (o el "primary" si es single)
 *   - Actualizan el renderer al terminar
 */
(function () {
  'use strict';

  const PASTE_OFFSET = 20;   // px de desplazamiento por defecto al pegar

  // ══════════════════════════════════════════════════════════════════════
  // Helpers
  // ══════════════════════════════════════════════════════════════════════
  function getSelectedComponents() {
    const arr = window.HMIState.getSelectedAll();
    if (arr.length > 0) return arr;
    const s = window.HMIState.getSelected();
    return s ? [s] : [];
  }
  function refreshRenderer() {
    // El renderer.js escucha componentChanged para actualizaciones
    // incrementales. Para operaciones grandes (paste múltiple, delete
    // múltiple) hacemos un renderAll suave via canvas.
    if (window.HMIState._raw) window.HMIState._raw.dirty = true;
    window.HMIState.emit('componentsReplaced', window.HMIState._raw.components);
  }
  function genId() {
    // ID único derivado de timestamp + random
    return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }
  function deepClone(obj) {
    // structuredClone si está, fallback a JSON
    if (typeof structuredClone === 'function') {
      try { return structuredClone(obj); } catch (e) { /* fallback */ }
    }
    return JSON.parse(JSON.stringify(obj));
  }

  // ══════════════════════════════════════════════════════════════════════
  // COPIAR / PEGAR / DUPLICAR
  // ══════════════════════════════════════════════════════════════════════
  function copy() {
    const sel = getSelectedComponents();
    if (!sel.length) return { count: 0 };
    window.HMIState._raw.clipboard = sel.map(c => {
      // Limpiar campos runtime (buffers de trend/eventlog, filtros)
      const clone = deepClone(c);
      delete clone._buffers;
      delete clone._events;
      delete clone._lastVals;
      delete clone._filter;
      delete clone._hidden;
      return clone;
    });
    return { count: sel.length };
  }

  function paste(offset = PASTE_OFFSET) {
    const clip = window.HMIState._raw.clipboard || [];
    if (!clip.length) return { count: 0 };
    window.HMIState.pushUndo();

    // Los componentes pegados heredan la página ACTUAL, no la del origen
    const currentPage = window.HMIState._raw.currentPage;
    const newIds = [];
    const maxZ = Math.max(0, ...window.HMIState.listComponents().map(c => +c.z || 0));

    clip.forEach((tpl, idx) => {
      const nuevo = deepClone(tpl);
      nuevo.id = genId();
      nuevo.page = currentPage;
      nuevo.x = (nuevo.x || 0) + offset;
      nuevo.y = (nuevo.y || 0) + offset;
      nuevo.z = maxZ + idx + 1;
      window.HMIState.addComponent(nuevo);
      newIds.push(nuevo.id);
    });

    // Seleccionar los nuevos (el primero es el primary)
    window.HMIState.setSelection(newIds);
    refreshRenderer();
    return { count: newIds.length };
  }

  function duplicate() {
    // Duplicar = copiar + pegar sin tocar el clipboard "real"
    const sel = getSelectedComponents();
    if (!sel.length) return { count: 0 };
    // Guardar clipboard actual para restaurarlo después
    const prevClip = window.HMIState._raw.clipboard || [];
    const dummyClip = sel.map(c => {
      const clone = deepClone(c);
      delete clone._buffers; delete clone._events;
      delete clone._lastVals; delete clone._filter; delete clone._hidden;
      return clone;
    });
    window.HMIState._raw.clipboard = dummyClip;
    const res = paste();
    window.HMIState._raw.clipboard = prevClip;   // restaurar
    return res;
  }

  // ══════════════════════════════════════════════════════════════════════
  // Z-ORDER
  // ══════════════════════════════════════════════════════════════════════
  function bringToFront() {
    const sel = getSelectedComponents();
    if (!sel.length) return;
    window.HMIState.pushUndo();
    const maxZ = Math.max(0, ...window.HMIState.listComponents().map(c => +c.z || 0));
    sel.forEach((c, i) => window.HMIState.updateComponent(c.id, 'z', maxZ + 1 + i));
    refreshRenderer();
  }
  function sendToBack() {
    const sel = getSelectedComponents();
    if (!sel.length) return;
    window.HMIState.pushUndo();
    const minZ = Math.min(1, ...window.HMIState.listComponents().map(c => +c.z || 0));
    sel.forEach((c, i) => window.HMIState.updateComponent(c.id, 'z', minZ - 1 - i));
    refreshRenderer();
  }
  function bringForward() {
    const sel = getSelectedComponents();
    if (!sel.length) return;
    window.HMIState.pushUndo();
    sel.forEach(c => window.HMIState.updateComponent(c.id, 'z', (+c.z || 1) + 1));
    refreshRenderer();
  }
  function sendBackward() {
    const sel = getSelectedComponents();
    if (!sel.length) return;
    window.HMIState.pushUndo();
    sel.forEach(c => window.HMIState.updateComponent(c.id, 'z', (+c.z || 1) - 1));
    refreshRenderer();
  }

  // ══════════════════════════════════════════════════════════════════════
  // ALINEACIÓN — requiere ≥2 seleccionados
  // ══════════════════════════════════════════════════════════════════════
  function align(edge) {
    const sel = getSelectedComponents();
    if (sel.length < 2) return;
    window.HMIState.pushUndo();

    // Bounding box del grupo
    const xs = sel.map(c => +c.x || 0);
    const ys = sel.map(c => +c.y || 0);
    const xE = sel.map(c => (+c.x || 0) + (+c.w || 0));
    const yE = sel.map(c => (+c.y || 0) + (+c.h || 0));

    const minX = Math.min(...xs), maxX = Math.max(...xE);
    const minY = Math.min(...ys), maxY = Math.max(...yE);
    const cX   = (minX + maxX) / 2;
    const cY   = (minY + maxY) / 2;

    sel.forEach(c => {
      switch (edge) {
        case 'left':   window.HMIState.updateComponent(c.id, 'x', minX); break;
        case 'right':  window.HMIState.updateComponent(c.id, 'x', maxX - (+c.w || 0)); break;
        case 'hcenter':window.HMIState.updateComponent(c.id, 'x', Math.round(cX - (+c.w || 0) / 2)); break;
        case 'top':    window.HMIState.updateComponent(c.id, 'y', minY); break;
        case 'bottom': window.HMIState.updateComponent(c.id, 'y', maxY - (+c.h || 0)); break;
        case 'vcenter':window.HMIState.updateComponent(c.id, 'y', Math.round(cY - (+c.h || 0) / 2)); break;
      }
    });
    refreshRenderer();
  }

  // ══════════════════════════════════════════════════════════════════════
  // VISIBILIDAD / BLOQUEO
  // ══════════════════════════════════════════════════════════════════════
  function toggleVisible() {
    const sel = getSelectedComponents();
    if (!sel.length) return;
    window.HMIState.pushUndo();
    // Si mixto, todos pasan a visible=false; si todos visibles, pasan a false; si todos ocultos, a true.
    const anyVisible = sel.some(c => c.visible !== false);
    const newVal = !anyVisible;
    sel.forEach(c => window.HMIState.updateComponent(c.id, 'visible', newVal));
    refreshRenderer();
  }
  function toggleLocked() {
    const sel = getSelectedComponents();
    if (!sel.length) return;
    window.HMIState.pushUndo();
    const anyUnlocked = sel.some(c => !c.locked);
    const newVal = anyUnlocked;
    sel.forEach(c => window.HMIState.updateComponent(c.id, 'locked', newVal));
    refreshRenderer();
  }

  // ══════════════════════════════════════════════════════════════════════
  // DELETE — sobrecargado para multi
  // ══════════════════════════════════════════════════════════════════════
  function deleteSelected() {
    const sel = getSelectedComponents();
    if (!sel.length) return;
    window.HMIState.pushUndo();
    sel.forEach(c => window.HMIState.removeComponent(c.id));
    refreshRenderer();
  }

  // ══════════════════════════════════════════════════════════════════════
  // AGRUPACIÓN — Ctrl+G / Ctrl+Shift+G
  //
  // Modelo: cada componente tiene una propiedad opcional `groupId`.
  // Todos los que compartan groupId forman un grupo. Al hacer click sobre
  // uno cualquiera del grupo (sin Shift), dragdrop.js expande la selección
  // para incluir a todos sus hermanos de grupo — así funciona como una
  // sola unidad para mover, copiar o eliminar.
  //
  // Los grupos NO son entidades separadas: son solo una etiqueta compartida.
  // Esto los mantiene compatibles con serialize/deserialize sin migración.
  // ══════════════════════════════════════════════════════════════════════
  function genGroupId() {
    return 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  }

  function group() {
    const sel = getSelectedComponents();
    if (sel.length < 2) return { count: 0, msg: 'Selecciona 2 o más componentes' };
    window.HMIState.pushUndo();
    const gid = genGroupId();
    sel.forEach(c => window.HMIState.updateComponent(c.id, 'groupId', gid));
    refreshRenderer();
    return { count: sel.length, groupId: gid };
  }

  function ungroup() {
    // Desagrupa TODOS los grupos representados en la selección
    const sel = getSelectedComponents();
    if (!sel.length) return { count: 0 };
    const gids = new Set(sel.map(c => c.groupId).filter(Boolean));
    if (!gids.size) return { count: 0, msg: 'Nada agrupado' };

    window.HMIState.pushUndo();
    // Quitar groupId de todos los miembros de esos grupos
    let count = 0;
    window.HMIState.listComponents().forEach(c => {
      if (c.groupId && gids.has(c.groupId)) {
        window.HMIState.updateComponent(c.id, 'groupId', null);
        count++;
      }
    });
    refreshRenderer();
    return { count, groups: gids.size };
  }

  /**
   * Dado un array de componentes seleccionados, devuelve TODOS los
   * componentes de sus grupos. Usado por dragdrop al hacer click en
   * uno del grupo para expandir la selección.
   */
  function expandGroups(components) {
    const gids = new Set(components.map(c => c.groupId).filter(Boolean));
    if (!gids.size) return components;
    const all = window.HMIState.listComponents();
    const set = new Set(components.map(c => c.id));
    all.forEach(c => {
      if (c.groupId && gids.has(c.groupId)) set.add(c.id);
    });
    return Array.from(set).map(id => window.HMIState.getComponent(id)).filter(Boolean);
  }

  window.HMIActions = {
    // Clipboard
    copy, paste, duplicate,
    // Z-order
    bringToFront, sendToBack, bringForward, sendBackward,
    // Align
    align,
    alignLeft:    () => align('left'),
    alignRight:   () => align('right'),
    alignHCenter: () => align('hcenter'),
    alignTop:     () => align('top'),
    alignBottom:  () => align('bottom'),
    alignVCenter: () => align('vcenter'),
    // Toggles
    toggleVisible, toggleLocked,
    // Delete
    deleteSelected,
    // Grupos
    group, ungroup, expandGroups,
  };
})();
