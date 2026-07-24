/**
 * thermometer.component.js — Termómetro analógico vertical.
 *
 * Columna de mercurio asciende proporcional a la variable. Color cambia
 * según severidad (azul → ámbar → rojo).
 */
HMIRegistry.register({
  type:        'thermometer',
  label:       'Termómetro',
  icon:        '🌡',
  category:    'Medidores',
  defaultSize: { w: 90, h: 200 },

  defaults: {
    variable:      '',
    unit:          '°C',
    min:           0,
    max:           100,
    decimals:      1,
    color:         '#d94d4d',
    bg:            '#f8fafc',
    border:        '#1a202c',
    alarmsEnabled: false,
    hh: null, hi: null, opHi: null,
    opLo: null, lo: null, ll: null,
  },

  properties: [
    { name: 'variable', label: 'Variable', type: 'variable', group: 'General' },
    { name: 'unit',     label: 'Unidad',   type: 'text',     group: 'General' },
    { name: 'min',      label: 'Mínimo',   type: 'number',   group: 'General' },
    { name: 'max',      label: 'Máximo',   type: 'number',   group: 'General' },
    { name: 'color',    label: 'Color líquido', type: 'color', group: 'Estilo' },
    { name: 'bg',       label: 'Fondo',    type: 'color',    group: 'Estilo' },
  ],

  render(c, ctx) {
    const val = ctx.getValue(c.variable);
    const p   = ctx.percent(val, c);
    const sev = ctx.severity(val, c);
    const colorLiq = ctx.colorForSeverity(sev, { color: c.color });

    // Tubo: y=20 (arriba) → y=180 (base del tubo). Bulbo en y=200.
    const tubeTop = 20, tubeBot = 180;
    const yLiquid = tubeBot - (tubeBot - tubeTop) * p;

    // Marcas cada 25%
    const ticks = [];
    for (let i = 0; i <= 4; i++) {
      const y = tubeTop + (tubeBot - tubeTop) * (i / 4);
      ticks.push(`<line x1="58" y1="${y}" x2="64" y2="${y}" stroke="#475569" stroke-width="1.5"/>
                  <text x="68" y="${y + 4}" font-size="9" fill="#475569">${(c.max - (c.max - c.min) * (i / 4)).toFixed(0)}</text>`);
    }

    return `<svg width="100%" height="100%" viewBox="0 0 90 230" preserveAspectRatio="xMidYMid meet">
      <!-- Tubo de vidrio -->
      <rect x="35" y="${tubeTop - 5}" width="20" height="${tubeBot - tubeTop + 10}" rx="10"
            fill="${c.bg}" stroke="${c.border}" stroke-width="2"/>
      <!-- Líquido -->
      <rect x="38" y="${yLiquid}" width="14" height="${tubeBot - yLiquid + 5}" fill="${colorLiq}" rx="2"/>
      <!-- Bulbo -->
      <circle cx="45" cy="200" r="14" fill="${colorLiq}" stroke="${c.border}" stroke-width="2"/>
      <!-- Marcas -->
      ${ticks.join('')}
      <!-- Display digital abajo -->
      <text x="45" y="225" text-anchor="middle" font-size="11" font-weight="bold" fill="#0f172a"
            font-family="Consolas,monospace">${ctx.esc(ctx.formatValue(val, c))}</text>
    </svg>`;
  }
});
