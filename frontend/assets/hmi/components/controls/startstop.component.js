/**
 * startstop.component.js — Botones START (verde) y STOP (rojo).
 *
 * Cada botón escribe un valor fijo en su variable destino al pulsarse.
 * Útiles para arranque/parada de motores y bombas.
 */
(function () {
  'use strict';

  const COMMON_PROPS = [
    { name: 'outputVar',        label: 'Variable destino', type: 'variable', group: 'General' },
    { name: 'valueWhenPressed', label: 'Valor al pulsar',  type: 'number',   group: 'General' },
    { name: 'text',             label: 'Etiqueta',         type: 'text',     group: 'Estilo' },
  ];

  HMIRegistry.register({
    type:        'startbtn',
    label:       'Botón Arranque',
    icon:        '▶',
    category:    'Controles',
    defaultSize: { w: 120, h: 58 },
    defaults: {
      outputVar: '',
      valueWhenPressed: 1,
      text: 'START',
    },
    properties: COMMON_PROPS,
    render(c, ctx) {
      return `<button type="button" style="
          width:100%;height:100%;background:linear-gradient(180deg,#22c55e,#16a34a);
          color:#fff;border:1px solid #15803d;border-radius:6px;
          font-weight:900;font-size:15px;letter-spacing:1px;cursor:pointer;
          box-shadow:0 3px 0 #14532d,inset 0 1px 0 rgba(255,255,255,0.4);"
          onmousedown="this.style.transform='translateY(2px)';this.style.boxShadow='0 1px 0 #14532d';"
          onmouseup="this.style.transform='';this.style.boxShadow='0 3px 0 #14532d,inset 0 1px 0 rgba(255,255,255,0.4)';"
          onclick="window.HMIContext.write('${ctx.esc(c.outputVar)}', ${+c.valueWhenPressed || 1})">
        ▶ ${ctx.esc(c.text || 'START')}</button>`;
    }
  });

  HMIRegistry.register({
    type:        'stopbtn',
    label:       'Botón Paro',
    icon:        '⏹',
    category:    'Controles',
    defaultSize: { w: 120, h: 58 },
    defaults: {
      outputVar: '',
      valueWhenPressed: 0,
      text: 'STOP',
    },
    properties: COMMON_PROPS,
    render(c, ctx) {
      return `<button type="button" style="
          width:100%;height:100%;background:linear-gradient(180deg,#ef4444,#dc2626);
          color:#fff;border:1px solid #991b1b;border-radius:6px;
          font-weight:900;font-size:15px;letter-spacing:1px;cursor:pointer;
          box-shadow:0 3px 0 #7f1d1d,inset 0 1px 0 rgba(255,255,255,0.4);"
          onmousedown="this.style.transform='translateY(2px)';this.style.boxShadow='0 1px 0 #7f1d1d';"
          onmouseup="this.style.transform='';this.style.boxShadow='0 3px 0 #7f1d1d,inset 0 1px 0 rgba(255,255,255,0.4)';"
          onclick="window.HMIContext.write('${ctx.esc(c.outputVar)}', ${+c.valueWhenPressed || 0})">
        ⏹ ${ctx.esc(c.text || 'STOP')}</button>`;
    }
  });
})();
