/**
 * component-registry.js — Registro centralizado de componentes HMI.
 *
 * Cada archivo *.component.js se autoregistra llamando:
 *
 *   HMIRegistry.register({
 *     type, label, icon, category,
 *     defaultSize: {w, h},
 *     defaults: { ... },     // valores iniciales de cada propiedad
 *     properties: [ ... ],   // definición declarativa para el panel
 *     render(component, ctx) { return 'HTML/SVG'; }
 *   });
 *
 * El sistema base (paleta, drag&drop, panel de propiedades, renderizado) lee
 * el registry para descubrir componentes automáticamente. Nunca hay que tocar
 * el editor principal para agregar un componente: basta colocar un archivo
 * `.component.js` en `assets/hmi/components/<categoria>/` y refrescar.
 *
 * Funciones expuestas por window.HMIRegistry:
 *   register(definition)            registra una definición de componente
 *   get(type)                       devuelve la definición o null
 *   all()                           devuelve array con todas las definiciones
 *   byCategory()                    devuelve objeto { categoria: [defs, ...] }
 *   on(event, handler)              listener para 'register'/'unregister'
 *   validate(definition)            true si la definición es válida
 */
(function () {
  'use strict';

  const components = new Map();
  const listeners  = { register: [], unregister: [] };

  /** Campos OBLIGATORIOS de una definición de componente. */
  const REQUIRED_FIELDS = ['type', 'label', 'category', 'render'];

  /**
   * Verifica que una definición de componente tenga los campos mínimos
   * y que `render` sea invocable.
   * @param {Object} def
   * @returns {{ok:boolean, msg?:string}}
   */
  function validate(def) {
    if (!def || typeof def !== 'object') {
      return { ok: false, msg: 'La definición no es un objeto' };
    }
    for (const f of REQUIRED_FIELDS) {
      if (def[f] === undefined || def[f] === null || def[f] === '') {
        return { ok: false, msg: `Campo obligatorio ausente: ${f}` };
      }
    }
    if (typeof def.render !== 'function') {
      return { ok: false, msg: 'render() debe ser una función' };
    }
    if (typeof def.type !== 'string' || !/^[a-z][a-z0-9_-]*$/i.test(def.type)) {
      return { ok: false, msg: `type inválido: ${def.type} (use letras/dígitos/_/-)` };
    }
    return { ok: true };
  }

  /**
   * Registra una definición de componente.
   * @param {Object} def
   * @returns {boolean} true si se registró correctamente
   */
  function register(def) {
    const v = validate(def);
    if (!v.ok) {
      console.error('[HMIRegistry] Definición inválida:', v.msg, def);
      return false;
    }
    if (components.has(def.type)) {
      console.warn(`[HMIRegistry] Componente duplicado: '${def.type}'. Se mantiene el primero.`);
      return false;
    }
    // Defaults sensatos si el componente los omite
    const final = Object.assign({
      icon:        '⬛',
      defaultSize: { w: 120, h: 80 },
      defaults:    {},
      properties:  [],
    }, def);
    components.set(def.type, final);
    listeners.register.forEach(h => { try { h(final); } catch (e) { console.error(e); } });
    return true;
  }

  /** Recupera una definición por tipo. */
  function get(type) {
    return components.get(type) || null;
  }

  /** Lista plana de todas las definiciones registradas. */
  function all() {
    return Array.from(components.values());
  }

  /** Agrupa las definiciones por categoría. */
  function byCategory() {
    const out = {};
    components.forEach(def => {
      const cat = def.category || 'General';
      (out[cat] = out[cat] || []).push(def);
    });
    return out;
  }

  /** Listeners de eventos del registry. */
  function on(event, handler) {
    if (listeners[event]) listeners[event].push(handler);
  }

  /** Diagnóstico: imprime el resumen del registry en consola. */
  function dump() {
    const cats = byCategory();
    console.group('[HMIRegistry] Componentes registrados');
    Object.keys(cats).sort().forEach(cat => {
      console.log(`  ${cat}: ${cats[cat].map(c => c.type).join(', ')}`);
    });
    console.log(`  Total: ${components.size}`);
    console.groupEnd();
  }

  window.HMIRegistry = { register, get, all, byCategory, on, validate, dump };
})();
