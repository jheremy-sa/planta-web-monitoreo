/**
 * bit-lamp.component.js
 * Bit Lamp: indicador LED para valores booleanos.
 * Verde=ON, Gris=OFF (colores configurables).
 */
(function () {
  'use strict';
  if (!window.HMIRegistry) return;

  window.HMIRegistry.register({
    type: 'bit-lamp',
    label: 'Bit Lamp (Indicador)',
    icon: '🟢',
    category: 'Display',
    defaultSize: { w: 80, h: 80 },
    defaults: {
      tag: '',
      etiqueta: 'Indicador',
      colorOn: '#22c55e',
      colorOff: '#6b7280',
      forma: 'circulo',   // circulo | cuadrado | rombo
      mostrarEtiqueta: true,
    },
    properties: [
      { key: 'tag',       label: 'Tag',            type: 'variable-select' },
      { key: 'etiqueta',  label: 'Etiqueta',       type: 'text' },
      { key: 'colorOn',   label: 'Color ON',        type: 'color' },
      { key: 'colorOff',  label: 'Color OFF',       type: 'color' },
      { key: 'forma',     label: 'Forma',           type: 'select',
        options: [{ v:'circulo',label:'Círculo' },{ v:'cuadrado',label:'Cuadrado' },{ v:'rombo',label:'Rombo' }] },
      { key: 'mostrarEtiqueta', label: 'Mostrar etiqueta', type: 'checkbox' },
    ],
    render(component, ctx) {
      const p = component.props || {};
      let tagValor = 0;
      if (p.tag && ctx && ctx.getVar) {
        const v = ctx.getVariable(p.tag);
        tagValor = v ? ((v ? (v.valor_actual ?? v.valor ?? 0) : 0)) : 0;
      }
      const on     = tagValor > 0;
      const color  = on ? (p.colorOn || '#22c55e') : (p.colorOff || '#6b7280');
      const glow   = on ? `0 0 12px 4px ${color}88` : 'none';
      const forma  = p.forma || 'circulo';
      const border = forma === 'circulo' ? '50%' : forma === 'rombo' ? '4px' : '8px';
      const transform = forma === 'rombo' ? 'rotate(45deg)' : 'none';
      return `
        <div style="width:100%;height:100%;display:flex;flex-direction:column;
                    align-items:center;justify-content:center;gap:4px">
          <div style="width:50%;aspect-ratio:1;background:${color};
                      border-radius:${border};transform:${transform};
                      box-shadow:${glow};
                      border:2px solid ${on ? color : '#374151'};
                      transition:all .3s ease"></div>
          ${p.mostrarEtiqueta !== false && p.etiqueta
            ? `<div style="font-size:10px;color:#94a3b8;font-weight:600;
                           text-align:center;white-space:nowrap">${p.etiqueta}</div>`
            : ''}
        </div>`;
    },
  });
  console.log('[HMI] bit-lamp.component registrado');
})();
