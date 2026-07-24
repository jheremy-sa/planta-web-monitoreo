/**
 * selection.component.js — Componentes de selección: checkbox y dropdown.
 */
(function () {
  'use strict';

  HMIRegistry.register({
    type:        'checkbox',
    label:       'Casilla',
    icon:        '☑',
    category:    'Controles',
    defaultSize: { w: 150, h: 36 },

    defaults: {
      variable:  '',
      outputVar: '',
      text:      'Activar',
      color:     '#0f172a',
    },

    properties: [
      { name: 'variable',  label: 'Variable estado',  type: 'variable', group: 'General' },
      { name: 'outputVar', label: 'Variable destino', type: 'variable', group: 'General' },
      { name: 'text',      label: 'Texto',            type: 'text',     group: 'Estilo' },
      { name: 'color',     label: 'Color',            type: 'color',    group: 'Estilo' },
    ],

    render(c, ctx) {
      const v   = ctx.getValue(c.variable || c.outputVar);
      const on  = v > 0;
      const tgt = ctx.esc(c.outputVar || c.variable);
      return `<label style="
          width:100%;height:100%;display:flex;align-items:center;gap:8px;
          cursor:pointer;padding:0 8px;box-sizing:border-box;color:${c.color};font-size:13px">
        <input type="checkbox" ${on ? 'checked' : ''} style="width:18px;height:18px;cursor:pointer;accent-color:#3b82f6"
               onchange="window.HMIContext.write('${tgt}', this.checked ? 1 : 0)">
        ${ctx.esc(c.text || 'Activar')}
      </label>`;
    }
  });

  HMIRegistry.register({
    type:        'dropdown',
    label:       'Lista Desplegable',
    icon:        '▾',
    category:    'Controles',
    defaultSize: { w: 200, h: 44 },

    defaults: {
      outputVar: '',
      options:   'Auto,Manual,Stop',     // CSV de opciones
      values:    '0,1,2',                // CSV de valores
      color:     '#0f172a',
      bg:        '#ffffff',
    },

    properties: [
      { name: 'outputVar', label: 'Variable destino',   type: 'variable', group: 'General' },
      { name: 'options',   label: 'Opciones (CSV)',     type: 'text',     group: 'General' },
      { name: 'values',    label: 'Valores (CSV)',      type: 'text',     group: 'General' },
      { name: 'color',     label: 'Color texto',        type: 'color',    group: 'Estilo' },
      { name: 'bg',        label: 'Fondo',              type: 'color',    group: 'Estilo' },
    ],

    render(c, ctx) {
      const cur  = ctx.getValue(c.outputVar);
      const opts = (c.options || '').split(',').map(s => s.trim()).filter(Boolean);
      const vals = (c.values  || '').split(',').map(s => s.trim());
      const optsHtml = opts.map((label, i) => {
        const value = vals[i] !== undefined ? vals[i] : String(i);
        return `<option value="${ctx.esc(value)}" ${+value === cur ? 'selected' : ''}>${ctx.esc(label)}</option>`;
      }).join('');
      return `<select style="
          width:100%;height:100%;background:${c.bg};color:${c.color};
          border:1px solid #cbd5e1;border-radius:6px;padding:6px;font-size:13px;cursor:pointer"
          onchange="window.HMIContext.write('${ctx.esc(c.outputVar)}', +this.value)">
        ${optsHtml}
      </select>`;
    }
  });
})();
