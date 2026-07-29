/**
 * level.component.js — Barra de nivel horizontal.
 *
 * Útil para mostrar progreso, nivel de tanque o cualquier valor proporcional.
 * Cambia de color según severidad si las alarmas están activas.
 */
HMIRegistry.register({
  type:        'level',
  label:       'Barra de Nivel',
  icon:        '≡',
  category:    'Medidores',
  defaultSize: { w: 280, h: 70 },

  defaults: {
    variable:      '',
    unit:          '',
    min:           0,
    max:           100,
    decimals:      1,
    color:         '#3b82f6',
    bg:            '#e5e7eb',
    border:        '#cbd5e1',
    showLabel:     true,
    alarmsEnabled: false,
    hh: null, hi: null, opHi: null,
    opLo: null, lo: null, ll: null,
  },

  properties: [
    { name: 'variable',  label: 'Variable', type: 'variable', group: 'General' },
    { name: 'unit',      label: 'Unidad',   type: 'text',     group: 'General' },
    { name: 'min',       label: 'Mínimo',   type: 'number',   group: 'General' },
    { name: 'max',       label: 'Máximo',   type: 'number',   group: 'General' },
    { name: 'showLabel', label: 'Mostrar valor', type: 'checkbox', group: 'Estilo' },
    { name: 'color',     label: 'Color barra', type: 'color', group: 'Estilo' },
    { name: 'bg',        label: 'Fondo',    type: 'color',    group: 'Estilo' },
  ],

  render(c, ctx) {
    const val = ctx.getValue(c.variable);
    const p   = ctx.percent(val, c);
    const sev = ctx.severity(val, c);
    const colorBar = ctx.colorForSeverity(sev, { color: c.color });
    const txt = ctx.formatValue(val, c);
    return `<div style="
        width:100%;height:100%;background:${c.bg};border:1px solid ${c.border};
        border-radius:6px;padding:6px;box-sizing:border-box;display:flex;flex-direction:column;gap:4px">
      ${c.variable ? `<div style="font-size:10px;color:#475569;font-weight:600">${ctx.esc(c.variable)}</div>` : ''}
      <div style="flex:1;background:#fff;border:1px solid ${c.border};border-radius:4px;
                  overflow:hidden;position:relative;display:flex;align-items:center">
        <div style="background:${colorBar};height:100%;width:${(p * 100).toFixed(1)}%;
                    transition:width 0.3s ease, background 0.3s"></div>
        ${c.showLabel ? `<div style="position:absolute;left:0;right:0;text-align:center;
              font-family:Consolas,monospace;font-weight:bold;font-size:12px;color:#0f172a;
              text-shadow:0 0 4px #fff">${ctx.esc(txt)}</div>` : ''}
      </div>
    </div>`;
  }
});
