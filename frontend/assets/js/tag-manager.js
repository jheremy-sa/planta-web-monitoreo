/**
 * TagManager — Sistema centralizado de Tags HMI/SCADA
 * Arquitectura: Python → TagManager → Widgets
 *
 * Los Widgets NUNCA conocen el código Python.
 * Solo leen/escriben Tags.
 */
const TagManager = (function () {
  'use strict';

  /* ═══════════════════════════════════════════════════════════
     TIPOS DE TAG SOPORTADOS
  ═══════════════════════════════════════════════════════════ */
  const TIPOS = {
    Boolean:  { icono:'🔵', default:false, coerce:(v)=> v===1||v===true||v==='true'||v==='1' },
    Integer:  { icono:'🔢', default:0,     coerce:(v)=> Math.round(Number(v)||0) },
    Float:    { icono:'🔢', default:0.0,   coerce:(v)=> parseFloat(v)||0 },
    Double:   { icono:'🔢', default:0.0,   coerce:(v)=> parseFloat(v)||0 },
    String:   { icono:'🔤', default:'',    coerce:(v)=> String(v??'') },
    DateTime: { icono:'📅', default:null,  coerce:(v)=> v },
    JSON:     { icono:'{}', default:null,  coerce:(v)=> typeof v==='string'?JSON.parse(v):v },
    Array:    { icono:'[]', default:[],    coerce:(v)=> Array.isArray(v)?v:[v] },
    Enum:     { icono:'🔢', default:0,     coerce:(v)=> Number(v)||0 },
  };

  /* ═══════════════════════════════════════════════════════════
     ESTADO INTERNO
  ═══════════════════════════════════════════════════════════ */
  let _defs   = {};          // { tagName: TagDefinition }
  let _values = {};          // { tagName: value }
  let _subs   = {};          // { tagName: Set<callback> }
  let _plantaId = null;

  const STORAGE_KEY = 'hmi_tm_';
  const SYSTEM_GROUP = 'Sistema';

  /* ═══════════════════════════════════════════════════════════
     HELPERS INTERNOS
  ═══════════════════════════════════════════════════════════ */
  function _coerce(tipo, value) {
    return TIPOS[tipo]?.coerce(value) ?? value;
  }

  function _applyLimits(def, value) {
    if (typeof value !== 'number') return value;
    let v = value;
    if (def.min !== null && def.min !== undefined && !isNaN(def.min)) v = Math.max(Number(def.min), v);
    if (def.max !== null && def.max !== undefined && !isNaN(def.max)) v = Math.min(Number(def.max), v);
    return v;
  }

  function _notify(name) {
    const val = _values[name];
    (_subs[name] || new Set()).forEach(cb => { try { cb(val, name); } catch(e) {} });
    document.dispatchEvent(new CustomEvent('tm:changed', {
      bubbles: true, detail: { name, value: val }
    }));
  }

  /* ═══════════════════════════════════════════════════════════
     TAGS DEL SISTEMA (sensores físicos UPSE)
  ═══════════════════════════════════════════════════════════ */
  const SYSTEM_TAGS = [
    { nombre:'nivel_p1',      tipo:'Float',   valorInicial:0,     min:0,   max:100, unidad:'cm',    descripcion:'Nivel tanque Planta 1',  permisos:'r'  },
    { nombre:'caudal_p1',     tipo:'Float',   valorInicial:0,     min:0,   max:50,  unidad:'L/min', descripcion:'Caudal Planta 1',         permisos:'r'  },
    { nombre:'temp_ambiente', tipo:'Float',   valorInicial:25,    min:-10, max:60,  unidad:'°C',    descripcion:'Temperatura ambiente',    permisos:'r'  },
    { nombre:'humedad',       tipo:'Float',   valorInicial:60,    min:0,   max:100, unidad:'%',     descripcion:'Humedad relativa',        permisos:'r'  },
    { nombre:'temp_agua',     tipo:'Float',   valorInicial:20,    min:0,   max:80,  unidad:'°C',    descripcion:'Temperatura del agua',    permisos:'r'  },
    { nombre:'flotador_bajo', tipo:'Boolean', valorInicial:false, unidad:'',       descripcion:'Flotador bajo P1',       permisos:'r'  },
    { nombre:'flotador_alto', tipo:'Boolean', valorInicial:false, unidad:'',       descripcion:'Flotador alto P1',       permisos:'r'  },
    { nombre:'bomba_p1',      tipo:'Boolean', valorInicial:false, unidad:'',       descripcion:'Estado Bomba P1',        permisos:'rw' },
    { nombre:'valvula_p1',    tipo:'Boolean', valorInicial:false, unidad:'',       descripcion:'Estado Válvula P1',      permisos:'rw' },
    { nombre:'nivel_p2',      tipo:'Float',   valorInicial:0,     min:0,   max:100, unidad:'cm',    descripcion:'Nivel tanque Planta 2',  permisos:'r'  },
    { nombre:'caudal_p2',     tipo:'Float',   valorInicial:0,     min:0,   max:50,  unidad:'L/min', descripcion:'Caudal Planta 2',         permisos:'r'  },
    { nombre:'bomba_p2',      tipo:'Boolean', valorInicial:false, unidad:'',       descripcion:'Estado Bomba P2',        permisos:'rw' },
    { nombre:'valvula_p2',    tipo:'Boolean', valorInicial:false, unidad:'',       descripcion:'Estado Válvula P2',      permisos:'rw' },
  ];

  /* ═══════════════════════════════════════════════════════════
     API PÚBLICA
  ═══════════════════════════════════════════════════════════ */
  return {
    TIPOS,
    SYSTEM_GROUP,

    /* ─── Inicializar para una planta ────────────────────── */
    init(plantaId) {
      _plantaId = String(plantaId);
      // Cargar de localStorage
      try {
        const raw = localStorage.getItem(STORAGE_KEY + _plantaId);
        if (raw) {
          const data = JSON.parse(raw);
          _defs   = data.defs   || {};
          _values = data.values || {};
        }
      } catch(e) { _defs = {}; _values = {}; }

      // Agregar/actualizar tags del sistema
      SYSTEM_TAGS.forEach(tag => {
        if (!_defs[tag.nombre]) {
          _defs[tag.nombre] = { ...tag, grupo: SYSTEM_GROUP, activo:true, historico:false, retentivo:false };
        }
        if (!(_values[tag.nombre] !== undefined)) {
          _values[tag.nombre] = _coerce(tag.tipo, tag.valorInicial);
        }
      });
    },

    /* ─── Definir un nuevo Tag ───────────────────────────── */
    define(nombre, cfg = {}) {
      if (!nombre || !nombre.trim()) return null;
      nombre = nombre.trim().replace(/\s+/g,'_');
      const tipo = cfg.tipo || 'Float';
      const def = {
        nombre,
        descripcion: cfg.descripcion || '',
        grupo:       cfg.grupo || 'Usuario',
        tipo,
        valorInicial: cfg.valorInicial ?? TIPOS[tipo]?.default ?? 0,
        min:         cfg.min ?? null,
        max:         cfg.max ?? null,
        unidad:      cfg.unidad || '',
        permisos:    cfg.permisos || 'rw',
        historico:   cfg.historico ?? false,
        alarmas:     cfg.alarmas ?? false,
        retentivo:   cfg.retentivo ?? false,
        visible:     cfg.visible ?? true,
        activo:      cfg.activo ?? true,
        frecuencia:  cfg.frecuencia || 1000,
        creadoEn:    cfg.creadoEn || Date.now(),
      };
      _defs[nombre] = def;
      if (!(_values[nombre] !== undefined)) {
        _values[nombre] = _coerce(tipo, def.valorInicial);
      }
      this._save();
      return def;
    },

    /* ─── Actualizar definición de un Tag ────────────────── */
    update(nombre, cambios = {}) {
      if (!_defs[nombre]) return false;
      Object.assign(_defs[nombre], cambios);
      this._save();
      return true;
    },

    /* ─── Eliminar un Tag ────────────────────────────────── */
    remove(nombre) {
      if (_defs[nombre]?.grupo === SYSTEM_GROUP) return false; // no eliminar tags del sistema
      delete _defs[nombre];
      delete _values[nombre];
      delete _subs[nombre];
      this._save();
      _notify(nombre);
      return true;
    },

    /* ─── Leer valor ─────────────────────────────────────── */
    getValue(nombre) {
      if (nombre in _values) return _values[nombre];
      return undefined;
    },

    /* ─── Escribir valor ─────────────────────────────────── */
    setValue(nombre, value, source = 'widget') {
      // Auto-definir si no existe
      if (!_defs[nombre]) {
        const tipo = typeof value === 'boolean' ? 'Boolean' : 'Float';
        this.define(nombre, { tipo, grupo: 'Auto' });
      }
      const def = _defs[nombre];
      if (def?.activo === false) return;

      let coerced = _coerce(def.tipo, value);
      coerced = _applyLimits(def, coerced);

      _values[nombre] = coerced;
      if (def?.retentivo) this._save();
      _notify(nombre);
    },

    /* ─── Suscribirse a cambios de un Tag ────────────────── */
    subscribe(nombre, callback) {
      if (!_subs[nombre]) _subs[nombre] = new Set();
      _subs[nombre].add(callback);
      // Llamar inmediatamente con el valor actual
      if (nombre in _values) {
        try { callback(_values[nombre], nombre); } catch(e) {}
      }
      return () => { _subs[nombre]?.delete(callback); };
    },

    /* ─── Desuscribirse ──────────────────────────────────── */
    unsubscribe(nombre, callback) {
      _subs[nombre]?.delete(callback);
    },

    /* ─── Actualización masiva desde backend ─────────────── */
    updateFromBackend(obj) {
      Object.entries(obj).forEach(([k, v]) => this.setValue(k, v, 'backend'));
    },

    /* ─── Getters de estado ──────────────────────────────── */
    getDefs()    { return { ..._defs }; },
    getDefList() { return Object.values(_defs); },
    getDef(n)    { return _defs[n] || null; },
    getValues()  { return { ..._values }; },
    getTagNames(){ return Object.keys(_defs); },

    /* ─── Para el selector dropdown de widgets ───────────── */
    getTagOptions() {
      return Object.values(_defs)
        .filter(d => d.activo !== false)
        .sort((a, b) => {
          // Sistema primero, luego por grupo, luego por nombre
          if (a.grupo === SYSTEM_GROUP && b.grupo !== SYSTEM_GROUP) return -1;
          if (b.grupo === SYSTEM_GROUP && a.grupo !== SYSTEM_GROUP) return  1;
          return a.nombre.localeCompare(b.nombre);
        });
    },

    /* ─── Exportar para guardar con el layout ────────────── */
    exportForLayout() {
      const userDefs = {};
      Object.entries(_defs).forEach(([k, v]) => {
        if (v.grupo !== SYSTEM_GROUP) userDefs[k] = v;
      });
      return { tagDefs: userDefs };
    },

    /* ─── Importar desde layout cargado ──────────────────── */
    importFromLayout(data) {
      if (!data?.tagDefs) return;
      Object.entries(data.tagDefs).forEach(([nombre, def]) => {
        if (!_defs[nombre]) {
          _defs[nombre] = def;
          if (!(_values[nombre] !== undefined)) {
            _values[nombre] = _coerce(def.tipo, def.valorInicial ?? 0);
          }
        }
      });
      this._save();
    },

    /* ─── Persistencia ───────────────────────────────────── */
    _save() {
      if (!_plantaId) return;
      try {
        const userDefs = {};
        const userVals = {};
        Object.entries(_defs).forEach(([k, v]) => {
          if (v.grupo !== SYSTEM_GROUP) { userDefs[k] = v; userVals[k] = _values[k]; }
        });
        localStorage.setItem(STORAGE_KEY + _plantaId, JSON.stringify({
          defs: userDefs, values: userVals
        }));
      } catch(e) {}
    },

    /* ─── Simular valores (sin PLC real) ─────────────────── */
    simulate(nombre, value) {
      this.setValue(nombre, value, 'simulator');
    },

    /* ─── Resetear todos los valores al inicial ──────────── */
    resetToDefaults() {
      Object.values(_defs).forEach(def => {
        _values[def.nombre] = _coerce(def.tipo, def.valorInicial ?? 0);
        _notify(def.nombre);
      });
    },

    /* ─── Desde Python (llamada futura) ──────────────────── */
    // TagManager.fromPython({ Motor1: true, Temperatura: 42.5 })
    fromPython(obj) { this.updateFromBackend(obj); },
  };
})();

