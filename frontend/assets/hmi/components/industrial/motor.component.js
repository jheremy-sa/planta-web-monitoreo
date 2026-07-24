/**
 * motor.component.js — Motor eléctrico industrial.
 *
 * Reacciona a la variable asignada:
 *   - variable > 0  → motor en marcha (eje girando, LED verde, RPM en pantalla)
 *   - variable == 0 → motor detenido
 */
HMIRegistry.register({
  type:        'motor',
  label:       'Motor Eléctrico',
  icon:        '⚙',
  category:    'Motores',
  defaultSize: { w: 200, h: 110 },

  defaults: {
    variable:    '',
    min:         0,
    max:         3600,
    unit:        'RPM',
    colorBase:   '#528c9e',
    colorActive: '#22c55e',
    showRPM:     true,
  },

  properties: [
    { name: 'variable',    label: 'Variable',     type: 'variable', group: 'General' },
    { name: 'unit',        label: 'Unidad',       type: 'text',     group: 'General' },
    { name: 'max',         label: 'Máx. RPM',     type: 'number',   group: 'General' },
    { name: 'colorBase',   label: 'Color base',   type: 'color',    group: 'Estilo' },
    { name: 'colorActive', label: 'Color activo', type: 'color',    group: 'Estilo' },
    { name: 'showRPM',     label: 'Mostrar RPM',  type: 'checkbox', group: 'Estilo' },
  ],

  render(c, ctx) {
    const v   = ctx.getValue(c.variable);
    const on  = v > 0;
    const led = on ? c.colorActive : '#661111';
    const cls = `ind-motor${on ? ' run' : ''}`;
    return `<svg class="${cls}" data-id="${c.id}" width="100%" height="100%"
                 viewBox="0 0 360 200" preserveAspectRatio="none"
                 style="pointer-events:none;display:block">
      <defs>
        <linearGradient id="mtb-${c.id}" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#345a66"/><stop offset="40%" stop-color="${c.colorBase}"/>
          <stop offset="60%" stop-color="${c.colorBase}"/><stop offset="100%" stop-color="#2a4a54"/>
        </linearGradient>
      </defs>
      <rect class="motor-feet" x="20" y="170" width="200" height="20" fill="#2d3748"/>
      <rect x="20" y="30" width="60" height="140" rx="15" fill="url(#mtb-${c.id})" stroke="#1a202c"/>
      <rect x="80" y="30" width="180" height="140" fill="url(#mtb-${c.id})"/>
      <g opacity="0.55">
        ${Array.from({length:10},(_,i)=>`<rect x="80" y="${30+i*14+2}" width="180" height="6" fill="#1a202c"/>`).join('')}
      </g>
      <path d="M 260 30 Q 320 30 335 90 L 335 110 Q 320 170 260 170 Z" fill="url(#mtb-${c.id})" stroke="#1a202c"/>
      <rect x="330" y="90" width="10" height="20" fill="#2a4a54"/>
      <g class="motor-shaft" transform-origin="370 100">
        <rect x="340" y="92" width="60" height="16" fill="#e2e8f0" stroke="#1a202c"/>
        <line x1="350" y1="92" x2="350" y2="108" stroke="#1a202c" stroke-width="1.5"/>
        <line x1="370" y1="92" x2="370" y2="108" stroke="#1a202c" stroke-width="1.5"/>
        <line x1="390" y1="92" x2="390" y2="108" stroke="#1a202c" stroke-width="1.5"/>
      </g>
      <rect x="95" y="10" width="60" height="22" fill="#4a5568" stroke="#1a202c"/>
      ${c.showRPM ? `
        <rect x="170" y="50" width="70" height="80" rx="3" fill="#0d171a" stroke="#1a202c"/>
        <circle cx="225" cy="62" r="4" fill="${led}"/>
        <text x="205" y="78" text-anchor="middle" font-size="9" font-weight="bold" fill="#88c8d8">${ctx.esc(c.unit || 'RPM')}</text>
        <text x="205" y="100" text-anchor="middle" font-size="20" font-weight="bold"
              fill="${on ? '#00ffea' : '#3a4a4d'}">${on ? Math.round(v) : 0}</text>
        <text x="205" y="118" text-anchor="middle" font-size="8" fill="#88c8d8">${on ? 'RUN' : 'STOP'}</text>
      ` : ''}
    </svg>`;
  }
});
