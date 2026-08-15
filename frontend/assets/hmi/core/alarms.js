/**
 * alarms.js — Sistema de alarmas del HMI.
 *
 * Monitorea continuamente todos los componentes del HMI que tengan alarmas
 * habilitadas y, cuando detecta un cambio de severidad, lo registra:
 *
 *   1) En memoria (registro local visible en pantalla).
 *   2) En la BD vía POST a /api/registrar_alarma.php (asíncrono, no bloqueante).
 *
 * Eventos generados:
 *   - alarm_set   → cuando una variable entra en categoría 1/2/3
 *   - alarm_clear → cuando vuelve a 'normal'
 *
 * Cada componente que tenga `alarmsEnabled === true` y al menos un umbral
 * configurado se vigila automáticamente.
 *
 * NOTA: el módulo es delgado a propósito. NO modifica el visual del
 * componente (eso ya lo hace el render() leyendo ctx.severity()); solo se
 * encarga de la trazabilidad de eventos.
 */
(function () {
  'use strict';

  /** Última severidad conocida por componente (para detectar transiciones). */
  const lastSev = new Map();   // componentId → 'normal'|'cat1'|'cat2'|'cat3'

  /** Cola de eventos pendientes para reporte (no se pierden si la red falla). */
  const queue = [];

  /** Configuración inyectada por hmi_avanzado.php */
  let cfg = {
    endpoint:  null,    // ej. 'api/registrar_alarma.php'
    csrfToken: null,
    idProyecto: null,
  };

  /**
   * Inicializa el sistema. Llamar después de que HMIState esté listo.
   */
  function init(options) {
    cfg = Object.assign(cfg, options || {});

    // Evaluar al recibir variables o cambiar componentes
    if (window.HMIState) {
      window.HMIState.on('variablesUpdated', evaluateAll);
      window.HMIState.on('componentChanged', evaluateAll);
      window.HMIState.on('componentRemoved', id => lastSev.delete(id));
    }
    setInterval(flushQueue, 5000);   // intentar reenvío cada 5s
  }

  /**
   * Evalúa la severidad de cada componente con alarmas y registra los cambios.
   */
  function evaluateAll() {
    if (!window.HMIState || !window.HMIContext) return;
    window.HMIState.listComponents().forEach(c => {
      if (!c.alarmsEnabled || !c.variable) return;
      const val = window.HMIContext.getValue(c.variable);
      const sev = window.HMIContext.severity(val, c);
      const prev = lastSev.get(c.id) || 'normal';
      if (sev === prev) return;          // sin cambio

      // Generar el evento
      const level = window.HMIContext.severityLevel(val, c);
      const msg   = window.HMIContext.alarmMessage(sev, level, c.variable);
      const evento = {
        id_proyecto:     cfg.idProyecto,
        nombre_variable: c.variable,
        valor_registrado: val,
        categoria:       sev === 'cat3' ? 3 : sev === 'cat2' ? 2 : sev === 'cat1' ? 1 : 0,
        tipo_evento:     (sev === 'normal') ? 'alarm_clear' : 'alarm_set',
        nivel_disparado: level,
        mensaje:         msg,
        timestamp_cli:   new Date().toISOString(),
      };
      enqueue(evento);
      lastSev.set(c.id, sev);
    });
  }

  function enqueue(evento) {
    queue.push(evento);
    // Notificación visual breve
    if (evento.tipo_evento === 'alarm_set' && window.HMIAlarms.onTrigger) {
      try { window.HMIAlarms.onTrigger(evento); } catch (e) { /* */ }
    }
    flushQueue();
  }

  async function flushQueue() {
    if (!cfg.endpoint || !queue.length) return;
    const batch = queue.splice(0, queue.length);
    try {
      await fetch(cfg.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csrf_token: cfg.csrfToken, eventos: batch }),
      });
    } catch (e) {
      // re-encolar para retry
      queue.unshift(...batch);
    }
  }

  window.HMIAlarms = { init, evaluateAll, onTrigger: null };
})();
