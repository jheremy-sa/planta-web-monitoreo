/**
 * radial.component.js — Medidor radial tipo manómetro analógico.
 *
 * Aguja apuntando al valor según min/max, escala graduada cada 10%,
 * color del arco según severidad (normal/warn/alarm).
 */
HMIRegistry.register({
  type:        'radial',
  label:       'Medidor Radial',
  icon:        '◷',
  category:    'Medidores',
  defaultSize: { w: 200, h: 200 },

  defaults: {
    variable:  '',
    unit:      '',
    min:       0,
    max:       100,
    decimals:  1,
    color:     '#0f172a',
    bg:        '#ffffff',
    border:    '#cbd5e1',
    alarmsEnabled: false,
    hh: null, hi: null, opHi: null,
    opLo: null, lo: null, ll: null,
  },

  properties: [
    { name: 'variable', label: 'Variable',  type: 'variable', group: 'General' },
    { name: 'unit',     label: 'Unidad',    type: 'text',     group: 'General' },
    { name: 'min',      label: 'Mínimo',    type: 'number',   group: 'General' },
    { name: 'max',      label: 'Máximo',    type: 'number',   group: 'General' },
    { name: 'decimals', label: 'Decimales', type: 'number', min: 0, max: 6, group: 'General' },
    { name: 'color',    label: 'Color valor', type: 'color',  group: 'Estilo' },
    { name: 'bg',       label: 'Fondo',     type: 'color',    group: 'Estilo' },
    { name: 'border',   label: 'Borde',     type: 'color',    group: 'Estilo' },
  ],

  render(c, ctx) {
    const val = ctx.getValue(c.variable);
    const p   = ctx.percent(val, c);
    const sev = ctx.severity(val, c);
    const arcColor = ctx.colorForSeverity(sev, c);

    // Aguja: -135° → +135° (270° de barrido)
    const angle = -135 + 270 * p;
    const cx = 100, cy = 100, r = 75;
    const radAng = angle * Math.PI / 180;
    const ax = cx + (r - 12) * Math.cos(radAng);
    const ay = cy + (r - 12) * Math.sin(radAng);

    // Arco de progreso: empieza en -135° y avanza
    const startAng = -135 * Math.PI / 180;
    const endAng   = angle * Math.PI / 180;
    const sx = cx + r * Math.cos(startAng), sy = cy + r * Math.sin(startAng);
    const ex = cx + r * Math.cos(endAng),   ey = cy + r * Math.sin(endAng);
    const large = (angle - (-135)) > 180 ? 1 : 0;

    // Marcas cada 10%
    const ticks = [];
    for (let i = 0; i <= 10; i++) {
      const a = (-135 + 27 * i) * Math.PI / 180;
      const x1 = cx + (r - 4) * Math.cos(a), y1 = cy + (r - 4) * Math.sin(a);
      const x2 = cx + r * Math.cos(a), y2 = cy + r * Math.sin(a);
      ticks.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#94a3b8" stroke-width="1.5"/>`);
    }

    return `<svg width="100%" height="100%" viewBox="0 0 200 200" preserveAspectRatio="xMidYMid meet">
      <circle cx="${cx}" cy="${cy}" r="92" fill="${c.bg}" stroke="${c.border}" stroke-width="1.5"/>
      <circle cx="${cx}" cy="${cy}" r="${r + 6}" fill="none" stroke="#e2e8f0" stroke-width="8"/>
      <path d="M ${sx} ${sy} A ${r} ${r} 0 ${large} 1 ${ex} ${ey}"
            fill="none" stroke="${arcColor}" stroke-width="8" stroke-linecap="round"/>
      ${ticks.join('')}
      <line x1="${cx}" y1="${cy}" x2="${ax}" y2="${ay}" stroke="${c.color}" stroke-width="3" stroke-linecap="round"/>
      <circle cx="${cx}" cy="${cy}" r="6" fill="${c.color}"/>
      <text x="${cx}" y="${cy + 30}" text-anchor="middle" font-size="18" font-weight="bold" fill="${c.color}"
            font-family="Consolas,monospace">${ctx.esc(ctx.formatValue(val, c))}</text>
      ${c.variable ? `<text x="${cx}" y="${cy + 48}" text-anchor="middle" font-size="10" fill="#94a3b8">${ctx.esc(c.variable)}</text>` : ''}
    </svg>`;
  }
});
