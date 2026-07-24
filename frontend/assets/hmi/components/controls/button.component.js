/**
 * button.component.js — Botón pulsador (push-button).
 *
 * Al hacer click escribe `valueWhenPressed` en la variable configurada.
 */
HMIRegistry.register({
  type:        'button',
  label:       'Botón pulsador',
  icon:        '⬜',
  category:    'Controles',
  defaultSize: { w: 110, h: 44 },

  defaults: {
    outputVar:        '',
    valueWhenPressed: 1,
    text:             'PULSAR',
    bg:               '#3b82f6',
    color:            '#ffffff',
  },

  properties: [
    { name: 'outputVar',        label: 'Variable destino', type: 'variable', group: 'General' },
    { name: 'valueWhenPressed', label: 'Valor al pulsar',  type: 'number',   group: 'General' },
    { name: 'text',             label: 'Texto',            type: 'text',     group: 'Estilo' },
    { name: 'bg',               label: 'Fondo',            type: 'color',    group: 'Estilo' },
    { name: 'color',            label: 'Color texto',      type: 'color',    group: 'Estilo' },
  ],

  render(c, ctx) {
    const txt = ctx.esc(c.text || 'BOTÓN');
    // onmousedown→write; usamos JS inline ya que el editor inserta el HTML directo.
    // El handler de escritura está disponible en window.HMIContext.write
    return `<button type="button" style="
        width:100%;height:100%;background:${c.bg};color:${c.color};
        border:none;border-radius:6px;font-weight:bold;font-size:13px;cursor:pointer;
        box-shadow:0 2px 0 rgba(0,0,0,0.18);"
        onmousedown="window.HMIContext.write('${ctx.esc(c.outputVar)}', ${+c.valueWhenPressed || 1})">
      ${txt}</button>`;
  }
});
