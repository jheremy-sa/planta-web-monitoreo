/**
 * common.js — Funciones comunes del sistema HMI UPSE
 * SOLO ESPAÑOL — sin sistema de traducciones
 */

// ================================================================
// TEMA (claro / oscuro)
// ================================================================
function initTema() {
  var guardado = localStorage.getItem('hmi_tema') || 'light';
  aplicarTema(guardado);
}

function aplicarTema(tema) {
  localStorage.setItem('hmi_tema', tema);
  document.documentElement.setAttribute('data-tema', tema);
  var t = document.getElementById('temaToggle');
  if (t) t.checked = tema === 'dark';
}

function toggleTema() {
  var actual = localStorage.getItem('hmi_tema') || 'light';
  aplicarTema(actual === 'dark' ? 'light' : 'dark');
}

// ================================================================
// FECHAS UTC → LOCAL (fix de desfase de zona horaria)
// ================================================================
// El backend guarda y devuelve fechas en UTC "naive" (sin sufijo Z ni
// offset), p.ej. "2026-08-15T05:10:00". Si se pasa tal cual a `new Date()`,
// los navegadores la interpretan como HORA LOCAL (no UTC), lo que produce
// un desfase igual al offset local (p.ej. 5h en Ecuador). `utcDate()`
// normaliza el string forzando la interpretación UTC antes de crear el
// objeto Date, devolviendo así el instante real correcto.
function utcDate(iso) {
  if (!iso) return null;
  var s = String(iso);
  // Si ya trae 'Z' o un offset explícito (+hh:mm / -hh:mm), no tocar.
  if (!/[Zz]$/.test(s) && !/[+-]\d{2}:?\d{2}$/.test(s)) s += 'Z';
  return new Date(s);
}

// Formatea una fecha UTC del backend a la hora LOCAL configurada
// (hmi_tz_offset, por defecto -5 = Ecuador), consistente con el reloj
// del topbar, en vez de depender de la zona horaria del navegador.
function formatLocal(iso, soloHora) {
  var d = utcDate(iso);
  if (!d) return '—';
  var offset = parseFloat(localStorage.getItem('hmi_tz_offset') || '-5');
  var utcMs  = d.getTime();
  var local  = new Date(utcMs + offset * 3600000);
  var hh = String(local.getUTCHours()).padStart(2,'0');
  var mm = String(local.getUTCMinutes()).padStart(2,'0');
  if (soloHora) return hh + ':' + mm;
  var dd = String(local.getUTCDate()).padStart(2,'0');
  var mo = String(local.getUTCMonth()+1).padStart(2,'0');
  var yy = local.getUTCFullYear();
  return `${dd}/${mo}/${yy} ${hh}:${mm}`;
}

// ================================================================
// RELOJ DEL TOPBAR
// ================================================================
function iniciarRelojTopbar() {
  function tick() {
    var el = document.getElementById('topbarClock');
    if (!el) return;
    var offset = parseFloat(localStorage.getItem('hmi_tz_offset') || '-5');
    var now = new Date();
    var utc = now.getTime() + now.getTimezoneOffset() * 60000;
    var d   = new Date(utc + offset * 3600000);
    var hh  = String(d.getHours()).padStart(2,'0');
    var mm  = String(d.getMinutes()).padStart(2,'0');
    var ss  = String(d.getSeconds()).padStart(2,'0');
    var DIAS  = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
    var MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    var fecha = DIAS[d.getDay()] + ' ' + d.getDate() + ' ' + MESES[d.getMonth()] + ' ' + d.getFullYear();
    var timeEl = el.querySelector('.tc-time');
    var dateEl = el.querySelector('.tc-date');
    if (timeEl) timeEl.textContent = hh + ':' + mm + ':' + ss;
    if (dateEl) dateEl.textContent = fecha;
  }
  tick();
  setInterval(tick, 1000);
}

// ================================================================
// TOAST / NOTIFICACIONES
// ================================================================
function mostrarToast(titulo, msg, tipo) {
  tipo = tipo || 'info';
  var t = document.createElement('div');
  t.className = 'toast-notif toast-' + tipo;
  t.innerHTML = '<div class="toast-title">' + titulo + '</div><div class="toast-msg">' + (msg||'') + '</div>';
  document.body.appendChild(t);
  setTimeout(function(){ t.classList.add('show'); }, 50);
  setTimeout(function(){ t.classList.remove('show'); setTimeout(function(){ t.remove(); }, 350); }, 4500);
}

