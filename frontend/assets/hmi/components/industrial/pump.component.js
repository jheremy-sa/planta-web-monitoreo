/**
 * pump.component.js — Bomba centrífuga industrial.
 *
 * Aspas giran cuando variable > 0; LED rojo en OFF, verde en ON.
 */
HMIRegistry.register({
  type:        'pump',
  label:       'Bomba Centrífuga',
  icon:        '🟢',
  category:    'Bombas',
  defaultSize: { w: 140, h: 130 },

  defaults: {
    variable:    '',
    colorBase:   '#9aa2a9',
    colorActive: '#22c55e',
  },

  properties: [
    { name: 'variable',    label: 'Variable',     type: 'variable', group: 'General' },
    { name: 'colorBase',   label: 'Color base',   type: 'color',    group: 'Estilo' },
    { name: 'colorActive', label: 'Color activo', type: 'color',    group: 'Estilo' },
  ],

  render(c, ctx) {
    const v   = ctx.getValue(c.variable);
    const on  = v > 0;
    const led = on ? c.colorActive : '#ff4d4d';
    return `<svg class="ind-pump${on ? ' run' : ''}" data-id="${c.id}"
                 width="100%" height="100%" viewBox="0 0 240 220" preserveAspectRatio="none"
                 style="pointer-events:none;display:block">
      <defs>
        <linearGradient id="pmp-${c.id}" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#e0e0e0"/><stop offset="50%" stop-color="${c.colorBase}"/><stop offset="100%" stop-color="#606060"/>
        </linearGradient>
      </defs>
      <polygon points="40,200 55,160 90,160 75,200" fill="#555" stroke="#333"/>
      <rect x="25" y="200" width="65" height="10" fill="#444"/>
      <polygon points="125,200 140,160 175,160 160,200" fill="#555" stroke="#333"/>
      <rect x="110" y="200" width="65" height="10" fill="#444"/>
      <rect x="110" y="30" width="80" height="55" fill="url(#pmp-${c.id})" stroke="#333" stroke-width="2"/>
      <rect x="190" y="15" width="20" height="85" fill="#777" stroke="#222" stroke-width="2"/>
      <circle cx="110" cy="115" r="80" fill="url(#pmp-${c.id})" stroke="#333" stroke-width="2"/>
      <path d="M 45,100 A 70 70 0 0 1 110,45" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity="0.5"/>
      <circle cx="110" cy="115" r="45" fill="#666" stroke="#444" stroke-width="3"/>
      <circle cx="110" cy="115" r="42" fill="#2a2a2a"/>
      <g class="pump-impeller" transform-origin="110 115">
        ${[0,60,120,180,240,300].map(deg => `<polygon points="110,110 95,78 125,78" fill="#555" stroke="#333" transform="rotate(${deg} 110 115)"/>`).join('')}
        <circle cx="110" cy="115" r="12" fill="#888" stroke="#333"/>
        <circle cx="110" cy="115" r="4" fill="#ccc"/>
      </g>
      <circle cx="35" cy="55" r="7" fill="${led}" stroke="#222" stroke-width="1.5"/>
    </svg>`;
  }
});
