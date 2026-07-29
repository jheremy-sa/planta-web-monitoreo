/**
 * pipes.component.js — Tuberías industriales (6 variantes).
 *
 * Todas comparten:
 *   - Bridas metálicas en los extremos
 *   - Línea de fluido animada (stroke-dasharray) cuando variable > 0
 *   - Sentido inverso si variable < 0
 *
 * Variantes:
 *   - pipe_h        : recta horizontal
 *   - pipe_v        : recta vertical
 *   - pipe_elbow    : codo 90°
 *   - pipe_t        : unión en T
 *   - pipe_cross    : unión en cruz
 *   - pipe_reducer  : reducción cónica
 */
(function () {
  'use strict';

  const COMMON = {
    category: 'Tuberías',
    defaults: {
      variable:    '',
      colorBase:   '#9aa2a9',
      colorActive: '#00e676',
    },
    properties: [
      { name: 'variable',    label: 'Variable',     type: 'variable', group: 'General' },
      { name: 'colorBase',   label: 'Color tubo',   type: 'color',    group: 'Estilo' },
      { name: 'colorActive', label: 'Color flujo',  type: 'color',    group: 'Estilo' },
    ],
  };

  /** Devuelve el grupo <defs> común (gradiente metálico + flange). */
  function buildDefs(id, colorBase) {
    return `<defs>
      <linearGradient id="met-${id}" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#4a5157"/><stop offset="40%" stop-color="#e2e8f0"/>
        <stop offset="65%" stop-color="${colorBase}"/><stop offset="100%" stop-color="#1e2225"/>
      </linearGradient>
      <linearGradient id="metV-${id}" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#4a5157"/><stop offset="40%" stop-color="#e2e8f0"/>
        <stop offset="65%" stop-color="${colorBase}"/><stop offset="100%" stop-color="#1e2225"/>
      </linearGradient>
      <linearGradient id="flange-${id}" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#2d3235"/><stop offset="50%" stop-color="#a0aec0"/><stop offset="100%" stop-color="#17191c"/>
      </linearGradient>
    </defs>`;
  }

  /** Wrapper SVG con clases para que el CSS dispare la animación del flujo. */
  function wrap(c, ctx, vbW, vbH, body) {
    const v       = ctx.getValue(c.variable);
    const flow    = v > 0 ? 'flow-on' : (v < 0 ? 'flow-reverse' : 'flow-off');
    return `<svg class="ind-pipe ${flow}" data-id="${c.id}"
                 width="100%" height="100%" viewBox="0 0 ${vbW} ${vbH}" preserveAspectRatio="none"
                 style="pointer-events:none;display:block">${body}</svg>`;
  }

  // ─── Variantes ───────────────────────────────────────────
  HMIRegistry.register(Object.assign({}, COMMON, {
    type: 'pipe_h',
    label: 'Tubería Recta H',
    icon: '═',
    defaultSize: { w: 180, h: 50 },
    render(c, ctx) {
      const d = buildDefs(c.id, c.colorBase);
      return wrap(c, ctx, 200, 100, d + `
        <rect x="0" y="22" width="200" height="56" fill="url(#met-${c.id})" stroke="#222" stroke-width="1.5"/>
        <rect x="0" y="18" width="10" height="64" fill="url(#flange-${c.id})" rx="1"/>
        <rect x="190" y="18" width="10" height="64" fill="url(#flange-${c.id})" rx="1"/>
        <line x1="8" y1="50" x2="192" y2="50" class="fluid-line" stroke-width="6" stroke-linecap="round"
              style="stroke:${c.colorActive}"/>`);
    },
  }));

  HMIRegistry.register(Object.assign({}, COMMON, {
    type: 'pipe_v',
    label: 'Tubería Recta V',
    icon: '║',
    defaultSize: { w: 50, h: 180 },
    render(c, ctx) {
      const d = buildDefs(c.id, c.colorBase);
      return wrap(c, ctx, 100, 200, d + `
        <rect x="22" y="0" width="56" height="200" fill="url(#metV-${c.id})" stroke="#222" stroke-width="1.5"/>
        <rect x="18" y="0" width="64" height="10" fill="url(#flange-${c.id})" rx="1"/>
        <rect x="18" y="190" width="64" height="10" fill="url(#flange-${c.id})" rx="1"/>
        <line x1="50" y1="8" x2="50" y2="192" class="fluid-line" stroke-width="6" stroke-linecap="round"
              style="stroke:${c.colorActive}"/>`);
    },
  }));

  HMIRegistry.register(Object.assign({}, COMMON, {
    type: 'pipe_elbow',
    label: 'Tubería Codo 90°',
    icon: '╗',
    defaultSize: { w: 100, h: 100 },
    render(c, ctx) {
      const d = buildDefs(c.id, c.colorBase);
      return wrap(c, ctx, 100, 100, d + `
        <path d="M 100,22 L 60,22 Q 22,22 22,60 L 22,100 L 78,100 L 78,60 Q 78,78 100,78 Z"
              fill="url(#met-${c.id})" stroke="#222" stroke-width="1.5"/>
        <rect x="90" y="18" width="10" height="64" fill="url(#flange-${c.id})" rx="1"/>
        <rect x="18" y="90" width="64" height="10" fill="url(#flange-${c.id})" rx="1"/>
        <path d="M 92,50 L 50,50 L 50,92" fill="none" class="fluid-line" stroke-width="6" stroke-linecap="round"
              style="stroke:${c.colorActive}"/>`);
    },
  }));

  HMIRegistry.register(Object.assign({}, COMMON, {
    type: 'pipe_t',
    label: 'Tubería en T',
    icon: '╦',
    defaultSize: { w: 160, h: 130 },
    render(c, ctx) {
      const d = buildDefs(c.id, c.colorBase);
      return wrap(c, ctx, 200, 150, d + `
        <rect x="0" y="22" width="200" height="56" fill="url(#met-${c.id})" stroke="#222" stroke-width="1.5"/>
        <rect x="72" y="72" width="56" height="78" fill="url(#metV-${c.id})" stroke="#222" stroke-width="1.5"/>
        <rect x="0" y="18" width="10" height="64" fill="url(#flange-${c.id})" rx="1"/>
        <rect x="190" y="18" width="10" height="64" fill="url(#flange-${c.id})" rx="1"/>
        <rect x="68" y="140" width="64" height="10" fill="url(#flange-${c.id})" rx="1"/>
        <line x1="8" y1="50" x2="192" y2="50" class="fluid-line" stroke-width="6" stroke-linecap="round" style="stroke:${c.colorActive}"/>
        <line x1="100" y1="50" x2="100" y2="142" class="fluid-line" stroke-width="6" stroke-linecap="round" style="stroke:${c.colorActive}"/>`);
    },
  }));

  HMIRegistry.register(Object.assign({}, COMMON, {
    type: 'pipe_cross',
    label: 'Tubería en Cruz',
    icon: '╬',
    defaultSize: { w: 130, h: 130 },
    render(c, ctx) {
      const d = buildDefs(c.id, c.colorBase);
      return wrap(c, ctx, 200, 200, d + `
        <rect x="0" y="72" width="200" height="56" fill="url(#met-${c.id})" stroke="#222" stroke-width="1.5"/>
        <rect x="72" y="0" width="56" height="200" fill="url(#metV-${c.id})" stroke="#222" stroke-width="1.5"/>
        <rect x="0" y="68" width="10" height="64" fill="url(#flange-${c.id})" rx="1"/>
        <rect x="190" y="68" width="10" height="64" fill="url(#flange-${c.id})" rx="1"/>
        <rect x="68" y="0" width="64" height="10" fill="url(#flange-${c.id})" rx="1"/>
        <rect x="68" y="190" width="64" height="10" fill="url(#flange-${c.id})" rx="1"/>
        <line x1="8" y1="100" x2="192" y2="100" class="fluid-line" stroke-width="6" stroke-linecap="round" style="stroke:${c.colorActive}"/>
        <line x1="100" y1="8" x2="100" y2="192" class="fluid-line" stroke-width="6" stroke-linecap="round" style="stroke:${c.colorActive}"/>`);
    },
  }));

  HMIRegistry.register(Object.assign({}, COMMON, {
    type: 'pipe_reducer',
    label: 'Reducción Cónica',
    icon: '◅',
    defaultSize: { w: 120, h: 60 },
    render(c, ctx) {
      const d = buildDefs(c.id, c.colorBase);
      return wrap(c, ctx, 200, 100, d + `
        <polygon points="10,10 190,30 190,70 10,90" fill="url(#met-${c.id})" stroke="#222" stroke-width="1.5"/>
        <rect x="0" y="6" width="10" height="88" fill="url(#flange-${c.id})" rx="1"/>
        <rect x="190" y="26" width="10" height="48" fill="url(#flange-${c.id})" rx="1"/>
        <line x1="8" y1="50" x2="192" y2="50" class="fluid-line" stroke-width="6" stroke-linecap="round"
              style="stroke:${c.colorActive}"/>`);
    },
  }));
})();
