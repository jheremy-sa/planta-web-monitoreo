/**
 * context.js — Contexto reutilizable entre componentes y el runtime SCADA.
 *
 * Cada vez que un componente se renderiza, recibe una instancia de HMIContext
 * a través de su método render(component, ctx). El contexto le permite:
 *
 *   ctx.getValue(name)       valor numérico actual de la variable (0 si no existe)
 *   ctx.getVariable(name)    objeto de variable completo (o null)
 *   ctx.variables()          lista de todas las variables del proyecto
 *   ctx.write(name, value)   solicita escritura (delegada al backend)
 *   ctx.percent(value, c)    porcentaje (0..1) según c.min/c.max
 *   ctx.severity(value, c)   'normal' | 'warn' | 'alarm' según los umbrales
 *   ctx.formatValue(value, c)  devuelve string formateado con unidad
 *
 * El contexto es delgado: NO mantiene estado propio; consulta el StateManager
 * (asignado mediante init()) cada vez que se invoca un getter.
 */
(function () {
  'use strict';

  let _state = null;          // referencia al state-manager
  let _writeHandler = null;   // callback para escrituras (la asigna el editor)

  /**
   * Inicializa el contexto enlazándolo con el state-manager del editor y
   * el handler de escritura.
   * @param {Object} stateManager      módulo expuesto por window.HMIState
   * @param {Function} writeHandler    fn(name, value) → Promise<bool>
   */
  function init(stateManager, writeHandler) {
    _state = stateManager;
    _writeHandler = writeHandler || null;
  }

  /** Devuelve el valor numérico actual de una variable, 0 si no existe. */
  function getValue(name) {
    if (!_state || !name) return 0;
    const v = _state.getVar(name);
    return v ? Number(v.valor_actual ?? v.valor ?? 0) : 0;
  }

  /** Devuelve el objeto completo de la variable, o null. */
  function getVariable(name) {
    return _state ? _state.getVar(name) : null;
  }

  /** Lista de variables del proyecto (array). */
  function variables() {
    return _state ? _state.allVars() : [];
  }

  /**
   * Solicita escribir un valor en una variable (setpoint / actuador). Si el
   * editor no asignó un writeHandler, simplemente loguea.
   *
   * Firma extendida (retrocompat):
   *   write(name, value)               → escribe sin chequeo de permisos
   *   write(name, value, componentId)  → chequea actionRoles del componente
   *
   * @returns {Promise<boolean>}
   */
  async function write(name, value, componentId) {
    // Chequeo de permisos por componente (solo si viene id)
    if (componentId && window.HMIPermissions && !window.HMIPermissions.canAct(componentId)) {
      console.warn(`[HMIContext] escritura bloqueada por permisos en '${name}' (componente ${componentId})`);
      if (window.HMINotify && typeof window.HMINotify.warn === 'function') {
        window.HMINotify.warn('No tienes permiso para actuar sobre este control');
      }
      return false;
    }
    if (typeof _writeHandler === 'function') {
      try { return await _writeHandler(name, value); }
      catch (e) { console.warn('[HMIContext] write falló:', e); return false; }
    }
    console.log(`[HMIContext] write('${name}', ${value})`);
    return false;
  }

  /**
   * Devuelve el porcentaje (0..1) del valor según c.min y c.max.
   * @param {number} value
   * @param {Object} c   componente con min/max
   */
  function percent(value, c) {
    const mn = +c.min || 0, mx = +c.max || 100;
    const span = (mx - mn) || 1;
    return Math.max(0, Math.min(1, (value - mn) / span));
  }

  /**
   * Devuelve el nivel de severidad del valor según los umbrales del componente.
   *
   * Niveles:
   *   'normal'  → variable dentro del rango operativo (entre opLo y opHi)
   *   'cat1'    → CATEGORÍA 1: Advertencia operativa (entre opHi y hi, o entre lo y opLo)
   *   'cat2'    → CATEGORÍA 2: Advertencia importante (entre hi y hh, o entre ll y lo)
   *   'cat3'    → CATEGORÍA 3: Alarma crítica de proceso (≥ hh o ≤ ll)
   *
   * Si las alarmas están desactivadas (alarmsEnabled === false) siempre 'normal'.
   * Compatibilidad: si el componente solo trae alarmsOff (formato viejo),
   * se respeta para no romper HMIs antiguos.
   */
  function severity(value, c) {
    // Activación/desactivación
    const enabled = (c.alarmsEnabled === undefined)
        ? (c.alarmsOff !== true)        // legacy: si NO está desactivado, está activo
        : (c.alarmsEnabled === true);
    if (!enabled) return 'normal';

    // Critical: HH/LL
    if (value <= (c.ll ?? -Infinity)) return 'cat3';
    if (value >= (c.hh ??  Infinity)) return 'cat3';
    // Importante: HI/LO (más allá del operativo)
    if (value <= (c.lo ?? -Infinity)) return 'cat2';
    if (value >= (c.hi ??  Infinity)) return 'cat2';
    // Operativa: fuera del rango óptimo
    if (value <= (c.opLo ?? -Infinity)) return 'cat1';
    if (value >= (c.opHi ??  Infinity)) return 'cat1';
    return 'normal';
  }

  /**
   * Devuelve qué nivel concreto disparó la severidad (para el log de alarmas):
   * 'hh', 'hi', 'opHi', 'opLo', 'lo', 'll' o 'normal'.
   */
  function severityLevel(value, c) {
    if (value >= (c.hh   ??  Infinity)) return 'hh';
    if (value <= (c.ll   ?? -Infinity)) return 'll';
    if (value >= (c.hi   ??  Infinity)) return 'hi';
    if (value <= (c.lo   ?? -Infinity)) return 'lo';
    if (value >= (c.opHi ??  Infinity)) return 'opHi';
    if (value <= (c.opLo ?? -Infinity)) return 'opLo';
    return 'normal';
  }

  /**
   * Devuelve el mensaje profesional asociado a una severidad y un nivel.
   * @param {string} sev    'normal' | 'cat1' | 'cat2' | 'cat3'
   * @param {string} nivel  'hh' | 'hi' | 'opHi' | 'opLo' | 'lo' | 'll'
   * @param {string} varName Nombre de la variable afectada
   */
  function alarmMessage(sev, nivel, varName) {
    const v = varName || 'la variable';
    if (sev === 'cat1') {
      return 'Advertencia Operativa: ' + v + ' está fuera del rango óptimo recomendado. ' +
             'Se recomienda revisar el comportamiento del proceso.';
    }
    if (sev === 'cat2') {
      return 'Advertencia Importante: ' + v + ' se aproxima a un límite crítico de operación. ' +
             'Se recomienda tomar acciones correctivas de forma preventiva.';
    }
    if (sev === 'cat3') {
      if (nivel === 'hh') {
        return 'ALARMA CRÍTICA DE PROCESO: ' + v + ' ha superado el límite máximo de seguridad establecido. ' +
               'Existe riesgo de afectación al proceso, al equipo o a la operación. ' +
               'Se requiere intervención inmediata del operador.';
      }
      return 'ALARMA CRÍTICA DE PROCESO: ' + v + ' ha descendido por debajo del límite mínimo de seguridad establecido. ' +
             'Existe riesgo de pérdida de estabilidad operativa o daño potencial al proceso. ' +
             'Se requiere intervención inmediata del operador.';
    }
    return '';
  }

  /** Devuelve un string con el valor formateado y la unidad. */
  function formatValue(value, c) {
    if (typeof value !== 'number' || isNaN(value)) value = 0;
    const dec = (c.decimals !== undefined ? c.decimals : 1);
    return value.toFixed(dec) + (c.unit ? ' ' + c.unit : '');
  }

  /** Devuelve un color CSS según severidad. */
  function colorForSeverity(sev, c) {
    if (sev === 'cat3') return c.colorAlarm || '#d94d4d';
    if (sev === 'cat2') return c.colorWarn2 || '#f87171';
    if (sev === 'cat1') return c.colorWarn  || '#f0b84d';
    // retrocompatibilidad con los nombres antiguos
    if (sev === 'alarm') return c.colorAlarm || '#d94d4d';
    if (sev === 'warn')  return c.colorWarn  || '#f0b84d';
    return c.colorNormal || c.color || '#31a9c9';
  }

  /**
   * Mini-utilidad de escaping de HTML para uso dentro de los render() de
   * cada componente — evita tener que importarlo en cada archivo.
   */
  function esc(s) {
    return String(s ?? '').replace(/[&<>"]/g, m => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'
    }[m]));
  }

  window.HMIContext = {
    init, getValue, getVariable, variables, write,
    percent, severity, severityLevel, alarmMessage, formatValue, colorForSeverity, esc,
  };
})();
