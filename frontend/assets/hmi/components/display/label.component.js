/**
 * label.component.js — Etiqueta de texto estática.
 */
HMIRegistry.register({
  type:        'label',
  label:       'Etiqueta de texto',
  icon:        '🅰',
  category:    'Display',
  defaultSize: { w: 120, h: 30 },

  defaults: {
    text:       'Texto',
    color:      '#1a202c',
    bg:         'transparent',
    fontSize:   14,
    fontWeight: 'bold',
    align:      'center',
  },

  properties: [
    { name: 'text',       label: 'Texto',           type: 'text',   group: 'Estilo' },
    { name: 'color',      label: 'Color de texto',  type: 'color',  group: 'Estilo' },
    { name: 'bg',         label: 'Fondo',           type: 'color',  group: 'Estilo' },
    { name: 'fontSize',   label: 'Tamaño (px)',     type: 'number', min: 6, max: 96, group: 'Estilo' },
    { name: 'fontWeight', label: 'Grosor',          type: 'select', options: ['normal','bold'], group: 'Estilo' },
    { name: 'align',      label: 'Alineación',      type: 'select', options: ['left','center','right'], group: 'Estilo' },
  ],

  render(c) {
    const text = HMIContext.esc(c.text || c.label || '');
    return `<div style="
        width:100%;height:100%;display:flex;align-items:center;
        justify-content:${c.align==='left'?'flex-start':c.align==='right'?'flex-end':'center'};
        background:${c.bg};color:${c.color};
        font-size:${c.fontSize}px;font-weight:${c.fontWeight};
        padding:0 6px;box-sizing:border-box;overflow:hidden;
        text-overflow:ellipsis;white-space:nowrap">${text}</div>`;
  }
});
