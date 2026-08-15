/**
 * led.component.js — LED indicador (on/off binario).
 */
HMIRegistry.register({
  type:        'led',
  label:       'LED indicador',
  icon:        '⬤',
  category:    'Display',
  defaultSize: { w: 50, h: 50 },

  defaults: {
    variable:  '',
    colorOn:   '#22c55e',
    colorOff:  '#475569',
    label:     '',
  },

  properties: [
    { name: 'variable', label: 'Variable',     type: 'variable', group: 'General' },
    { name: 'colorOn',  label: 'Color ON',     type: 'color',    group: 'Estilo' },
    { name: 'colorOff', label: 'Color OFF',    type: 'color',    group: 'Estilo' },
  ],

  render(c, ctx) {
    const v = ctx.getValue(c.variable);
    const on = v > 0;
    const color = on ? c.colorOn : c.colorOff;
    return `<svg width="100%" height="100%" viewBox="0 0 50 50" preserveAspectRatio="xMidYMid meet">
        <defs>
          <radialGradient id="led-${c.id}" cx="40%" cy="35%">
            <stop offset="0%" stop-color="#ffffff" stop-opacity="0.9"/>
            <stop offset="40%" stop-color="${color}"/>
            <stop offset="100%" stop-color="${color}" stop-opacity="0.7"/>
          </radialGradient>
        </defs>
        <circle cx="25" cy="25" r="22" fill="${color}" opacity="0.35"/>
        <circle cx="25" cy="25" r="18" fill="url(#led-${c.id})" stroke="#1a202c" stroke-width="1.5"/>
        ${on ? `<circle cx="20" cy="20" r="5" fill="#ffffff" opacity="0.85"/>` : ''}
      </svg>`;
  }
});
