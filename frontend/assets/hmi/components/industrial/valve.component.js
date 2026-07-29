/**
 * valve.component.js — Válvula neumática de control.
 *
 * El actuador desciende cuando la válvula está ABIERTA (variable > 0).
 */
HMIRegistry.register({
  type:        'valve',
  label:       'Válvula Neumática',
  icon:        '⏻',
  category:    'Válvulas',
  defaultSize: { w: 130, h: 150 },

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
    const v       = ctx.getValue(c.variable);
    const on      = v > 0;
    const badge   = on ? '#22c55e' : '#ff4d4d';
    const txt     = on ? 'ABIERTA' : 'CERRADA';
    return `<svg class="ind-valve${on ? ' run' : ''}" data-id="${c.id}"
                 width="100%" height="100%" viewBox="0 0 200 210" preserveAspectRatio="none"
                 style="pointer-events:none;display:block">
      <defs>
        <linearGradient id="vlv-${c.id}" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#555"/><stop offset="50%" stop-color="${c.colorBase}"/><stop offset="100%" stop-color="#333"/>
        </linearGradient>
      </defs>
      <g class="valve-actuator">
        <rect x="92" y="40" width="16" height="55" fill="url(#vlv-${c.id})" stroke="#333"/>
        <path d="M 50,45 C 50,15 150,15 150,45 L 150,50 L 50,50 Z" fill="#cbd5e0" stroke="#222"/>
        <path d="M 65,30 C 85,18 115,18 135,30" fill="none" stroke="#fff" stroke-width="3" opacity="0.55"/>
      </g>
      <rect x="78" y="90" width="44" height="40" fill="url(#vlv-${c.id})" stroke="#222"/>
      <rect x="48" y="135" width="14" height="50" fill="#222"/>
      <rect x="138" y="135" width="14" height="50" fill="#222"/>
      <rect x="62" y="125" width="76" height="70" fill="url(#vlv-${c.id})" stroke="#222"/>
      <rect x="16" y="115" width="30" height="90" fill="url(#vlv-${c.id})" stroke="#222"/>
      <rect x="154" y="115" width="30" height="90" fill="url(#vlv-${c.id})" stroke="#222"/>
      <rect x="62" y="2" width="76" height="18" rx="3" fill="#111" stroke="${badge}"/>
      <text x="100" y="14" text-anchor="middle" font-size="9" font-weight="bold" fill="${badge}">${txt}</text>
    </svg>`;
  }
});
