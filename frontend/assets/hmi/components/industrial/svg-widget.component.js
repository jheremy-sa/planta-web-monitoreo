/**
 * svg-widget.component.js
 * Widget de imagen SVG con binding a Tag del sistema.
 *
 * Propiedades:
 *   svgRuta    - ruta relativa al SVG seleccionado
 *   tag        - nombre del tag/variable del sistema
 *   etiqueta   - texto debajo del widget
 *   colorOn    - color de filtro cuando el tag vale 1 (Boolean activo)
 *   colorOff   - color de filtro cuando el tag vale 0 (Boolean inactivo)
 *   escala     - 0.1-2.0
 *   mostrarEtiqueta - true/false
 */
(function () {
  'use strict';

  if (!window.HMIRegistry) return;

  window.HMIRegistry.register({
    type: 'svg-widget',
    label: 'Imagen SVG / Widget',
    icon: '🖼',
    category: 'SVG Industrial',
    defaultSize: { w: 100, h: 100 },

    defaults: {
      svgRuta: 'imagenes/widgets/dinamicos/pump1.svg',
      tag: '',
      etiqueta: 'Widget',
      colorOn: '#14b8a6',
      colorOff: '#6b7280',
      mostrarEtiqueta: true,
    },

    properties: [
      {
        key: 'svgRuta',
        label: 'Imagen SVG',
        type: 'svg-picker',
        catalogUrl: 'imagenes/widgets/catalogo.json',
      },
      {
        key: 'tag',
        label: 'Tag (variable del sistema)',
        type: 'variable-select',
        hint: 'Selecciona la variable del sistema que alimenta este widget',
      },
      {
        key: 'etiqueta',
        label: 'Etiqueta',
        type: 'text',
      },
      {
        key: 'mostrarEtiqueta',
        label: 'Mostrar etiqueta',
        type: 'checkbox',
      },
      {
        key: 'colorOn',
        label: 'Color activo (ON)',
        type: 'color',
      },
      {
        key: 'colorOff',
        label: 'Color inactivo (OFF)',
        type: 'color',
      },
    ],

    render(component, ctx) {
      const p = component.props || {};
      const svgRuta   = p.svgRuta   || 'imagenes/widgets/dinamicos/pump1.svg';
      const tag       = p.tag       || '';
      const etiqueta  = p.etiqueta  || '';
      const colorOn   = p.colorOn   || '#14b8a6';
      const colorOff  = p.colorOff  || '#6b7280';
      const mostrarEt = p.mostrarEtiqueta !== false;

      // Leer valor actual del tag
      let tagValor = 0;
      if (tag && ctx && ctx.getVar) {
        const v = ctx.getVariable(tag);
        tagValor = v ? ((v ? (v.valor_actual ?? v.valor ?? 0) : 0)) : 0;
      }

      const activo  = tagValor > 0;
      const color   = activo ? colorOn : colorOff;

      // Para booleanos: aplicar filtro de color via CSS
      // Para floats: mostrar valor numérico debajo
      const esBoolean = tagValor === 0 || tagValor === 1;
      const filtro = activo
        ? `hue-rotate(0deg) saturate(150%) brightness(1.1)`
        : `grayscale(80%) brightness(0.7)`;

      let valorLabel = '';
      if (tag && !esBoolean && tagValor !== 0) {
        valorLabel = `<div style="font-size:10px;font-weight:700;color:${color};
                           font-family:monospace;margin-top:1px">${tagValor.toFixed ? tagValor.toFixed(1) : tagValor}</div>`;
      }

      return `
        <div style="width:100%;height:100%;display:flex;flex-direction:column;
                    align-items:center;justify-content:center;
                    font-family:'Segoe UI',sans-serif;gap:2px;overflow:hidden">
          <img src="${svgRuta}"
               style="width:${mostrarEt && etiqueta ? '75%' : '90%'};
                      height:${mostrarEt && etiqueta ? '65%' : '85%'};
                      object-fit:contain;
                      filter:${filtro};
                      transition:filter .3s ease"
               draggable="false"
               onerror="this.style.display='none'">
          ${valorLabel}
          ${mostrarEt && etiqueta
            ? `<div style="font-size:9px;color:#94a3b8;text-align:center;
                           white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
                           max-width:100%;font-weight:600;line-height:1.2">${etiqueta}</div>`
            : ''}
        </div>`;
    },
  });

  console.log('[HMI] svg-widget.component registrado');
})();
