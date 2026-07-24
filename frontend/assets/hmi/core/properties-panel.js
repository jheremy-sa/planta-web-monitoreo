/**
 * properties-panel.js — Panel de propiedades del editor HMI.
 *
 * DISEÑO:
 *   Estructura uniforme en TODOS los componentes:
 *
 *       ┌────────────────────────────────────────────┐
 *       │  GENERAL │ GEOMETRÍA │ ESTILO │ ALARMAS    │  ← 4 pestañas fijas
 *       ├────────────────────────────────────────────┤
 *       │  (campos del grupo activo)                 │
 *       └────────────────────────────────────────────┘
 *
 *   Las 4 pestañas existen SIEMPRE, sin importar el tipo de objeto.
 *   La pestaña ALARMAS también existe para todos: muestra el checkbox
 *   "Activar Alarmas" y los 6 niveles (HH/H/OH/OL/L/LL). Si el componente
 *   no soporta alarmas (botón, forma geométrica, etc.) esos inputs siguen
 *   visibles pero deshabilitados, preservando la consistencia visual.
 *
 *   Las propiedades específicas de cada componente se mezclan con las
 *   comunes según su atributo `group`.
 *
 * CORRECCIÓN CRÍTICA DE FOCO:
 *
 *   El panel SOLO se reconstruye al cambiar de selección — NUNCA al
 *   editar propiedades. Esto evita:
 *     - pérdida de foco mientras se escribe
 *     - cierre prematuro del color picker
 *     - parpadeos / re-renderizados agresivos
 *
 *   Cuando un cambio externo modifica el componente (drag en canvas,
 *   undo/redo) solo se actualizan los `value` de los inputs sin tocar
 *   el resto del DOM, y NUNCA el input que tiene foco.
 *
 *   Los campos con `disabled` dinámico (como los 6 umbrales de alarma)
 *   se habilitan/deshabilitan vía atributo, no re-renderizando el panel.
 */