// ================================================================
// PANEL DE CONFIGURACIÓN
// ================================================================
function abrirPanelConfig() {
  var viejo = document.getElementById('cfgPanel');
  if (viejo) viejo.remove();
  var viejoBg = document.getElementById('cfgPanelBg');
  if (viejoBg) viejoBg.remove();

  var bg = document.createElement('div');
  bg.id = 'cfgPanelBg';
  bg.style.cssText = 'position:fixed;inset:0;z-index:3999;background:rgba(0,0,0,.4)';
  bg.addEventListener('click', cerrarPanelConfig);
  document.body.appendChild(bg);

  var panel = document.createElement('div');
  panel.id = 'cfgPanel';
  panel.className = 'config-panel';
  panel.innerHTML = [
    '<div class="config-panel-header">',
    '  <h3><i class="fa-solid fa-gear" style="color:var(--accent)"></i> Configuración</h3>',
    '  <button class="btn-close" onclick="cerrarPanelConfig()"><i class="fa-solid fa-xmark"></i></button>',
    '</div>',
    '<div class="config-panel-body">',

    // APARIENCIA
    '<div class="config-section-title"><i class="fa-solid fa-palette"></i> Apariencia</div>',
    '<div class="config-row">',
    '  <div><div class="config-label">Tema oscuro</div><div class="config-sub">Alterna entre oscuro y claro</div></div>',
    '  <label class="toggle-switch">',
    '    <input type="checkbox" id="temaToggle" ' + (localStorage.getItem('hmi_tema')==='dark'?'checked':'') + '>',
    '    <span></span>',
    '  </label>',
    '</div>',

    // NOTIFICACIONES
    '<div class="config-section-title" style="margin-top:20px"><i class="fa-solid fa-bell"></i> Notificaciones</div>',
    '<div class="config-row">',
    '  <div><div class="config-label">Alertas emergentes</div><div class="config-sub">Popups al recibir notificaciones</div></div>',
    '  <label class="toggle-switch">',
    '    <input type="checkbox" id="cfgNotifSwitch" ' + (localStorage.getItem('hmi_notif')!=='off'?'checked':'') + '>',
    '    <span></span>',
    '  </label>',
    '</div>',

    // ZONA HORARIA
    '<div class="config-section-title" style="margin-top:20px"><i class="fa-solid fa-clock"></i> Zona Horaria</div>',
    '<div class="config-row" style="align-items:flex-start;flex-direction:column;gap:8px">',
    '  <div style="display:flex;align-items:center;gap:10px;width:100%">',
    '    <span class="config-label">UTC</span>',
    '    <input type="number" id="cfgTzInput" value="' + (localStorage.getItem('hmi_tz_offset')||'-5') + '"',
    '      step="0.5" min="-12" max="14" style="width:70px;padding:5px 8px;border:1px solid var(--border2);',
    '      border-radius:6px;background:var(--bg2);color:var(--text);font-size:12px">',
    '    <span class="config-sub" id="tzPreview"></span>',
    '  </div>',
    '</div>',

    // ACERCA DE
    '<div class="config-section-title" style="margin-top:20px"><i class="fa-solid fa-circle-info"></i> Acerca del sistema</div>',
    '<div style="font-size:11px;color:var(--muted);line-height:1.8">',
    '  <div><strong>Versión:</strong> 2.0.0</div>',
    '  <div><strong>Institución:</strong> UPSE — Ecuador</div>',
    '  <div><strong>Materia:</strong> Automatización Industrial II</div>',
    '  <div><strong>Año:</strong> 2026</div>',
    '</div>',

    '</div>', // config-panel-body
  ].join('\n');

  document.body.appendChild(panel);
  requestAnimationFrame(function(){ panel.classList.add('open'); });

  // Tema
  panel.querySelector('#temaToggle').addEventListener('change', function() {
    aplicarTema(this.checked ? 'dark' : 'light');
  });

  // Notificaciones
  panel.querySelector('#cfgNotifSwitch').addEventListener('change', function() {
    localStorage.setItem('hmi_notif', this.checked ? 'on' : 'off');
  });

  // Zona horaria
  var tzInput = panel.querySelector('#cfgTzInput');
  if (tzInput) {
    actualizarPreviewTz(panel);
    setInterval(function(){ actualizarPreviewTz(panel); }, 1000);
    tzInput.addEventListener('change', function() {
      var v = parseFloat(this.value);
      if (!isNaN(v)) { localStorage.setItem('hmi_tz_offset', v); actualizarPreviewTz(panel); }
    });
  }
}

function actualizarPreviewTz(panel) {
  var offset = parseFloat(localStorage.getItem('hmi_tz_offset') || '-5');
  var now = new Date();
  var utc = now.getTime() + now.getTimezoneOffset() * 60000;
  var d   = new Date(utc + offset * 3600000);
  var preview = panel ? panel.querySelector('#tzPreview') : null;
  if (preview) {
    preview.textContent = d.toLocaleTimeString('es-EC') + ' (UTC' + (offset>=0?'+':'') + offset + ')';
  }
}

function cerrarPanelConfig() {
  var panel = document.getElementById('cfgPanel');
  var bg    = document.getElementById('cfgPanelBg');
  if (panel) { panel.classList.remove('open'); setTimeout(function(){ panel.remove(); }, 300); }
  if (bg)    bg.remove();
}

// ================================================================
// TOPBAR: hamburger, nav
// ================================================================
function toggleNav() {
  var nav = document.getElementById('topNav');
  if (nav) nav.classList.toggle('open');
}

// ================================================================
// INIT: ejecutar al cargar cualquier página
// ================================================================
initTema();
