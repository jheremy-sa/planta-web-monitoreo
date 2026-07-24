/**
 * tank.component.js — Tanque de proceso con nivel dinámico y alarmas.
 *
 * El nivel del líquido se sincroniza con la variable asignada usando
 * percent(value, c). Soporta alarmas HIGH (≥90%) y LOW (≤10%).
 */
HMIRegistry.register({
  type:        'tank',
  label:       'Tanque de Proceso',
  icon:        '▤',
  category:    'Tanques',
  defaultSize: { w: 130, h: 200 },

  defaults: {
    variable:      '',
    min:           0,
    max:           200,
    unit:          'cm',
    colorLiquid:   '#3a9ad9',
    colorBody:     '#cbd5e0',
    colorBorder:   '#1a202c',
    alarmsEnabled: false,
    hh: null, hi: null, opHi: null,
    opLo: null, lo: null, ll: null,
  },

  properties: [
    { name: 'variable',      label: 'Variable',         type: 'variable', group: 'General' },
    { name: 'unit',          label: 'Unidad',           type: 'text',     group: 'General' },
    { name: 'min',           label: 'Mínimo',           type: 'number',   group: 'General' },
    { name: 'max',           label: 'Máximo',           type: 'number',   group: 'General' },
    { name: 'colorLiquid',   label: 'Color del líquido',type: 'color',    group: 'Estilo' },
    { name: 'colorBody',     label: 'Color cuerpo',     type: 'color',    group: 'Estilo' },
    { name: 'colorBorder',   label: 'Color borde',      type: 'color',    group: 'Estilo' },
  ],

  render(c, ctx) {
    const val   = ctx.getValue(c.variable);
    const pct   = ctx.percent(val, c);
    const sev   = ctx.severity(val, c);
    const Y_EMPTY = 230, Y_FULL = 35;
    const yLiq  = Y_EMPTY - (Y_EMPTY - Y_FULL) * pct;
    const pctTxt = Math.round(pct * 100);
    const valTxtColor = sev === 'cat3' ? '#ff5252'
                      : sev === 'cat2' ? '#ff8080'
                      : sev === 'cat1' ? '#ffd54a'
                      : '#00ffcc';

    return `<svg width="100%" height="100%" viewBox="0 0 240 320" preserveAspectRatio="none">
      <defs>
        <clipPath id="tk-${c.id}">
          <path d="M 20,40 Q 110,25 200,40 L 200,220 Q 110,235 20,220 Z"/>
        </clipPath>
      </defs>
      <!-- Patas -->
      <rect x="55"  y="215" width="14" height="65" fill="#777"/>
      <rect x="151" y="215" width="14" height="65" fill="#777"/>
      <polygon points="25,215 39,215 34,285 20,285"    fill="#888"/>
      <polygon points="181,215 195,215 200,285 186,285" fill="#888"/>
      <!-- Líquido -->
      <g clip-path="url(#tk-${c.id})">
        <rect x="0" y="${yLiq}" width="240" height="${Y_EMPTY - yLiq + 30}"
              fill="${c.colorLiquid}" opacity="0.85"/>
        <path fill="${c.colorLiquid}" opacity="0.95"
              d="M 0,${yLiq} Q 30,${yLiq-6} 60,${yLiq} T 120,${yLiq} T 180,${yLiq} T 240,${yLiq} L 240,${yLiq+10} L 0,${yLiq+10} Z"/>
      </g>
      <!-- Cuerpo cilíndrico semitransparente -->
      <path d="M 20,40 Q 110,15 200,40 Q 110,28 20,40 Z" fill="${c.colorBody}" stroke="${c.colorBorder}"/>
      <path d="M 20,40 Q 110,25 200,40 L 200,220 Q 110,235 20,220 Z"
            fill="${c.colorBody}" style="mix-blend-mode:multiply;opacity:0.6"
            stroke="${c.colorBorder}" stroke-width="1.5"/>
      <path d="M 20,40 Q 110,25 200,40 L 200,220 Q 110,235 20,220 Z"
            fill="none" stroke="#fff" stroke-width="2" opacity="0.15"/>
      <!-- Display digital -->
      <rect x="65" y="115" width="110" height="36" rx="3" fill="rgba(15,18,24,0.85)" stroke="#444"/>
      <text x="120" y="135" text-anchor="middle" font-size="16" font-weight="bold"
            fill="${valTxtColor}" font-family="Consolas,monospace">${ctx.esc(ctx.formatValue(val, c))}</text>
      <text x="120" y="147" text-anchor="middle" font-size="9" fill="#888">${pctTxt}%</text>
    </svg>`;
  }
});
