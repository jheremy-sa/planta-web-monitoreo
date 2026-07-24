/**
 * slider.component.js — Deslizador para ajustar el valor de una variable.
 */
HMIRegistry.register({
  type:        'slider',
  label:       'Deslizador',
  icon:        '—',
  category:    'Controles',
  defaultSize: { w: 260, h: 80 },

  defaults: {
    outputVar: '',
    min:       0,
    max:       100,
    step:      1,
    color:     '#3b82f6',
    bg:        '#ffffff',
  },

  properties: [
    { name: 'outputVar', label: 'Variable destino', type: 'variable', group: 'General' },
    { name: 'min',       label: 'Mínimo',           type: 'number',   group: 'General' },
    { name: 'max',       label: 'Máximo',           type: 'number',   group: 'General' },
    { name: 'step',      label: 'Incremento',       type: 'number',   group: 'General' },
    { name: 'color',     label: 'Color',            type: 'color',    group: 'Estilo' },
    { name: 'bg',        label: 'Fondo',            type: 'color',    group: 'Estilo' },
  ],

  render(c, ctx) {
    const val = ctx.getValue(c.outputVar);
    return `<div style="
        width:100%;height:100%;background:${c.bg};border:1px solid #e2e8f0;
        border-radius:6px;padding:8px;box-sizing:border-box;display:flex;
        flex-direction:column;justify-content:center;gap:6px;font-family:'Segoe UI',sans-serif">
      <div style="display:flex;justify-content:space-between;font-size:10px;color:#475569">
        <span>${ctx.esc(c.outputVar || '—')}</span>
        <span style="font-weight:bold;color:${c.color}">${val.toFixed(1)}</span>
      </div>
      <input type="range"
             min="${c.min}" max="${c.max}" step="${c.step}" value="${val}"
             style="width:100%;accent-color:${c.color}"
             onchange="window.HMIContext.write('${ctx.esc(c.outputVar)}', +this.value)">
      <div style="display:flex;justify-content:space-between;font-size:9px;color:#94a3b8">
        <span>${c.min}</span><span>${c.max}</span>
      </div>
    </div>`;
  }
});
