/**
 * conveyor.component.js — Banda transportadora industrial.
 *
 * Reacciona a la variable:
 *   - variable > 0 → rodillos en movimiento, panel verde, dirección derecha
 *   - variable < 0 → dirección inversa (rodillos a la izquierda)
 *   - variable == 0 → detenida
 *
 * La velocidad de los rodillos se ajusta proporcional a |variable| / max.
 */
HMIRegistry.register({
  type:        'conveyor',
  label:       'Banda Transportadora',
  icon:        '▰',
  category:    'Bandas Transportadoras',
  defaultSize: { w: 360, h: 80 },

  defaults: {
    variable:    '',
    min:         -100,
    max:         100,
    colorBase:   '#9aa2a9',
    colorActive: '#00e676',
  },

  properties: [
    { name: 'variable',    label: 'Variable',     type: 'variable', group: 'General' },
    { name: 'min',         label: 'Mínimo (← )',  type: 'number',   group: 'General' },
    { name: 'max',         label: 'Máximo (→)',   type: 'number',   group: 'General' },
    { name: 'colorBase',   label: 'Color chasis', type: 'color',    group: 'Estilo' },
    { name: 'colorActive', label: 'Color estado', type: 'color',    group: 'Estilo' },
  ],

  render(c, ctx) {
    const v        = ctx.getValue(c.variable);
    const on       = v !== 0;
    const reverse  = v < 0;
    const speedPct = Math.min(1, Math.abs(v) / Math.max(1, Math.max(Math.abs(c.min), Math.abs(c.max))));
    // 0% → 2.5 s ; 100% → 0.25 s
    const duration = (2.5 - speedPct * 2.25).toFixed(2);
    const dirCls   = reverse ? 'dir-left' : 'dir-right';
    const dirText  = !on ? 'DETENIDO' : (reverse ? '← IZQ' : 'DER →');
    const dirColor = !on ? '#ff4d4d' : '#00e676';

    // Rodillos: 23 piezas de 40px cada una
    const rollers = Array.from({ length: 23 }, (_, i) => {
      const x = i * 40;
      return `<g transform="translate(${x},72)">
        <rect x="2" y="2" width="36" height="32" fill="#212529" rx="3" stroke="#111"/>
        <rect x="6" y="6" width="28" height="24" fill="#343a40" rx="2"/>
        <circle cx="20" cy="18" r="8" fill="#999" stroke="#111"/>
        <line class="roller-line" x1="20" y1="10" x2="20" y2="26" stroke="#212529" stroke-width="1.5"/>
      </g>`;
    }).join('');

    return `<svg class="ind-conveyor${on ? ' run' : ''} ${dirCls}"
                 data-id="${c.id}" data-duration="${duration}"
                 width="100%" height="100%" viewBox="0 0 800 130" preserveAspectRatio="none"
                 style="pointer-events:none;display:block;--conveyor-speed:${duration}s">
      <defs>
        <linearGradient id="conv-${c.id}" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#4a4f54"/><stop offset="50%" stop-color="${c.colorBase}"/><stop offset="100%" stop-color="#212529"/>
        </linearGradient>
        <clipPath id="convClip-${c.id}"><rect x="12" y="72" width="776" height="36" rx="2"/></clipPath>
      </defs>
      <rect x="5" y="15" width="790" height="110" rx="6" fill="#1a1d20" stroke="#343a40" stroke-width="2"/>
      <polygon points="10,20 790,20 790,70 10,70" fill="url(#conv-${c.id})"/>
      <line x1="10" y1="70" x2="790" y2="70" stroke="#495057" stroke-width="2"/>
      <rect x="10" y="70" width="780" height="40" fill="#0b0c10" stroke="#2b2e38" stroke-width="1.5"/>
      <g clip-path="url(#convClip-${c.id})">
        <g class="conveyor-rollers">
          <g transform="translate(-40,0)">${rollers}</g>
        </g>
      </g>
      <rect x="5"   y="108" width="790" height="14"  fill="url(#conv-${c.id})" stroke="#1a1d20"/>
      <rect x="5"   y="20"  width="10"  height="100" fill="url(#conv-${c.id})" stroke="#1a1d20"/>
      <rect x="785" y="20"  width="10"  height="100" fill="url(#conv-${c.id})" stroke="#1a1d20"/>
      <rect x="280" y="2" width="240" height="13" rx="3" fill="#0d1117" stroke="#21262d"/>
      <text x="400" y="12" text-anchor="middle" font-size="9" font-weight="bold" fill="${dirColor}">${dirText}</text>
    </svg>`;
  }
});
