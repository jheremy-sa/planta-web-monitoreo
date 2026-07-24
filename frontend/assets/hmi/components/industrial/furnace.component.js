/**
 * furnace.component.js — Horno industrial con cámara de fuego animada.
 *
 * Reacciona a la variable:
 *   - variable > 0  → llamas animadas, intensidad según % (mayor T → más blanco)
 *   - variable == 0 → cámara oscura
 *
 * Muestra una barra de temperatura lateral y un display con el valor actual.
 */
HMIRegistry.register({
  type:        'furnace',
  label:       'Horno Industrial',
  icon:        '🔥',
  category:    'Hornos',
  defaultSize: { w: 160, h: 200 },

  defaults: {
    variable:    '',
    min:         0,
    max:         600,
    unit:        '°C',
    colorBase:   '#9aa2a9',
  },

  properties: [
    { name: 'variable',  label: 'Variable',      type: 'variable', group: 'General' },
    { name: 'unit',      label: 'Unidad',        type: 'text',     group: 'General' },
    { name: 'min',       label: 'Temp. mínima',  type: 'number',   group: 'General' },
    { name: 'max',       label: 'Temp. máxima',  type: 'number',   group: 'General' },
    { name: 'colorBase', label: 'Color carcasa', type: 'color',    group: 'Estilo' },
  ],

  render(c, ctx) {
    const v   = ctx.getValue(c.variable);
    const on  = v > 0;
    const p   = ctx.percent(v, c);
    const led = on ? '#00e676' : '#555';

    // Color del núcleo de la llama según temperatura
    let coreFlame = '#ffcc00';
    if (p > 0.7)      coreFlame = '#ffffff';
    else if (p > 0.4) coreFlame = '#ffe600';

    const barH = 100 * p;
    const barY = 130 + (100 - barH);

    return `<svg class="ind-furnace${on ? ' run' : ''}" data-id="${c.id}"
                 width="100%" height="100%" viewBox="0 0 200 240" preserveAspectRatio="none"
                 style="pointer-events:none;display:block">
      <defs>
        <linearGradient id="frn-${c.id}" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#808080"/><stop offset="50%" stop-color="${c.colorBase}"/><stop offset="100%" stop-color="#707070"/>
        </linearGradient>
        <radialGradient id="glow-${c.id}" cx="50%" cy="100%" r="100%">
          <stop offset="0%"   stop-color="rgba(255,60,0,0.8)"/>
          <stop offset="50%"  stop-color="rgba(255,100,0,0.3)"/>
          <stop offset="100%" stop-color="rgba(0,0,0,0)"/>
        </radialGradient>
        <clipPath id="frnClip-${c.id}"><rect x="10" y="130" width="180" height="100"/></clipPath>
      </defs>
      <rect x="65" y="0" width="70" height="80" fill="url(#frn-${c.id})"/>
      <polygon points="65,80 135,80 195,120 5,120" fill="url(#frn-${c.id})"/>
      <rect x="0" y="120" width="200" height="120" fill="url(#frn-${c.id})"/>
      <rect x="10" y="130" width="180" height="100" fill="#1a1c23" stroke="#444" stroke-width="4"/>
      <g clip-path="url(#frnClip-${c.id})" class="fire-chamber">
        <rect class="furnace-glow" x="10" y="130" width="180" height="100" fill="url(#glow-${c.id})"/>
        <path class="flame flame-back"  fill="#cc1100" d="M 10 240 Q 40 160 60 210 Q 90 140 120 200 Q 150 150 190 240 Z"/>
        <path class="flame flame-mid"   fill="#ff6600" d="M 20 240 Q 50 170 80 220 Q 110 160 140 210 Q 170 180 180 240 Z"/>
        <path class="flame flame-front" fill="${coreFlame}" d="M 40 240 Q 70 190 95 230 Q 120 180 150 240 Z"/>
        <path class="floating-flame f1" fill="#ff4400" d="M 45 180 Q 50 160 55 180 Q 50 190 45 180 Z"/>
        <path class="floating-flame f2" fill="#ffaa00" d="M 145 190 Q 150 170 155 190 Q 150 200 145 190 Z"/>
        <path class="floating-flame f3" fill="#ff2200" d="M 95 160 Q 100 140 105 160 Q 100 170 95 160 Z"/>
        <circle class="spark s1" cx="60"  cy="230" r="1.5" fill="#fff"/>
        <circle class="spark s2" cx="110" cy="230" r="2"   fill="#ffdd00"/>
        <circle class="spark s3" cx="150" cy="230" r="1"   fill="#fff"/>
        <circle class="spark s4" cx="90"  cy="230" r="2"   fill="#ff8800"/>
      </g>
      <circle cx="180" cy="135" r="5" fill="${led}" stroke="#222"/>
      <rect x="190" y="130" width="6" height="100" fill="#222" rx="1"/>
      <rect x="190" y="${barY}" width="6" height="${barH}" fill="${coreFlame}" rx="1"/>
      <rect x="120" y="135" width="65" height="20" rx="3" fill="rgba(0,0,0,0.7)" stroke="#444"/>
      <text x="152" y="150" text-anchor="middle" font-size="11" font-weight="bold"
            fill="${on ? '#ffd54a' : '#666'}">${ctx.esc(ctx.formatValue(v, c))}</text>
    </svg>`;
  }
});
