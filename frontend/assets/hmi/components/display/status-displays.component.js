/**
 * status-displays.component.js — Indicadores de display + setpoint editable.
 *
 * Incluye: setpoint, status, alarm, warning, image
 */
(function () {
  'use strict';

  // ─── setpoint ─────────────────────────────────────────────
  HMIRegistry.register({
    type:        'setpoint',
    label:       'Display Setpoint',
    icon:        '◎',
    category:    'Display',
    defaultSize: { w: 160, h: 70 },

    defaults: {
      variable:  '',
      outputVar: '',
      unit:      '',
      decimals:  1,
      min:       0,
      max:       100,
      step:      1,
      color:     '#0369a1',
      bg:        '#dbeafe',
      border:    '#3b82f6',
    },

    properties: [
      { name: 'variable',  label: 'Variable estado',  type: 'variable', group: 'General' },
      { name: 'outputVar', label: 'Variable destino', type: 'variable', group: 'General' },
      { name: 'unit',      label: 'Unidad',           type: 'text',     group: 'General' },
      { name: 'decimals',  label: 'Decimales',        type: 'number', min: 0, max: 6, group: 'General' },
      { name: 'min',       label: 'Mínimo',           type: 'number',   group: 'General' },
      { name: 'max',       label: 'Máximo',           type: 'number',   group: 'General' },
      { name: 'step',      label: 'Incremento',       type: 'number',   group: 'General' },
      { name: 'color',     label: 'Color texto',      type: 'color',    group: 'Estilo' },
      { name: 'bg',        label: 'Fondo',            type: 'color',    group: 'Estilo' },
    ],

    render(c, ctx) {
      const v   = ctx.getValue(c.variable || c.outputVar);
      const tgt = ctx.esc(c.outputVar || c.variable);
      return `<div style="
          width:100%;height:100%;background:${c.bg};border:2px solid ${c.border};
          border-radius:6px;display:flex;flex-direction:column;padding:6px;box-sizing:border-box">
        <div style="font-size:10px;color:#475569;font-weight:600">SP: ${ctx.esc(c.outputVar || '—')}</div>
        <div style="flex:1;display:flex;align-items:center;justify-content:center;gap:6px">
          <button type="button" style="width:24px;height:24px;border:1px solid #94a3b8;background:#fff;border-radius:4px;cursor:pointer;font-weight:bold"
                  onclick="window.HMIContext.write('${tgt}', Math.max(${c.min}, ${v} - ${c.step}))">−</button>
          <div style="flex:1;text-align:center;font-family:Consolas,monospace;font-size:18px;font-weight:bold;color:${c.color}">
            ${ctx.esc(ctx.formatValue(v, c))}
          </div>
          <button type="button" style="width:24px;height:24px;border:1px solid #94a3b8;background:#fff;border-radius:4px;cursor:pointer;font-weight:bold"
                  onclick="window.HMIContext.write('${tgt}', Math.min(${c.max}, ${v} + ${c.step}))">+</button>
        </div>
      </div>`;
    }
  });

  // ─── status (RUNNING/STOPPED) ─────────────────────────────
  HMIRegistry.register({
    type:        'status',
    label:       'Indicador Estado',
    icon:        '◑',
    category:    'Display',
    defaultSize: { w: 185, h: 42 },

    defaults: {
      variable:   '',
      textOn:     'RUNNING',
      textOff:    'STOPPED',
      colorOn:    '#22c55e',
      colorOff:   '#94a3b8',
    },

    properties: [
      { name: 'variable', label: 'Variable',  type: 'variable', group: 'General' },
      { name: 'textOn',   label: 'Texto ON',  type: 'text',     group: 'Estilo' },
      { name: 'textOff',  label: 'Texto OFF', type: 'text',     group: 'Estilo' },
      { name: 'colorOn',  label: 'Color ON',  type: 'color',    group: 'Estilo' },
      { name: 'colorOff', label: 'Color OFF', type: 'color',    group: 'Estilo' },
    ],

    render(c, ctx) {
      const v   = ctx.getValue(c.variable);
      const on  = v > 0;
      const col = on ? c.colorOn : c.colorOff;
      const txt = on ? c.textOn : c.textOff;
      return `<div style="
          width:100%;height:100%;background:${col};color:#fff;
          border-radius:6px;display:flex;align-items:center;justify-content:center;gap:8px;
          font-weight:bold;font-size:14px;letter-spacing:1px;
          ${on ? `box-shadow:0 0 0 3px ${col}33;` : ''}">
        <span style="width:10px;height:10px;border-radius:50%;background:#fff;display:inline-block;
                     ${on ? 'box-shadow:0 0 6px #fff' : 'opacity:0.5'}"></span>
        ${ctx.esc(txt)}
      </div>`;
    }
  });

  // ─── alarm (alarma crítica) ───────────────────────────────
  HMIRegistry.register({
    type:        'alarm',
    label:       'Indicador Alarma',
    icon:        '⚠',
    category:    'Display',
    defaultSize: { w: 220, h: 42 },

    defaults: {
      variable:  '',
      text:      'ALARMA',
      colorOn:   '#dc2626',
      colorOff:  '#f3f4f6',
      textColorOff: '#9ca3af',
    },

    properties: [
      { name: 'variable',     label: 'Variable',          type: 'variable', group: 'General' },
      { name: 'text',         label: 'Texto',             type: 'text',     group: 'Estilo' },
      { name: 'colorOn',      label: 'Color activa',      type: 'color',    group: 'Estilo' },
      { name: 'colorOff',     label: 'Color reposo',      type: 'color',    group: 'Estilo' },
      { name: 'textColorOff', label: 'Color texto reposo',type: 'color',    group: 'Estilo' },
    ],

    render(c, ctx) {
      const on = ctx.getValue(c.variable) > 0;
      const col = on ? c.colorOn : c.colorOff;
      const txtCol = on ? '#fff' : c.textColorOff;
      return `<div style="
          width:100%;height:100%;background:${col};color:${txtCol};
          border-radius:6px;display:flex;align-items:center;justify-content:center;gap:8px;
          font-weight:bold;font-size:13px;letter-spacing:1px;border:1px solid ${on ? '#7f1d1d' : '#d1d5db'};
          ${on ? 'animation: hmi-alarm-blink 0.8s infinite alternate;' : ''}">
        <span style="font-size:18px">⚠</span> ${ctx.esc(c.text || 'ALARMA')}
      </div>`;
    }
  });

  // ─── warning (aviso preventivo) ───────────────────────────
  HMIRegistry.register({
    type:        'warning',
    label:       'Indicador Aviso',
    icon:        '!',
    category:    'Display',
    defaultSize: { w: 230, h: 42 },

    defaults: {
      variable:  '',
      text:      'AVISO',
      colorOn:   '#f59e0b',
      colorOff:  '#f3f4f6',
    },

    properties: [
      { name: 'variable', label: 'Variable',     type: 'variable', group: 'General' },
      { name: 'text',     label: 'Texto',        type: 'text',     group: 'Estilo' },
      { name: 'colorOn',  label: 'Color activo', type: 'color',    group: 'Estilo' },
      { name: 'colorOff', label: 'Color reposo', type: 'color',    group: 'Estilo' },
    ],

    render(c, ctx) {
      const on = ctx.getValue(c.variable) > 0;
      const col = on ? c.colorOn : c.colorOff;
      const txtCol = on ? '#fff' : '#9ca3af';
      return `<div style="
          width:100%;height:100%;background:${col};color:${txtCol};
          border-radius:6px;display:flex;align-items:center;justify-content:center;gap:8px;
          font-weight:bold;font-size:13px;letter-spacing:1px;border:1px solid ${on ? '#92400e' : '#d1d5db'}">
        <span style="font-size:18px">⚡</span> ${ctx.esc(c.text || 'AVISO')}
      </div>`;
    }
  });

  // ─── image ────────────────────────────────────────────────
  //
  // Componente unificado: acepta imagen desde 3 orígenes:
  //   1. Subir desde este PC — abre el explorador de archivos del sistema
  //   2. Elegir del proyecto — abre la galería con las imágenes ya subidas
  //   3. URL manual (opción avanzada)
  //
  // Modelo de datos único:
  //   c.imagen = null | { id?, ruta?, nombre?, mime?, tipo: 'galeria'|'url' }
  //   c.url    = string  (legacy, se conserva si venía así)
  //
  // Retrocompat: componentes viejos con solo `c.url` renderizan como URL.
  //
  HMIRegistry.register({
    type:        'image',
    label:       'Imagen',
    icon:        '🖼',
    category:    'Display',
    defaultSize: { w: 160, h: 120 },

    defaults: {
      imagen: null,
      url:    '',
      fit:    'contain',
    },

    properties: [
      // Widget de imagen unificado — ver properties-panel.js case 'image'
      { name: 'imagen', label: 'Imagen', type: 'image', group: 'General' },
      { name: 'url',    label: 'URL manual (opcional)', type: 'text', group: 'General',
        placeholder: 'https://... — deja vacío si usas galería/PC' },
      { name: 'fit',    label: 'Ajuste', type: 'select', group: 'Estilo',
        options: ['contain','cover','fill','none'] },
    ],

    render(c, ctx) {
      // Prioridad de resolución de la fuente:
      //   1. c.imagen.ruta (galería o subida directa desde PC)
      //   2. c.url (manual)
      //   3. placeholder si no hay nada
      let src = '';
      let nombre = '';
      if (c.imagen && (c.imagen.ruta || c.imagen.serve_url || c.imagen.id)) {
        src = window.imageUrlFromObj ? window.imageUrlFromObj(c.imagen)
            : (window.imageUrl ? window.imageUrl(c.imagen.ruta) : c.imagen.ruta);
        nombre = c.imagen.nombre || '';
      } else if (c.url) {
        src = c.url;
      }

      if (!src) {
        return `<div style="width:100%;height:100%;background:#f1f5f9;border:1px dashed #cbd5e1;border-radius:6px;
                  display:flex;flex-direction:column;align-items:center;justify-content:center;color:#94a3b8;font-size:11px;gap:4px">
          <span style="font-size:24px">🖼</span>
          <span>Sin imagen — configura en el panel</span>
        </div>`;
      }
      const title = nombre ? ` title="${ctx.esc(nombre)}"` : '';
      return `<img src="${ctx.esc(src)}" alt=""${title}
              style="width:100%;height:100%;object-fit:${c.fit || 'contain'};border-radius:4px;display:block"
              onerror="this.style.display='none';this.parentNode.style.background='#fef2f2';this.parentNode.innerText='⚠ imagen no encontrada'">`;
    }
  });
})();
