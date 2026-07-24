/**
 * numeric.component.js — Display digital del valor de una variable.
 */
HMIRegistry.register({
  type:        'numeric',
  label:       'Indicador numérico',
  icon:        '🔢',
  category:    'Display',
  defaultSize: { w: 140, h: 60 },

  defaults: {
    variable:      '',
    unit:          '',
    decimals:      1,
    min:           0,
    max:           100,
    color:         '#0f172a',
    bg:            '#f1f5f9',
    border:        '#cbd5e1',
    alarmsEnabled: false,            // alarmas DESACTIVADAS por defecto
    hh: null, hi: null, opHi: null,  // umbrales superiores
    opLo: null, lo: null, ll: null,  // umbrales inferiores
  },

  properties: [
    { name: 'variable',      label: 'Variable',         type: 'variable', group: 'General' },
    { name: 'unit',          label: 'Unidad',           type: 'text',     group: 'General' },
    { name: 'decimals',      label: 'Decimales',        type: 'number', min: 0, max: 6, group: 'General' },
    { name: 'color',         label: 'Color texto',      type: 'color',    group: 'Estilo' },
    { name: 'bg',            label: 'Fondo',            type: 'color',    group: 'Estilo' },
    { name: 'border',        label: 'Borde',            type: 'color',    group: 'Estilo' },
    { name: 'min',           label: 'Mínimo del rango', type: 'number',   group: 'Estilo' },
    { name: 'max',           label: 'Máximo del rango', type: 'number',   group: 'Estilo' },
  ],

  render(c, ctx) {
    const val = ctx.getValue(c.variable);
    const sev = ctx.severity(val, c);
    const txt = ctx.formatValue(val, c);
    const colorAlarma = ctx.colorForSeverity(sev, c);
    const borderColor = (sev !== 'normal') ? colorAlarma : c.border;
    return `<div style="
        width:100%;height:100%;display:flex;flex-direction:column;
        align-items:center;justify-content:center;
        background:${c.bg};color:${c.color};border:1px solid ${borderColor};
        border-radius:6px;font-family:'Consolas','Courier New',monospace;
        ${sev !== 'normal' ? 'box-shadow:0 0 0 2px '+colorAlarma+'33;' : ''}
        ">
        <div style="font-size:18px;font-weight:bold;line-height:1">${ctx.esc(txt)}</div>
        ${c.variable ? `<div style="font-size:9px;opacity:0.55;margin-top:3px">${ctx.esc(c.variable)}</div>` : ''}
      </div>`;
  }
});
