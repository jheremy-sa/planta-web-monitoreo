/**
 * state-manager.js — Estado central del editor HMI.
 *
 * Mantiene la lista de componentes, las páginas, las variables del proyecto y
 * el historial undo/redo. Expone eventos para que renderer/canvas/panel se
 * suscriban y reaccionen a cambios sin acoplarse entre sí.
 *
 * Eventos disparados:
 *   'componentAdded'    nuevo componente agregado            (component)
 *   'componentChanged'  cambió alguna propiedad              (component, prop)
 *   'componentRemoved'  componente eliminado                 (componentId)
 *   'selectionChanged'  cambió la selección                  (componentId | null)
 *   'pageChanged'       cambió la página activa              (pageId)
 *   'variablesUpdated'  llegaron variables actualizadas      (variables)
 *
 * Diseño:
 *   - El estado es DATA-PURE: cualquier serialización JSON es válida para
 *     restaurar el editor (snapshots, persistencia, undo).
 *   - Las páginas son simples ids (string); el editor las maneja por filtro
 *     `component.page === currentPage`.
 *   - Variables se almacenan por nombre (Map) para lookup O(1).
 */
(function () {
  'use strict';

  const state = {
    components:   [],          // array de objetos-componente
    pages:        ['p1'],      // ids de páginas
    currentPage:  'p1',
    selectionId:  null,        // "primary" seleccionado (retrocompat, singular)
    selection:    new Set(),   // Set<id> — TODOS los seleccionados (multi-select)
    vars:         new Map(),   // Map<nombre_variable, objeto_variable>
    undo:         [],
    redo:         [],
    dirty:        false,
    config:       {},          // configuración global del HMI (rejilla, snap, etc.)
    clipboard:    [],          // Componentes copiados (Ctrl+C) para pegar (Ctrl+V)
  };

  const listeners = {};

  /** Suscribe un handler a un evento. */
  function on(event, handler) {
    (listeners[event] = listeners[event] || []).push(handler);
  }

  /** Dispara un evento a todos los suscriptores. */
  function emit(event, ...args) {
    (listeners[event] || []).forEach(h => {
      try { h(...args); } catch (e) { console.error(`[HMIState/${event}]`, e); }
    });
  }

  // ─── Componentes ──────────────────────────────────────────
  function addComponent(c) {
    state.components.push(c);
    state.dirty = true;
    emit('componentAdded', c);
    return c;
  }
  function getComponent(id) {
    return state.components.find(c => c.id === id) || null;
  }
  function listComponents(pageId = null) {
    if (!pageId) return state.components.slice();
    return state.components.filter(c => c.page === pageId);
  }
  function updateComponent(id, prop, value) {
    const c = getComponent(id);
    if (!c) return null;
    c[prop] = value;
    state.dirty = true;
    emit('componentChanged', c, prop);
    return c;
  }
  function removeComponent(id) {
    const i = state.components.findIndex(c => c.id === id);
    if (i < 0) return false;
    state.components.splice(i, 1);
    if (state.selection.has(id)) state.selection.delete(id);
    if (state.selectionId === id) {
      state.selectionId = state.selection.values().next().value || null;
      emit('selectionChanged', state.selectionId);
    }
    state.dirty = true;
    emit('componentRemoved', id);
    return true;
  }

  // ─── Selección ────────────────────────────────────────────
  //
  // API dual para minimizar breakage:
  //   setSelection(id)         → selección única (comportamiento clásico)
  //   setSelection(null)       → limpiar
  //   setSelection([id1,id2])  → multi-selección (primary = primer id)
  //   addToSelection(id)       → agregar/togglear un id (Shift+click)
  //
  //   getSelected()            → devuelve el component "primary" (singular)
  //   getSelectedAll()         → devuelve array de components seleccionados
  //   getSelectionIds()        → devuelve array de ids seleccionados
  //
  function setSelection(idOrArray) {
    state.selection.clear();
    if (idOrArray == null) {
      state.selectionId = null;
    } else if (Array.isArray(idOrArray)) {
      idOrArray.forEach(id => id && state.selection.add(id));
      state.selectionId = idOrArray[0] || null;
    } else {
      state.selection.add(idOrArray);
      state.selectionId = idOrArray;
    }
    emit('selectionChanged', state.selectionId);
  }
  function addToSelection(id) {
    if (!id) return;
    if (state.selection.has(id)) {
      state.selection.delete(id);
      // Si era el primary, promover otro
      if (state.selectionId === id) {
        state.selectionId = state.selection.values().next().value || null;
      }
    } else {
      state.selection.add(id);
      // Primer add sin primary previo → toma el primary
      if (!state.selectionId) state.selectionId = id;
    }
    emit('selectionChanged', state.selectionId);
  }
  function getSelected() {
    return state.selectionId ? getComponent(state.selectionId) : null;
  }
  function getSelectedAll() {
    return Array.from(state.selection)
      .map(id => getComponent(id))
      .filter(Boolean);
  }
  function getSelectionIds() {
    return Array.from(state.selection);
  }

  // ─── Páginas ──────────────────────────────────────────────
  function addPage(id) {
    if (!state.pages.includes(id)) state.pages.push(id);
    state.dirty = true;
  }
  function removePage(id) {
    // BUGFIX: las páginas pueden ser strings ('p1') u objetos ({id:'p2', name:'...'}).
    // El filter con equal estricto (p !== id) falla para objetos porque
    // comparar {id:'p2',...} !== 'p2' siempre es true, resultando en que
    // la página objeto nunca se elimina aunque el UI diga "eliminada".
    // Solución: normalizar el ID de cada elemento antes de comparar.
    const pageId = p => (typeof p === 'object' && p !== null) ? p.id : p;
    state.pages = state.pages.filter(p => pageId(p) !== id);
    state.components = state.components.filter(c => c.page !== id);
    if (state.currentPage === id) {
      const first = state.pages[0];
      setCurrentPage(first ? pageId(first) : null);
    }
    state.dirty = true;
    emit('componentsReplaced');       // refresca las tabs de páginas y el canvas
  }
  function setCurrentPage(id) {
    state.currentPage = id;
    emit('pageChanged', id);
  }

  // ─── Variables ────────────────────────────────────────────
  function setVars(arr) {
    state.vars.clear();
    (arr || []).forEach(v => state.vars.set(v.nombre_variable || v.nombre, v));
    emit('variablesUpdated', arr);
  }
  function updateVar(v) {
    if (!v) return;
    state.vars.set(v.nombre_variable || v.nombre, v);
    emit('variablesUpdated', [v]);
  }
  function getVar(name) {
    return state.vars.get(name) || null;
  }
  function allVars() {
    return Array.from(state.vars.values());
  }

  // ─── Undo / Redo ──────────────────────────────────────────
  function pushUndo() {
    state.undo.push(JSON.stringify(state.components));
    if (state.undo.length > 50) state.undo.shift();
    state.redo.length = 0;
  }
  function undo() {
    if (!state.undo.length) return false;
    state.redo.push(JSON.stringify(state.components));
    state.components = JSON.parse(state.undo.pop());
    state.dirty = true;
    emit('componentsReplaced', state.components);
    return true;
  }
  function redo() {
    if (!state.redo.length) return false;
    state.undo.push(JSON.stringify(state.components));
    state.components = JSON.parse(state.redo.pop());
    state.dirty = true;
    emit('componentsReplaced', state.components);
    return true;
  }

  // ─── Serialización ────────────────────────────────────────
  function serialize() {
    return {
      version:     2,
      components:  state.components,
      pages:       state.pages,
      currentPage: state.currentPage,
      config:      state.config,
    };
  }
  function deserialize(data) {
    if (!data) return;
    // Si el layout es de una versión anterior, migrarlo al vuelo
    if (window.HMILegacyMigration && (!data.version || data.version < 2)) {
      data = window.HMILegacyMigration.migrateLayout(data) || data;
    }
    state.components  = data.components  || [];
    state.pages       = data.pages       || ['p1'];
    state.currentPage = data.currentPage || state.pages[0];
    state.config      = data.config      || {};
    state.undo.length = 0;
    state.redo.length = 0;
    state.dirty = false;
    emit('componentsReplaced', state.components);
    emit('pageChanged', state.currentPage);
  }

  /** Estado interno (lectura) — útil para debug. */
  function snapshot() {
    return {
      componentes: state.components.length,
      pages:       state.pages.length,
      selection:   state.selectionId,
      currentPage: state.currentPage,
      dirty:       state.dirty,
      vars:        state.vars.size,
    };
  }

  window.HMIState = {
    on, emit,
    addComponent, getComponent, listComponents, updateComponent, removeComponent,
    setSelection, addToSelection, getSelected, getSelectedAll, getSelectionIds,
    addPage, removePage, setCurrentPage,
    setVars, updateVar, getVar, allVars,
    pushUndo, undo, redo,
    serialize, deserialize, snapshot,
    // acceso de bajo nivel (renderer/canvas lo usan)
    _raw: state,
  };
})();
