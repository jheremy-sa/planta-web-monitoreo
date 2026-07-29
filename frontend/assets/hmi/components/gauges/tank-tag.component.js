/**
 * tank-tag.component.js
 * Tanque con nivel dinámico basado en un tag numérico.
 * El nivel se muestra como porcentaje entre minTag y maxTag.
 */
(function () {
  'use strict';
  if (!window.HMIRegistry) return;

  window.HMIRegistry.register({
    type: 'tank-tag',
    label: 'Tanque con Nivel',
    icon: '🪣',
    category: 'Gauges',
    defaultSize: { w: 80, h: 120 },
    defaults: {
      tag: '',
      etiqueta: 'Tanque',
      minTag: 0,
      maxTag: 100,
      colorAgua: '#3b82f6',
      colorBorde: '#4b5563',
      colorAlarmaLo: '#ef4444',
      colorAlarmaHi: '#f59e0b',
      alarmaLo: 10,
      alarmaHi: 90,
      mostrarPct: true,
    },
    properties: [
      { key: 'tag',        label: 'Tag (nivel)',       type: 'variable-select' },
      { key: 'etiqueta',   label: 'Etiqueta',          type: 'text' },
      { key: 'minTag',     label: 'Valor mínimo',      type: 'number' },
      { key: 'maxTag',     label: 'Valor máximo',      type: 'number' },
      { key: 'colorAgua',  label: 'Color del agua',    type: 'color' },
      { key: 'colorBorde', label: 'Color del borde',   type: 'color' },
      { key: 'alarmaLo',   label: 'Alarma nivel bajo (%)', type: 'number' },
      { key: 'alarmaHi',   label: 'Alarma nivel alto (%)', type: 'number' },
      { key: 'mostrarPct', label: 'Mostrar porcentaje', type: 'checkbox' },
    ],
    render(component, ctx) {
      const p = component.props || {};
      let tagValor = 0;
      if (p.tag && ctx && ctx.getVar) {
        const v = ctx.getVariable(p.tag);
        tagValor = v ? ((v ? (v.valor_actual ?? v.valor ?? 0) : 0)) : 0;
      }
      const min = parseFloat(p.minTag || 0);
      const max = parseFloat(p.maxTag || 100);
      const pct = Math.min(100, Math.max(0, ((tagValor - min) / (max - min)) * 100));
      const alarmaLo = parseFloat(p.alarmaLo || 10);
      const alarmaHi = parseFloat(p.alarmaHi || 90);

      let colorAgua = p.colorAgua || '#3b82f6';
      if (pct <= alarmaLo) colorAgua = p.colorAlarmaLo || '#ef4444';
      if (pct >= alarmaHi) colorAgua = p.colorAlarmaHi || '#f59e0b';

      const colorBorde = p.colorBorde || '#4b5563';

      return `
        <div style="width:100%;height:100%;display:flex;flex-direction:column;
                    align-items:center;justify-content:space-between;
                    font-family:'Segoe UI',sans-serif;padding:2px;box-sizing:border-box">
          ${p.etiqueta
            ? `<div style="font-size:9px;color:#7d8590;font-weight:700;
                           text-transform:uppercase;letter-spacing:.4px">${p.etiqueta}</div>`
            : '<div></div>'}
          <div style="flex:1;width:60%;min-width:30px;max-width:60px;
                      margin:2px 0;position:relative;overflow:hidden">
            <!-- Cuerpo del tanque -->
            <div style="position:absolute;inset:0;border:2px solid ${colorBorde};
                        border-radius:4px 4px 6px 6px;overflow:hidden;background:#0a0f1a">
              <!-- Agua -->
              <div style="position:absolute;bottom:0;left:0;right:0;
                          height:${pct}%;background:${colorAgua};
                          transition:height .5s ease,background .3s ease;
                          border-top:1px solid ${colorAgua}cc">
                <!-- Ola superior -->
                <div style="position:absolute;top:0;left:-50%;right:-50%;
                            height:6px;background:${colorAgua}88;
                            border-radius:50%"></div>
              </div>
              <!-- Líneas de escala -->
              ${[25,50,75].map(tick => `
                <div style="position:absolute;left:0;right:0;bottom:${tick}%;
                            border-top:1px dashed #ffffff18;
                            font-size:0"></div>
              `).join('')}
            </div>
          </div>
          ${p.mostrarPct !== false
            ? `<div style="font-size:11px;font-weight:800;color:${colorAgua};
                           font-family:monospace">${pct.toFixed(0)}%</div>`
            : ''}
        </div>`;
    },
  });
  console.log('[HMI] tank-tag.component registrado');
})();