(function () {
  'use strict';

  /** Pestaña activa (se preserva entre selecciones). */
  let _activeTab = 'General';

  /** ID del componente que está renderizado en el panel. */
  let _renderedComponentId = null;

  /**
   * PROPIEDADES COMUNES — presentes para CUALQUIER componente.
   * Garantizan que las 4 pestañas existan siempre con campos significativos.
   */
  const COMMON_PROPS = [
    // ─── GENERAL ───
    { name: 'label',   label: 'Etiqueta',  type: 'text',     group: 'General' },
    { name: 'tag',     label: 'Tag',       type: 'text',     group: 'General' },
    { name: 'visible', label: 'Visible',   type: 'checkbox', group: 'General' },
    { name: 'locked',  label: 'Bloqueado', type: 'checkbox', group: 'General' },

    // ─── GEOMETRÍA ───
    { name: 'x',       label: 'Posición X (px)', type: 'number', group: 'Geometría' },
    { name: 'y',       label: 'Posición Y (px)', type: 'number', group: 'Geometría' },
    { name: 'w',       label: 'Ancho',           type: 'number', group: 'Geometría' },
    { name: 'h',       label: 'Alto',            type: 'number', group: 'Geometría' },
    { name: 'rot',     label: 'Rotación (°)',    type: 'number', min: -360, max: 360, group: 'Geometría' },
    { name: 'opacity', label: 'Opacidad (%)',    type: 'number', min: 0, max: 100, group: 'Geometría' },
    { name: 'z',       label: 'Capa (z-index)',  type: 'number', group: 'Geometría' },

    // ─── ALARMAS (siempre presente) ───
    { name: 'alarmsEnabled', label: 'Activar Alarmas', type: 'checkbox', group: 'Alarmas' },
    { name: 'hh',   label: 'Alto-Alto (HH)',       type: 'number', group: 'Alarmas', disabled: c => !c.alarmsEnabled },
    { name: 'hi',   label: 'Alto (H)',             type: 'number', group: 'Alarmas', disabled: c => !c.alarmsEnabled },
    { name: 'opHi', label: 'Rango Operativo Alto', type: 'number', group: 'Alarmas', disabled: c => !c.alarmsEnabled },
    { name: 'opLo', label: 'Rango Operativo Bajo', type: 'number', group: 'Alarmas', disabled: c => !c.alarmsEnabled },
    { name: 'lo',   label: 'Bajo (L)',             type: 'number', group: 'Alarmas', disabled: c => !c.alarmsEnabled },
    { name: 'll',   label: 'Bajo-Bajo (LL)',       type: 'number', group: 'Alarmas', disabled: c => !c.alarmsEnabled },

    // ─── PERMISOS (Entrega C2) ───
    // Ambos arrays de int (id_rol). Vacío = sin restricción.
    { name: 'viewRoles',   label: 'Roles que pueden VER este componente',      type: 'roles', group: 'Permisos' },
    { name: 'actionRoles', label: 'Roles que pueden ACTUAR (click, escritura)', type: 'roles', group: 'Permisos' },
    { name: 'groupId',     label: 'ID de grupo',                                 type: 'text',  group: 'Permisos' },
  ];

  /** Orden FIJO de las pestañas. */
  const TAB_ORDER = ['General', 'Geometría', 'Estilo', 'Alarmas', 'Permisos'];

  /**
   * Renderiza el panel completo. Solo se llama al cambiar la selección.
   */
  function render() {
    const container = document.getElementById('propsPanel');
    if (!container) return;
    try {
      renderInternal(container);
    } catch (e) {
      console.error('[HMIPropsPanel/render]', e);
      // Mostrar un panel de error legible en lugar de dejar el panel en estado inválido
      container.innerHTML = `<div class="props-empty" style="color:#dc2626">
        <b><i class="fa-solid fa-triangle-exclamation"></i> Error al mostrar el panel</b><br>
        <small>${(e && e.message) ? String(e.message).replace(/[<>&]/g, m => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[m])) : ''}</small><br>
        <small style="color:#94a3b8">Selecciona otro objeto y vuelve para reintentar.</small>
      </div>`;
      _renderedComponentId = null;
    }
  }
  function renderInternal(container) {
    const c = window.HMIState.getSelected();
    if (!c) {
      container.innerHTML = `<div class="props-empty">
        <i>Selecciona un componente del lienzo para ver sus propiedades.</i>
      </div>`;
      _renderedComponentId = null;
      return;
    }
    _renderedComponentId = c.id;
    const def = window.HMIRegistry.get(c.type) || {};

    // Propiedades específicas del componente — sin duplicar las comunes
    const commonNames = new Set(COMMON_PROPS.map(p => p.name));
    const specific = (def.properties || []).filter(p => !commonNames.has(p.name));
    const allProps = COMMON_PROPS.concat(specific);

    // Agrupar
    const grouped = { General: [], 'Geometría': [], Estilo: [], Alarmas: [], Permisos: [] };
    allProps.forEach(p => {
      const g = p.group || 'General';
      if (!grouped[g]) grouped[g] = [];
      grouped[g].push(p);
    });

    // Pestañas: siempre las 4 + cualquier extra (ej. 'Avanzado')
    const extra = Object.keys(grouped).filter(g => !TAB_ORDER.includes(g));
    const tabs  = TAB_ORDER.concat(extra);
    if (!tabs.includes(_activeTab)) _activeTab = 'General';

    container.innerHTML = `
      <div class="props-header">
        <b>${escAttr(def.label || c.type)}</b>
        <span class="props-id">#${escAttr(c.id)}</span>
      </div>
      <div class="props-tabs">
        ${tabs.map(t => `
          <button type="button" class="props-tab ${t === _activeTab ? 'active' : ''}"
                  data-tab="${escAttr(t)}">${escAttr(t)}</button>
        `).join('')}
      </div>
      <div class="props-tab-body" id="props-tab-body">
        ${renderTabContent(grouped, _activeTab, c)}
      </div>`;

    // Click en pestaña: solo cambia el cuerpo, no re-renderiza todo
    container.querySelectorAll('.props-tab').forEach(tabBtn => {
      tabBtn.addEventListener('click', () => {
        _activeTab = tabBtn.dataset.tab;
        container.querySelectorAll('.props-tab').forEach(t =>
          t.classList.toggle('active', t.dataset.tab === _activeTab));
        const body = document.getElementById('props-tab-body');
        if (body) {
          body.innerHTML = renderTabContent(grouped, _activeTab, c);
          bindInputs(container, c);
        }
      });
    });

    bindInputs(container, c);
  }

  /** Construye el HTML del cuerpo de una pestaña. */
  function renderTabContent(grouped, tabName, c) {
    const props = grouped[tabName] || [];
    if (!props.length) {
      return `<div class="props-empty-tab">
        <i class="fa-solid fa-info-circle"></i>
        Este componente no expone propiedades de <b>${escAttr(tabName)}</b>.
      </div>`;
    }
    return props.map(p => buildField(p, c)).join('');
  }

  /** Construye el input para una propiedad. */
  function buildField(p, c) {
    const v = c[p.name];
    const lbl = `<label>${escAttr(p.label)}</label>`;
    const isDisabled = (typeof p.disabled === 'function') ? !!p.disabled(c) : !!p.disabled;
    const disAttr = isDisabled ? 'disabled' : '';
    const prCls = isDisabled ? 'pr pr-disabled' : 'pr';

    switch (p.type) {
      case 'number':
        return `<div class="${prCls}">${lbl}
          <input type="number" data-prop="${p.name}" value="${v ?? 0}" ${disAttr}
            ${p.min !== undefined ? `min="${p.min}"` : ''}
            ${p.max !== undefined ? `max="${p.max}"` : ''}
            ${p.step !== undefined ? `step="${p.step}"` : ''}>
        </div>`;
      case 'color':
        return `<div class="${prCls}">${lbl}
          <input type="color" data-prop="${p.name}" ${disAttr}
            value="${(v && String(v)[0] === '#') ? v : '#ffffff'}">
        </div>`;
      case 'checkbox':
        return `<div class="${prCls}">${lbl}
          <input type="checkbox" data-prop="${p.name}" ${disAttr} ${v ? 'checked' : ''}>
        </div>`;
      case 'select':
        return `<div class="${prCls}">${lbl}
          <select data-prop="${p.name}" ${disAttr}>
            ${(p.options || []).map(o => {
              const val = (typeof o === 'object') ? o.value : o;
              const txt = (typeof o === 'object') ? o.label : o;
              return `<option value="${escAttr(val)}" ${v === val ? 'selected' : ''}>${escAttr(txt)}</option>`;
            }).join('')}
          </select>
        </div>`;
      case 'variable': {
        // Filtrado por contexto:
        //   - Si el nombre de la property es 'outputVar' O la spec declara
        //     writeOnly:true, solo se listan variables READ_WRITE (una
        //     entrada digital/analógica del PLC NO puede asociarse a un
        //     botón de mando — se rechaza a nivel UI).
        //   - Para lectura (variable, sensorVar, etc.), se listan TODAS
        //     con un icono 🔒 en las READ_ONLY para dejarlo visualmente claro.
        const soloEscribibles = p.name === 'outputVar' || p.writeOnly === true;
        const todas = window.HMIContext.variables();
        const filtradas = soloEscribibles
          ? todas.filter(vr => (vr.lectura_escritura || 'READ_WRITE') === 'READ_WRITE')
          : todas;
        // ¿El valor actual es una variable READ_ONLY? Si es outputVar, hay que
        // advertir (el usuario la seleccionó antes de que existiera el filtro)
        const varActual = todas.find(vr => (vr.nombre_variable || vr.nombre) === v);
        const varActualEsRO = varActual && varActual.lectura_escritura === 'READ_ONLY';
        const warning = (soloEscribibles && varActualEsRO)
          ? `<div style="margin-top:4px;padding:6px 8px;background:#fef2f2;color:#991b1b;
              font-size:11px;border-left:3px solid #dc2626;border-radius:3px">
              <b>⚠ Variable de solo lectura</b>: <code>${escAttr(v)}</code> es de solo lectura
              y no puede usarse para escritura. Elige otra variable de mando (M-bit).
             </div>` : '';
        return `<div class="${prCls}">${lbl}
          <select data-prop="${p.name}" ${disAttr}>
            <option value="">— ninguna —</option>
            ${filtradas.map(vr => {
              const n = vr.nombre_variable || vr.nombre;
              const ro = vr.lectura_escritura === 'READ_ONLY';
              // El emoji 🔒 dentro del texto de <option> es visible en todos los navegadores
              return `<option value="${escAttr(n)}" ${v === n ? 'selected' : ''}>${ro ? '🔒 ' : ''}${escAttr(n)}</option>`;
            }).join('')}
            ${(soloEscribibles && varActualEsRO)
              ? `<option value="${escAttr(v)}" selected>🔒 ${escAttr(v)} (solo lectura — inválida)</option>` : ''}
          </select>
          ${warning}
        </div>`;
      }
      case 'textarea':
        return `<div class="${prCls}">${lbl}
          <textarea data-prop="${p.name}" rows="3" ${disAttr}>${escAttr(v || '')}</textarea>
        </div>`;
      case 'image': {
        // Widget unificado de imagen con dos flujos claros:
        //   [Subir desde este PC]  → input file oculto → api/imagenes.php
        //   [Elegir del proyecto]  → modal HMIGaleriaPicker
        // Preview grande si hay imagen actual; botón "Quitar" para clearear.
        const val = (typeof v === 'object' && v !== null) ? v : null;
        const hasImagen = val && val.ruta;
        const preview = hasImagen
          ? `<img src="${escAttr(window.imageUrlFromObj ? window.imageUrlFromObj(val) : (window.imageUrl ? window.imageUrl(val.ruta) : val.ruta))}" alt=""
                 style="max-width:100%;max-height:120px;border:1px solid #e2e8f0;
                        border-radius:4px;background:#f8fafc;display:block;margin:0 auto">`
          : `<div style="height:80px;background:#f8fafc;border:1px dashed #cbd5e1;
                         border-radius:4px;display:flex;flex-direction:column;align-items:center;
                         justify-content:center;color:#94a3b8;font-size:11px;gap:4px">
              <i class="fa-solid fa-image" style="font-size:24px"></i>
              <span>Sin imagen — usa los botones de abajo</span>
             </div>`;
        const nombre = hasImagen
          ? `<div style="font-size:10px;color:#64748b;margin-top:4px;text-align:center;
                         overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
                  title="${escAttr(val.nombre || '')}">
              <i class="fa-solid fa-file-image"></i> ${escAttr(val.nombre || 'imagen')}
             </div>`
          : '';
        return `<div class="${prCls}" data-prop-image="${p.name}">${lbl}
          ${preview}
          ${nombre}
          <div style="display:flex;flex-direction:column;gap:6px;margin-top:8px">
            <button type="button" class="pr-img-upload" data-prop-target="${p.name}"
                    style="padding:8px 12px;background:#3b82f6;color:#fff;border:none;
                           border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;
                           display:flex;align-items:center;justify-content:center;gap:6px">
              <i class="fa-solid fa-upload"></i> Insertar imagen desde este PC
            </button>
            <button type="button" class="pr-img-choose" data-prop-target="${p.name}"
                    style="padding:8px 12px;background:#22c55e;color:#fff;border:none;
                           border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;
                           display:flex;align-items:center;justify-content:center;gap:6px">
              <i class="fa-solid fa-folder-open"></i> Elegir del proyecto
            </button>
            ${hasImagen ? `<button type="button" class="pr-img-clear" data-prop-target="${p.name}"
                    style="padding:6px 12px;background:transparent;color:#ef4444;border:1px solid #fecaca;
                           border-radius:6px;cursor:pointer;font-size:11px;font-weight:600">
              <i class="fa-solid fa-xmark"></i> Quitar imagen
            </button>` : ''}
            <input type="file" class="pr-img-file" data-prop-target="${p.name}"
                   accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
                   style="display:none">
          </div>
        </div>`;
      }
      case 'series': {
        // Editor multi-variable con selectores de las variables del proyecto.
        //   v = [{ variable, color?, visible?, label?, orden? }, ...]
        // options del prop:
        //   showColor    → color-picker por variable (Trend, BarChart)
        //   showVisible  → checkbox mostrar/ocultar (Trend)
        //   showLabel    → input de label personalizado
        //   showOrder    → botones reordenar (default true)
        const opciones    = p.options || {};
        const showColor   = opciones.showColor   !== false;
        const showVisible = opciones.showVisible !== false;
        const showLabel   = opciones.showLabel   !== false;
        const showOrder   = opciones.showOrder   !== false;
        // Filtro defensivo: solo items que son objetos (evita crash si el
        // array llegó con null/undefined/strings por bugs de otro código)
        const arr = (Array.isArray(v) ? v : [])
          .map(s => (s && typeof s === 'object') ? s : {})
          .slice(0, 20);   // límite razonable — evita OOM si el array creció raro

        // Variables del proyecto (inyectadas por HMIState.setVars desde el poll)
        const vars = window.HMIState && typeof window.HMIState.allVars === 'function'
          ? window.HMIState.allVars() : [];

        const DEFAULT_COLORS = ['#3b82f6','#f59e0b','#22c55e','#ef4444',
                                '#a855f7','#06b6d4','#84cc16','#ec4899'];

        // Helper: opciones del select con la variable seleccionada marcada
        // (evita el bug del `.replace` frágil de la versión anterior).
        function buildOptions(selectedName) {
          let out = `<option value="">— Selecciona una variable —</option>`;
          for (const vv of vars) {
            const name = vv.nombre_variable;
            const isSel = name === selectedName ? ' selected' : '';
            out += `<option value="${escAttr(name)}"${isSel}>${escAttr(name)}</option>`;
          }
          // Si la variable guardada NO existe en el proyecto actual, mostrarla como
          // opción huérfana (roja) para que el usuario pueda cambiarla
          if (selectedName && !vars.some(vv => vv.nombre_variable === selectedName)) {
            out += `<option value="${escAttr(selectedName)}" selected>⚠ ${escAttr(selectedName)} (no existe)</option>`;
          }
          return out;
        }

        // Construir filas
        const rows = arr.map((s, i) => {
          const varSel  = s.variable || '';
          const col     = s.color   || DEFAULT_COLORS[i % DEFAULT_COLORS.length];
          const visible = s.visible !== false;
          const lbl     = s.label   || '';
          const emptyCls = varSel ? '' : ' empty';

          const btnUp = (showOrder && i > 0)
            ? `<button type="button" class="series-btn series-up" data-prop="${p.name}" data-idx="${i}" title="Mover arriba">▲</button>` : '';
          const btnDown = (showOrder && i < arr.length - 1)
            ? `<button type="button" class="series-btn series-down" data-prop="${p.name}" data-idx="${i}" title="Mover abajo">▼</button>` : '';
          const btnRm = `<button type="button" class="series-btn rm series-remove" data-prop="${p.name}" data-idx="${i}" title="Eliminar variable">✕</button>`;

          const colorCtrl = showColor ? `
            <span class="series-color-wrap">
              <input type="color" class="series-color-input series-color"
                     data-prop="${p.name}" data-idx="${i}" value="${col}">
              Color
            </span>` : '';
          const visibleCtrl = showVisible ? `
            <label class="series-visible-wrap">
              <input type="checkbox" class="series-visible"
                     data-prop="${p.name}" data-idx="${i}" ${visible ? 'checked' : ''}>
              Visible
            </label>` : '';
          const labelCtrl = showLabel ? `
            <input type="text" class="series-label-input series-label"
                   data-prop="${p.name}" data-idx="${i}"
                   value="${escAttr(lbl)}" placeholder="Etiqueta (opcional)">` : '';

          return `<div class="series-row" data-idx="${i}">
            <div class="series-row-header">
              <span>Variable ${i + 1}</span>
              <div class="series-row-actions">${btnUp}${btnDown}${btnRm}</div>
            </div>
            <select class="series-row-select series-var${emptyCls}"
                    data-prop="${p.name}" data-idx="${i}">
              ${buildOptions(varSel)}
            </select>
            <div class="series-row-controls">
              ${colorCtrl}${visibleCtrl}${labelCtrl}
            </div>
          </div>`;
        }).join('');

        const empty = arr.length === 0 ? `
          <div class="series-empty">
            <i class="fa-solid fa-chart-line"></i>
            Aún no hay variables asociadas.<br>
            Haz click en "Agregar variable" para empezar.
          </div>` : '';

        return `<div class="${prCls}" data-prop-series-wrap="${p.name}">${lbl}
          <div class="series-editor">
            ${empty}${rows}
            <button type="button" class="series-add-btn series-add" data-prop="${p.name}">
              <i class="fa-solid fa-plus"></i> Agregar variable
            </button>
          </div>
        </div>`;
      }
      case 'roles': {
        // Multi-select de roles (para viewRoles / actionRoles).
        // El valor es un array de ints (id_rol). Los 5 roles son fijos.
        const seleccionados = new Set((Array.isArray(v) ? v : []).map(x => +x));
        const ROLES = [
          { id: 1, label: 'Administrador' },
          { id: 2, label: 'Diseñador' },
          { id: 3, label: 'Jefe de Proyecto' },
          { id: 4, label: 'Supervisor' },
          { id: 5, label: 'Operador' },
        ];
        const chips = ROLES.map(r => {
          const on = seleccionados.has(r.id);
          return `<label class="pr-role-chip" style="display:inline-flex;align-items:center;gap:4px;
                        padding:2px 8px;margin:2px 3px 2px 0;border-radius:12px;font-size:11px;cursor:pointer;
                        background:${on ? '#3b82f6' : '#f1f5f9'};color:${on ? '#fff' : '#475569'};
                        border:1px solid ${on ? '#3b82f6' : '#cbd5e1'};transition:all 0.12s">
              <input type="checkbox" data-prop-role="${p.name}" data-role-id="${r.id}"
                     ${on ? 'checked' : ''} style="display:none">
              ${r.label}
            </label>`;
        }).join('');
        const hint = seleccionados.size === 0
          ? `<div style="font-size:10px;color:#94a3b8;margin-top:4px">
              <i class="fa-solid fa-globe"></i> Sin restricción — todos los roles pueden acceder
            </div>`
          : `<div style="font-size:10px;color:#0369a1;margin-top:4px">
              <i class="fa-solid fa-shield-halved"></i> Solo ${seleccionados.size} rol${seleccionados.size !== 1 ? 'es' : ''}
              tendrá${seleccionados.size !== 1 ? 'n' : ''} acceso
            </div>`;
        return `<div class="${prCls}" data-prop-roles-wrap="${p.name}">${lbl}
          <div style="line-height:1.8">${chips}</div>
          ${hint}
        </div>`;
      }
      case 'text':
      default:
        return `<div class="${prCls}">${lbl}
          <input type="text" data-prop="${p.name}" value="${escAttr(v ?? '')}" ${disAttr}>
        </div>`;
    }
  }

  /**
   * Engancha los listeners a cada input. La actualización del componente
   * dispara componentChanged pero el panel NO se subscribe a ese evento
   * para auto-reconstruirse: la única reconstrucción ocurre en
   * selectionChanged. Así se preserva el foco.
   */
  function bindInputs(container, c) {
    container.querySelectorAll('[data-prop]').forEach(input => {
      const tag = input.tagName.toLowerCase();
      const t   = input.type;
      const useInputEvent = (t === 'text' || t === 'number' || tag === 'textarea');

      // 'input' = mientras se teclea (text/number/textarea)
      // 'change' = al confirmar (color/select/checkbox + final de text/number)
      const liveEvent = useInputEvent ? 'input' : 'change';

      input.addEventListener(liveEvent, () => {
        const name = input.dataset.prop;
        let value;
        if (input.type === 'checkbox')      value = input.checked;
        else if (input.type === 'number')   value = (input.value === '' ? 0 : +input.value);
        else                                value = input.value;

        // Actualizar el componente. Esto dispara componentChanged en el
        // estado, pero NUESTRO panel no reacciona a ese evento — el resto
        // del editor sí (renderer, handles).
        window.HMIState.updateComponent(c.id, name, value);

        // Caso especial: el checkbox de alarmas controla `disabled` de los
        // 6 umbrales. Lo aplicamos sin re-render.
        if (name === 'alarmsEnabled') {
          applyAlarmsDisabled(container, !!value);
        }

        // Si la prop afecta visual (geometría), refrescar el wrapper
        if (['x','y','w','h','rot','opacity','visible','z'].includes(name)) {
          window.HMIRenderer.updateComponent(c);
        }
      });

      // Para text/number, agregar undo al confirmar (no en cada tecla)
      if (useInputEvent) {
        let snapshotBefore = c[input.dataset.prop];
        input.addEventListener('focus', () => { snapshotBefore = c[input.dataset.prop]; });
        input.addEventListener('change', () => {
          // El valor ya está actualizado por el 'input'. Empujamos al undo
          // solo si realmente cambió respecto al snapshot del focus.
          if (c[input.dataset.prop] !== snapshotBefore) {
            // Insertamos una entrada de undo *con el valor anterior*
            const cur = window.HMIState._raw.components.map(x => Object.assign({}, x));
            // Restauramos temporalmente, pusheamos, restauramos
            // (alternativa más simple: empujar al inicio del focus)
            // Para evitar complejidad, hacemos un push del estado actual.
            window.HMIState.pushUndo();
          }
        });
      } else {
        // checkbox/color/select: pushUndo en cada cambio
        input.addEventListener('change', () => {
          window.HMIState.pushUndo();
        });
      }
    });

    // ═══ Botones del campo tipo 'image' ══════════════════════════════════
    // "Elegir imagen…" abre HMIGaleriaPicker; "Quitar" limpia el valor.
    container.querySelectorAll('.pr-img-choose').forEach(btn => {
      btn.addEventListener('click', (ev) => {
        ev.preventDefault();
        const propName = btn.dataset.propTarget;
        if (!window.HMIGaleriaPicker || typeof window.HMIGaleriaPicker.open !== 'function') {
          alert('Galería no disponible (asegúrate de cargar galeria-picker.js)');
          return;
        }
        // hmi_avanzado.php inyecta window.ID_PROY con el id del proyecto activo
        const idProy = window.ID_PROY || null;
        window.HMIGaleriaPicker.open({
          id_proyecto: idProy,
          currentValue: c[propName] || null,
          onSelect: (img) => {
            window.HMIState.pushUndo();
            window.HMIState.updateComponent(c.id, propName, img);
            window.HMIState.setSelection([c.id]);   // fuerza re-render del panel
          },
        });
      });
    });
    container.querySelectorAll('.pr-img-clear').forEach(btn => {
      btn.addEventListener('click', (ev) => {
        ev.preventDefault();
        const propName = btn.dataset.propTarget;
        window.HMIState.pushUndo();
        window.HMIState.updateComponent(c.id, propName, null);
        window.HMIState.setSelection([c.id]);
      });
    });

    // ═══ Subir imagen desde este PC ═════════════════════════════════════
    // Click en "Subir desde este PC" → dispara el input file oculto → sube
    // directo via api/imagenes.php sin abrir el modal picker.
    container.querySelectorAll('.pr-img-upload').forEach(btn => {
      btn.addEventListener('click', (ev) => {
        ev.preventDefault();
        const propName = btn.dataset.propTarget;
        const fileInput = container.querySelector(`.pr-img-file[data-prop-target="${propName}"]`);
        if (fileInput) fileInput.click();
      });
    });
    container.querySelectorAll('.pr-img-file').forEach(input => {
      input.addEventListener('change', async (ev) => {
        const file = ev.target.files[0];
        if (!file) return;
        const propName = input.dataset.propTarget;

        // Validaciones rápidas cliente
        if (file.size > 5 * 1024 * 1024) {
          alert('Archivo demasiado grande (máx. 5 MB)');
          ev.target.value = '';
          return;
        }
        if (!/^image\//.test(file.type) && !/\.svg$/i.test(file.name)) {
          alert('Tipo no permitido — solo imágenes (PNG, JPG, GIF, WebP, SVG)');
          ev.target.value = '';
          return;
        }

        // Preguntar nombre (el usuario puede aceptar el del archivo o escribir uno)
        const propuesta = window.prompt(
          'Nombre para esta imagen dentro del proyecto (deja el valor si quieres usar el original):',
          file.name
        );
        if (propuesta === null) {   // cancelado
          ev.target.value = '';
          return;
        }
        const nombreFinal = propuesta.trim() || file.name;

        // Feedback visual
        const wrapper = container.querySelector(`[data-prop-image="${propName}"]`);
        const btnUpload = wrapper && wrapper.querySelector('.pr-img-upload');
        const originalHtml = btnUpload ? btnUpload.innerHTML : '';
        if (btnUpload) {
          btnUpload.disabled = true;
          btnUpload.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Subiendo...';
        }

        // Upload via api/imagenes.php
        const idProy = window.ID_PROY || 0;
        const fd = new FormData();
        fd.append('archivo', file);
        fd.append('id_proyecto', String(idProy));
        fd.append('csrf_token', window.CSRF_TOKEN || '');
        if (nombreFinal !== file.name) fd.append('nombre_personalizado', nombreFinal);
        try {
          const r = await fetch('api/imagenes.php?action=upload', {
            method: 'POST', body: fd
          });
          const d = await r.json();
          if (!d.ok) {
            alert('Error al subir: ' + (d.msg || 'desconocido'));
          } else {
            // Guardar en la propiedad del componente
            window.HMIState.pushUndo();
            window.HMIState.updateComponent(c.id, propName, {
              id: d.id_imagen,
              ruta: d.ruta,
              serve_url: d.serve_url || null,
              nombre: d.nombre || file.name,
              mime: d.mime || file.type,
            });
            window.HMIState.setSelection([c.id]);
          }
        } catch (e) {
          alert('Error de red: ' + e.message);
        } finally {
          if (btnUpload) {
            btnUpload.disabled = false;
            btnUpload.innerHTML = originalHtml;
          }
          ev.target.value = '';   // permite subir el mismo archivo otra vez si borra
        }
      });
    });

    // ═══ Editor de series multi-variable (campo tipo 'series') ══════════
    //
    // Diseño clave: NO re-renderizamos el panel de propiedades entero al
    // añadir/quitar/reordenar filas — solo la sección del editor de series.
    // Esto elimina la clase de bugs donde otros inputs del panel pierden
    // estado, y evita el "aparece y desaparece" reportado.
    //
    // Los cambios de valor (variable, color, visible, label) mutan el
    // estado del componente sin re-renderizar nada — el input ya muestra
    // el valor correcto que el usuario eligió.
    // ═══════════════════════════════════════════════════════════════════

    /** Redibuja solo el <div class="series-editor"> de una prop dada. */
    function redrawSeriesEditor(propName) {
      // Buscar el wrapper del prop
      const wrap = container.querySelector(`[data-prop-series-wrap="${propName}"]`);
      if (!wrap) return;
      // Buscar la spec de la property y reconstruir el widget desde ella
      const def = window.HMIRegistry.get(c.type);
      const prop = (def.properties || []).find(pp => pp.name === propName);
      if (!prop) return;
      const html = buildField(prop, c);
      // Reemplazamos el wrap completo por el nuevo
      const tmp = document.createElement('div');
      tmp.innerHTML = html;
      const nuevo = tmp.firstElementChild;
      if (nuevo) {
        wrap.replaceWith(nuevo);
        // Rebindear los handlers de esta prop (solo dentro del contenedor padre)
        bindSeriesHandlers(nuevo.parentElement || container);
      }
    }

    /** Muta el array de series y redraws el editor local. */
    function seriesUpdate(propName, mutator) {
      const current = Array.isArray(c[propName]) ? [...c[propName]] : [];
      const next = mutator(current);
      window.HMIState.pushUndo();
      window.HMIState.updateComponent(c.id, propName, next);
      redrawSeriesEditor(propName);
    }

    /**
     * Registra los listeners de todos los controles del editor de series
     * dentro de un contenedor. Puede llamarse repetidas veces sin duplicar
     * porque siempre trabajamos sobre elementos nuevos tras redraw.
     */
    function bindSeriesHandlers(root) {
      // + Agregar nueva variable
      root.querySelectorAll('.series-add').forEach(btn => {
        if (btn._bound) return; btn._bound = true;
        btn.addEventListener('click', (ev) => {
          ev.preventDefault();
          const propName = btn.dataset.prop;
          const DEFAULT_COLORS = ['#3b82f6','#f59e0b','#22c55e','#ef4444',
                                  '#a855f7','#06b6d4','#84cc16','#ec4899'];
          seriesUpdate(propName, arr => arr.concat([{
            variable: '',
            color:    DEFAULT_COLORS[arr.length % 8],
            visible:  true,
            label:    '',
          }]));
        });
      });
      // ✕ Eliminar
      root.querySelectorAll('.series-remove').forEach(btn => {
        if (btn._bound) return; btn._bound = true;
        btn.addEventListener('click', (ev) => {
          ev.preventDefault();
          const propName = btn.dataset.prop;
          const idx = +btn.dataset.idx;
          seriesUpdate(propName, arr => arr.filter((_, i) => i !== idx));
        });
      });
      // ▲ Mover arriba
      root.querySelectorAll('.series-up').forEach(btn => {
        if (btn._bound) return; btn._bound = true;
        btn.addEventListener('click', (ev) => {
          ev.preventDefault();
          const propName = btn.dataset.prop;
          const idx = +btn.dataset.idx;
          seriesUpdate(propName, arr => {
            if (idx <= 0) return arr;
            const copy = arr.slice();
            [copy[idx - 1], copy[idx]] = [copy[idx], copy[idx - 1]];
            return copy;
          });
        });
      });
      // ▼ Mover abajo
      root.querySelectorAll('.series-down').forEach(btn => {
        if (btn._bound) return; btn._bound = true;
        btn.addEventListener('click', (ev) => {
          ev.preventDefault();
          const propName = btn.dataset.prop;
          const idx = +btn.dataset.idx;
          seriesUpdate(propName, arr => {
            if (idx >= arr.length - 1) return arr;
            const copy = arr.slice();
            [copy[idx], copy[idx + 1]] = [copy[idx + 1], copy[idx]];
            return copy;
          });
        });
      });
      // Cambios de valor (variable / color / visible / label)
      // - series-var, series-color, series-visible: 'change' — un evento por cambio
      //   El color-picker abre dialog nativo; 'change' dispara UNA vez cuando el
      //   usuario confirma. NO usamos 'input' para color: dispararía docenas de
      //   veces al arrastrar el picker, saturaría el pipeline y con el <input type=color>
      //   nativo puede causar el problema reportado ("el objeto se reinicia").
      // - series-label: 'input' con debounce del undo (1 push por sesión de tecleo)
      const _labelTimer = new WeakMap();
      const commitField = (input) => {
        // Envuelto en try/catch: si algo falla no debe romper el editor
        try {
          const propName = input.dataset.prop;
          const idx = Number.parseInt(input.dataset.idx, 10);
          if (!Number.isInteger(idx) || idx < 0) return;   // guardarraíl
          const cur = window.HMIState.getComponent(c.id);
          if (!cur) return;
          // Lee el estado ACTUAL del componente (no del scope viejo)
          const currentArr = Array.isArray(cur[propName]) ? cur[propName].slice() : [];
          // Extender si es necesario
          while (currentArr.length <= idx) currentArr.push({});
          // Clonar el item para no mutar refs shared
          const item = { ...(currentArr[idx] || {}) };
          if (input.classList.contains('series-var')) {
            item.variable = input.value;
            input.classList.toggle('empty', !input.value);
          } else if (input.classList.contains('series-color')) {
            item.color = input.value;
          } else if (input.classList.contains('series-visible')) {
            item.visible = input.checked;
          } else if (input.classList.contains('series-label')) {
            item.label = input.value;
          }
          currentArr[idx] = item;
          window.HMIState.pushUndo();
          window.HMIState.updateComponent(cur.id, propName, currentArr);
        } catch (e) {
          console.error('[HMISeries/commitField]', e);
        }
      };
      root.querySelectorAll('.series-var').forEach(sel => {
        if (sel._bound) return; sel._bound = true;
        sel.addEventListener('change', () => commitField(sel));
      });
      root.querySelectorAll('.series-color').forEach(inp => {
        if (inp._bound) return; inp._bound = true;
        // SOLO 'change' — dispara una vez al cerrar el picker, no al arrastrar
        inp.addEventListener('change', () => commitField(inp));
      });
      root.querySelectorAll('.series-visible').forEach(inp => {
        if (inp._bound) return; inp._bound = true;
        inp.addEventListener('change', () => commitField(inp));
      });
      root.querySelectorAll('.series-label').forEach(inp => {
        if (inp._bound) return; inp._bound = true;
        // Label usa 'input' con debounce de 250ms para el pushUndo
        inp.addEventListener('input', () => {
          commitField(inp);
          clearTimeout(_labelTimer.get(inp));
          _labelTimer.set(inp, setTimeout(() => _labelTimer.delete(inp), 250));
        });
      });
    }

    // Bind inicial
    bindSeriesHandlers(container);

    // ═══ Checkboxes de rol (campo tipo 'roles') ═════════════════════════
    // Los chips clickeables contienen un <input type=checkbox> oculto.
    // Al alternarlo, actualizamos el array del componente con los ids activos.
    container.querySelectorAll('[data-prop-role]').forEach(input => {
      input.addEventListener('change', () => {
        const propName = input.dataset.propRole;
        // Recolectar TODOS los checkboxes del mismo prop y armar array
        const seleccionados = Array.from(
          container.querySelectorAll(`[data-prop-role="${propName}"]`)
        ).filter(i => i.checked).map(i => +i.dataset.roleId);
        window.HMIState.pushUndo();
        window.HMIState.updateComponent(c.id, propName, seleccionados);
        window.HMIState.setSelection([c.id]);   // rerender del panel para actualizar hint
      });
    });
  }

  /**
   * Habilita/deshabilita los 6 inputs de umbrales en la pestaña Alarmas
   * sin reconstruir el DOM.
   */
  function applyAlarmsDisabled(container, alarmsOn) {
    ['hh','hi','opHi','opLo','lo','ll'].forEach(name => {
      const inp = container.querySelector(`[data-prop="${name}"]`);
      if (!inp) return;
      inp.disabled = !alarmsOn;
      const pr = inp.closest('.pr');
      if (pr) pr.classList.toggle('pr-disabled', !alarmsOn);
    });
  }

  function escAttr(s) {
    return String(s ?? '').replace(/[&<>"]/g, m => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'
    }[m]));
  }

  /**
   * Re-renderiza el panel solo si cambió de componente seleccionado.
   * Si la "nueva" selección es la misma que la actual, no se hace nada
   * (evita parpadeos al hacer click sobre el mismo componente).
   */
  function onSelectionChanged() {
    const sel = window.HMIState.getSelected();
    const id = sel ? sel.id : null;
    if (id === _renderedComponentId) return;
    render();
  }

  /**
   * Cuando el componente seleccionado cambia DESDE FUERA del panel (drag
   * en canvas, undo/redo, handles), actualizamos solo los `value` de los
   * inputs sin destruir el DOM. Nunca tocamos el input que tiene foco.
   */
  function onComponentChanged(c) {
    if (!c || c.id !== _renderedComponentId) return;
    const container = document.getElementById('propsPanel');
    if (!container) return;
    container.querySelectorAll('[data-prop]').forEach(input => {
      if (document.activeElement === input) return;       // no tocar input con foco
      // Skip inputs dentro de widgets complejos cuyos valores son arrays/objetos
      // (series, roles). Esos inputs tienen sus propios handlers específicos
      // (commitField para series, chips para roles) y no deben ser sobreescritos
      // por el auto-sync genérico — si lo intentamos, String([obj,obj]) rompe
      // los <select> y <input type=color> del editor.
      if (input.closest('[data-prop-series-wrap]')) return;
      if (input.closest('[data-prop-roles-wrap]'))  return;
      const name = input.dataset.prop;
      const value = c[name];
      if (input.type === 'checkbox') {
        input.checked = !!value;
      } else if (input.type === 'number') {
        if (+input.value !== +value && !isNaN(+value)) input.value = (value ?? 0);
      } else {
        const str = (value === undefined || value === null) ? '' : String(value);
        if (input.value !== str) input.value = str;
      }
    });
  }

  /** Refresca selects de "variable" sin destruir el DOM (excepto si hay foco dentro). */
  function refreshVariableSelects() {
    const container = document.getElementById('propsPanel');
    if (!container) return;
    if (document.activeElement && container.contains(document.activeElement)) return;
    const sel = window.HMIState.getSelected();
    if (sel) render();
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (!window.HMIState) return;
    window.HMIState.on('selectionChanged',   onSelectionChanged);
    window.HMIState.on('componentChanged',   onComponentChanged);
    window.HMIState.on('componentsReplaced', () => {
      _renderedComponentId = null;
      render();
    });
    window.HMIState.on('variablesUpdated',   refreshVariableSelects);
  });

  window.HMIPropertiesPanel = { render };
})();
