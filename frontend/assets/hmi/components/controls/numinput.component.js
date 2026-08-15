/**
 * numinput.component.js — Entrada numérica directa con +/-.
 */
HMIRegistry.register({
  type:        'numinput',
  label:       'Entrada Numérica',
  icon:        '9',
  category:    'Controles',
  defaultSize: { w: 170, h: 70 },

  defaults: {
    outputVar: '',
    unit:      '',
    min:       0,
    max:       1000,
    step:      1,
    color:     '#0f172a',
    bg:        '#ffffff',
    border:    '#cbd5e1',
  },

  properties: [
    { name: 'outputVar', label: 'Variable destino', type: 'variable', group: 'General' },
    { name: 'unit',      label: 'Unidad',           type: 'text',     group: 'General' },
    { name: 'min',       label: 'Mínimo',           type: 'number',   group: 'General' },
    { name: 'max',       label: 'Máximo',           type: 'number',   group: 'General' },
    { name: 'step',      label: 'Incremento',       type: 'number',   group: 'General' },
    { name: 'color',     label: 'Color texto',      type: 'color',    group: 'Estilo' },
    { name: 'bg',        label: 'Fondo',            type: 'color',    group: 'Estilo' },
  ],

  render(c, ctx) {
    const val = ctx.getValue(c.outputVar);
    const tgt = ctx.esc(c.outputVar);
    return `<div style="
        width:100%;height:100%;background:${c.bg};border:1px solid ${c.border};
        border-radius:6px;display:flex;flex-direction:column;padding:6px;box-sizing:border-box">
      <div style="font-size:10px;color:#475569">${ctx.esc(c.outputVar || '—')}</div>
      <div style="display:flex;align-items:center;gap:4px;flex:1">
        <button type="button" style="width:28px;height:28px;border:1px solid #cbd5e1;background:#f1f5f9;border-radius:4px;cursor:pointer;font-weight:bold"
                onclick="window.HMIContext.write('${tgt}', Math.max(${c.min}, ${val} - ${c.step}))">−</button>
        <input type="number" value="${val}" min="${c.min}" max="${c.max}" step="${c.step}"
               style="flex:1;border:1px solid #cbd5e1;border-radius:4px;padding:4px;font-family:Consolas,monospace;font-size:14px;font-weight:bold;color:${c.color};text-align:center"
               onchange="window.HMIContext.write('${tgt}', +this.value)">
        <button type="button" style="width:28px;height:28px;border:1px solid #cbd5e1;background:#f1f5f9;border-radius:4px;cursor:pointer;font-weight:bold"
                onclick="window.HMIContext.write('${tgt}', Math.min(${c.max}, ${val} + ${c.step}))">+</button>
        ${c.unit ? `<span style="font-size:11px;color:#64748b">${ctx.esc(c.unit)}</span>` : ''}
      </div>
    </div>`;
  }
});