/* ══════════════════════════════════════════════════════════════
   GENERADOR DE HTML — Panel de administración de Tags
══════════════════════════════════════════════════════════════ */
const TagManagerUI = {

  // Selector dropdown para el panel de propiedades de un widget
  tagSelect(widgetId, currentTag, propKey = 'tag') {
    const tags = TagManager.getTagOptions();
    const opts = tags.map(t => {
      const ico = TagManager.TIPOS[t.tipo]?.icono || '•';
      const sel = t.nombre === currentTag ? ' selected' : '';
      return `<option value="${t.nombre}"${sel}>[${t.tipo.slice(0,4)}] ${t.nombre} — ${t.descripcion||t.unidad}</option>`;
    }).join('');
    return `<select onchange="updProp('${widgetId}','${propKey}',this.value)"
                    style="width:100%;padding:6px 8px;border:1px solid var(--border2);border-radius:6px;
                           background:var(--bg2);color:var(--text);font-size:11px;outline:none">
      <option value="">— Sin tag —</option>
      ${opts}
    </select>`;
  },

  // Modal completo de administración de tags
  modalHTML() {
    return `
    <div class="tm-modal-overlay" id="tmOverlay" onclick="if(event.target.id==='tmOverlay')cerrarTM()">
      <div class="tm-modal">
        <div class="tm-header">
          <div style="display:flex;align-items:center;gap:10px">
            <span style="font-size:18px">🏷️</span>
            <div>
              <div style="font-weight:800;font-size:14px">Administrador de Tags</div>
              <div style="font-size:10px;color:var(--muted)">Tag Dictionary — Define variables para tu HMI</div>
            </div>
          </div>
          <div style="display:flex;gap:8px;align-items:center">
            <button class="tbtn accent" onclick="tmAgregarTag()"><i class="fa-solid fa-plus"></i> Nuevo Tag</button>
            <button class="tbtn ghost" onclick="cerrarTM()"><i class="fa-solid fa-xmark"></i></button>
          </div>
        </div>
        <div class="tm-search-row">
          <input type="text" id="tmSearch" placeholder="🔍 Buscar tag..." oninput="tmFiltrar(this.value)"
                 style="flex:1;padding:8px 12px;border:1px solid var(--border2);border-radius:8px;
                        background:var(--bg2);color:var(--text);font-size:12px;outline:none">
          <select id="tmGrupoFiltro" onchange="tmFiltrar()" 
                  style="padding:8px;border:1px solid var(--border2);border-radius:8px;
                         background:var(--bg2);color:var(--text);font-size:12px;outline:none">
            <option value="">Todos los grupos</option>
          </select>
        </div>
        <div class="tm-table-wrap">
          <table class="tm-table" id="tmTable">
            <thead><tr>
              <th>Nombre</th><th>Tipo</th><th>Valor actual</th>
              <th>Min/Máx</th><th>Unidad</th><th>Grupo</th><th>Descripción</th><th>Acciones</th>
            </tr></thead>
            <tbody id="tmBody"></tbody>
          </table>
        </div>
        <!-- Formulario edición / creación -->
        <div id="tmForm" style="display:none">
          <div class="tm-form-inner">
            <div style="font-weight:700;font-size:12px;margin-bottom:10px;color:var(--accent)" id="tmFormTitle">Nuevo Tag</div>
            <div class="tm-form-grid">
              <div class="prop-row"><label>Nombre *</label><input id="tf_nombre" placeholder="Motor1, Nivel_Tanque..."></div>
              <div class="prop-row"><label>Tipo</label>
                <select id="tf_tipo">
                  ${Object.keys(TagManager.TIPOS).map(t=>`<option value="${t}">${t}</option>`).join('')}
                </select>
              </div>
              <div class="prop-row"><label>Valor inicial</label><input id="tf_valorInicial" value="0"></div>
              <div class="prop-row"><label>Unidad</label><input id="tf_unidad" placeholder="°C, L/min, %..."></div>
              <div class="prop-row"><label>Mínimo</label><input id="tf_min" type="number" placeholder="(opcional)"></div>
              <div class="prop-row"><label>Máximo</label><input id="tf_max" type="number" placeholder="(opcional)"></div>
              <div class="prop-row"><label>Grupo</label><input id="tf_grupo" value="Usuario" placeholder="Usuario, PLC1..."></div>
              <div class="prop-row"><label>Descripción</label><input id="tf_descripcion" placeholder="Descripción del tag"></div>
              <div class="prop-row" style="grid-column:1/-1">
                <label style="display:flex;align-items:center;gap:10px">
                  <input type="checkbox" id="tf_retentivo"> Retentivo
                  <input type="checkbox" id="tf_historico" style="margin-left:16px"> Histórico
                  <input type="checkbox" id="tf_alarmas"   style="margin-left:16px"> Alarmas
                </label>
              </div>
            </div>
            <div style="display:flex;gap:8px;margin-top:10px;justify-content:flex-end">
              <button class="tbtn ghost" onclick="document.getElementById('tmForm').style.display='none'">Cancelar</button>
              <button class="tbtn accent" onclick="tmGuardarTag()"><i class="fa-solid fa-check"></i> Guardar</button>
            </div>
          </div>
        </div>
      </div>
    </div>`;
  },

  // Simulador de tags
  simulatorHTML() {
    return `
    <div class="tm-sim-panel" id="tmSimPanel">
      <div class="tm-sim-header">
        <span style="font-weight:800;font-size:12px">🎮 Simulador de Tags</span>
        <button class="tbtn ghost" style="font-size:10px" onclick="resetSimulador()">Reset</button>
        <button class="tbtn ghost" style="padding:3px 8px" onclick="cerrarSimulador()"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="tm-sim-body" id="tmSimBody"></div>
    </div>`;
  },

  // Renderizar tabla de tags
  renderTable(filtro = '', grupo = '') {
    const tags = TagManager.getDefList().filter(t => {
      const matchFiltro = !filtro || t.nombre.toLowerCase().includes(filtro.toLowerCase()) ||
                          (t.descripcion||'').toLowerCase().includes(filtro.toLowerCase());
      const matchGrupo  = !grupo  || t.grupo === grupo;
      return matchFiltro && matchGrupo;
    });

    // Actualizar filtro de grupos
    const grupos = [...new Set(TagManager.getDefList().map(t => t.grupo))];
    const grupoSel = document.getElementById('tmGrupoFiltro');
    if (grupoSel) {
      const current = grupoSel.value;
      grupoSel.innerHTML = `<option value="">Todos los grupos</option>` +
        grupos.map(g=>`<option value="${g}"${g===current?' selected':''}>${g}</option>`).join('');
    }

    const tbody = document.getElementById('tmBody');
    if (!tbody) return;
    tbody.innerHTML = tags.map(t => {
      const val  = TagManager.getValue(t.nombre);
      const ico  = TagManager.TIPOS[t.tipo]?.icono || '•';
      const ro   = t.grupo === TagManager.SYSTEM_GROUP;
      const minmax = (t.min !== null && t.min !== undefined) || (t.max !== null && t.max !== undefined)
        ? `${t.min ?? '—'} / ${t.max ?? '—'}` : '—';
      return `<tr class="${ro ? 'tm-sys-row' : ''}">
        <td><strong>${t.nombre}</strong> ${ro ? '<span class="tm-badge">Sistema</span>' : ''}</td>
        <td>${ico} ${t.tipo}</td>
        <td class="tm-val-cell">
          ${ro ? `<span id="tmv_${t.nombre}">${String(val)}</span>` :
            t.tipo === 'Boolean'
              ? `<label class="tm-toggle-mini"><input type="checkbox" ${val?'checked':''} onchange="TagManager.simulate('${t.nombre}',this.checked);TagManagerUI.renderTable(document.getElementById('tmSearch').value, document.getElementById('tmGrupoFiltro').value)"><span></span></label>`
              : `<input class="tm-num-input" type="number" value="${Number(val).toFixed?Number(val).toFixed(2):val}"
                   step="${t.tipo==='Integer'?1:0.1}"
                   onchange="TagManager.simulate('${t.nombre}',this.value)">`
          }
        </td>
        <td>${minmax}</td>
        <td>${t.unidad || '—'}</td>
        <td><span class="tm-group-badge">${t.grupo}</span></td>
        <td style="font-size:11px;color:var(--muted)">${t.descripcion||''}</td>
        <td>
          ${ro ? '' : `
            <button class="tbtn ghost" style="padding:3px 7px;font-size:10px" onclick="tmEditarTag('${t.nombre}')">✏️</button>
            <button class="tbtn red"   style="padding:3px 7px;font-size:10px" onclick="tmEliminarTag('${t.nombre}')">🗑</button>
          `}
        </td>
      </tr>`;
    }).join('') || `<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--muted)">No hay tags. Crea uno con el botón "Nuevo Tag".</td></tr>`;
  },

  // Renderizar simulador
  renderSimulator() {
    const body = document.getElementById('tmSimBody');
    if (!body) return;
    const tags = TagManager.getDefList().filter(t => t.activo !== false);
    body.innerHTML = tags.map(t => {
      const val = TagManager.getValue(t.nombre);
      if (t.tipo === 'Boolean') {
        return `<div class="tm-sim-row">
          <span class="tm-sim-label">${t.nombre}</span>
          <label class="tm-toggle-mini"><input type="checkbox" ${val?'checked':''}
            onchange="TagManager.simulate('${t.nombre}',this.checked)"><span></span></label>
          <span class="tm-sim-unit">${val?'ON':'OFF'}</span>
        </div>`;
      }
      const min = t.min ?? 0, max = t.max ?? 100;
      return `<div class="tm-sim-row">
        <span class="tm-sim-label" title="${t.descripcion}">${t.nombre}</span>
        <input type="range" min="${min}" max="${max}"
               step="${t.tipo==='Integer'?1:0.1}" value="${Number(val)||0}"
               style="flex:1;accent-color:var(--accent)"
               oninput="TagManager.simulate('${t.nombre}',+this.value);this.nextElementSibling.textContent=this.value"
               onchange="TagManager.simulate('${t.nombre}',+this.value)">
        <span class="tm-sim-val" style="min-width:50px;text-align:right;font-family:monospace;font-size:11px;color:var(--accent)">
          ${Number(val).toFixed?Number(val).toFixed(1):val} ${t.unidad||''}
        </span>
      </div>`;
    }).join('');
  },
};
