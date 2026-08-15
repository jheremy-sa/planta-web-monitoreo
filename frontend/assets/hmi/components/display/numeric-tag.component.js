/**
 * numeric-tag.component.js
 * Numeric Display: muestra el valor de un tag numérico con su unidad.
 * Cambia de color si el valor sale del rango configurado (alarma).
 */
(function () {
  'use strict';
  if (!window.HMIRegistry) return;

  window.HMIRegistry.register({
    type: 'numeric-tag',
    label: 'Numeric Display',
    icon: '🔢',
    category: 'Display',
    defaultSize: { w: 120, h: 70 },
    defaults: {
      tag: '',
      etiqueta: 'Valor',
      unidad: '',
      decimales: 2,
      colorNormal: '#14b8a6',
      colorAlarma: '#ef4444',
      minNormal: null,
      maxNormal: null,
      fondo: '#1c2128',
    },
    properties: [
      { key: 'tag',         label: 'Tag',           type: 'variable-select' },
      { key: 'etiqueta',    label: 'Etiqueta',      type: 'text' },
      { key: 'unidad',      label: 'Unidad',         type: 'text' },
      { key: 'decimales',   label: 'Decimales',      type: 'number', min:0, max:4 },
      { key: 'colorNormal', label: 'Color normal',   type: 'color' },
      { key: 'colorAlarma', label: 'Color alarma',   type: 'color' },
      { key: 'minNormal',   label: 'Mín. normal',    type: 'number' },
      { key: 'maxNormal',   label: 'Máx. normal',    type: 'number' },
      { key: 'fondo',       label: 'Color fondo',    type: 'color' },
    ],
    render(component, ctx) {
      const p = component.props || {};
      let tagValor = null;
      if (p.tag && ctx && ctx.getVar) {
        const v = ctx.getVariable(p.tag);
        tagValor = v ? v.valor : null;
      }
      const valor = tagValor !== null ? tagValor : '--';
      const decs  = parseInt(p.decimales || 2);
      const valorStr = (valor !== '--' && typeof valor === 'number')
        ? valor.toFixed(decs) : '--';

      // Alarma si fuera de rango
      let enAlarma = false;
      if (valor !== '--' && typeof valor === 'number') {
        if (p.minNormal !== null && p.minNormal !== undefined && valor < parseFloat(p.minNormal)) enAlarma = true;
        if (p.maxNormal !== null && p.maxNormal !== undefined && valor > parseFloat(p.maxNormal)) enAlarma = true;
      }

      const color = enAlarma ? (p.colorAlarma || '#ef4444') : (p.colorNormal || '#14b8a6');
      const fondo = p.fondo || '#1c2128';
      const borde = enAlarma ? `2px solid ${color}` : `1px solid #30363d`;

      return `
        <div style="width:100%;height:100%;background:${fondo};border:${borde};
                    border-radius:8px;display:flex;flex-direction:column;
                    align-items:center;justify-content:center;padding:6px;
                    box-sizing:border-box;transition:all .3s;overflow:hidden">
          <div style="font-size:10px;color:#7d8590;font-weight:700;
                      text-transform:uppercase;letter-spacing:.5px;
                      white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%">
            ${p.etiqueta || 'Valor'}
          </div>
          <div style="font-size:24px;font-weight:800;color:${color};
                      font-family:'Consolas','Courier New',monospace;
                      line-height:1.1;${enAlarma ? 'animation:blink1 1s infinite' : ''}">
            ${valorStr}
          </div>
          ${p.unidad
            ? `<div style="font-size:11px;color:#7d8590;margin-top:2px">${p.unidad}</div>`
            : ''}
          ${enAlarma
            ? `<div style="font-size:9px;color:${color};font-weight:700;margin-top:2px">⚠ ALARMA</div>`
            : ''}
        </div>
        <style>
          @keyframes blink1 { 0%,100%{opacity:1} 50%{opacity:.4} }
        </style>`;
    },
  });
  console.log('[HMI] numeric-tag.component registrado');
})();
