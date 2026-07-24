/**
 * switch.component.js — Switch toggle (ON/OFF persistente).
 *
 * Lee la variable y permite alternarla con un click. Escribe 1 / 0.
 */
HMIRegistry.register({
  type:        'switch',
  label:       'Switch ON/OFF',
  icon:        '⇄',
  category:    'Controles',
  defaultSize: { w: 80, h: 40 },

  defaults: {
    variable:    '',
    outputVar:   '',
    colorOn:     '#22c55e',
    colorOff:    '#94a3b8',
  },

  properties: [
    { name: 'variable',  label: 'Variable estado',  type: 'variable', group: 'General' },
    { name: 'outputVar', label: 'Variable destino', type: 'variable', group: 'General' },
    { name: 'colorOn',   label: 'Color ON',         type: 'color',    group: 'Estilo' },
    { name: 'colorOff',  label: 'Color OFF',        type: 'color',    group: 'Estilo' },
  ],

  render(c, ctx) {
    const v   = ctx.getValue(c.variable || c.outputVar);
    const on  = v > 0;
    const tgt = ctx.esc(c.outputVar || c.variable);
    return `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center"
           onclick="window.HMIContext.write('${tgt}', ${on ? 0 : 1})">
      <div style="
          background:${on ? c.colorOn : c.colorOff};
          width:80%;height:60%;border-radius:999px;
          position:relative;cursor:pointer;
          transition:background 0.2s;box-shadow:inset 0 1px 2px rgba(0,0,0,0.25)">
        <div style="
            position:absolute;top:2px;${on ? 'right:2px' : 'left:2px'};
            width:calc(50% - 4px);height:calc(100% - 4px);
            background:#fff;border-radius:50%;
            box-shadow:0 1px 2px rgba(0,0,0,0.3);
            transition:left 0.2s, right 0.2s"></div>
      </div>
    </div>`;
  }
});
