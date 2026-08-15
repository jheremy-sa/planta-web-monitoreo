/**
 * widget-library.js — Biblioteca HMI completa
 * 40+ widgets reutilizables, arquitectura unificada.
 *
 * API pública (window.WL):
 *   WL.render(w, tagValues)       → HTML del contenido del widget
 *   WL.defaults(type)             → Props por defecto
 *   WL.propsHTML(w)               → HTML del panel de propiedades
 *   WL.getCategories()            → Categorías para la paleta
 *   WL.defaultSize(type)          → { w, h } tamaño inicial
 *   WL.TAG_MAP                    → Variables disponibles del sistema
 */
(function(global) {
'use strict';

// Función de traducción local
function _wt(key) {
  if (window.t) return window.t(key);
  return key;
}

// Callback de comando — lo define editor.html
// widgets interactivos llaman: WL._cmd(widgetId, valor)
function _cmd(id, val) {
  if (window.__widgetCommand) window.__widgetCommand(id, val);
}




function _e(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function _clamp(v,mn,mx) { return Math.min(mx, Math.max(mn, v)); }
// Convierte un color hex (#rgb o #rrggbb) a rgba(...) con la opacidad indicada.
// Si no es hex (ya es rgba/nombre), lo envuelve igual con opacity vía CSS filter no aplica,
// así que se hace un mejor esfuerzo y devuelve el color plano si no se puede parsear.
function _colorAlpha(hex, alpha) {
  alpha = _clamp(alpha, 0, 1);
  if (!hex) return `rgba(20,184,166,${alpha})`;
  let h = String(hex).trim();
  if (h[0] === '#') {
    if (h.length === 4) h = '#' + h[1]+h[1]+h[2]+h[2]+h[3]+h[3];
    if (h.length === 7) {
      const r = parseInt(h.slice(1,3),16), g = parseInt(h.slice(3,5),16), b = parseInt(h.slice(5,7),16);
      return `rgba(${r},${g},${b},${alpha})`;
    }
  }
  return h; // no-hex: devolver tal cual (mejor esfuerzo)
}
function _pct(v,mn,mx) { return _clamp((v-mn)/(mx-mn), 0, 1); }
function _tv(tv, tag, def=0) {
  if (!tv || !tag) return def;  // editor mode → valor por defecto
  const v = tv[tag];
  return v !== undefined && v !== null ? v : def;
}

// Valor demo para vista en editor (25-75% del rango típico)
function _demoVal(p, fallback=50) {
  if (p.min !== undefined && p.max !== undefined) {
    return parseFloat(p.min) + (parseFloat(p.max) - parseFloat(p.min)) * 0.6;
  }
  return fallback;
}
function _pt(cx, cy, r, deg) {
  const rad = deg * Math.PI / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}
function _arc(cx, cy, r, startDeg, sweepPct) {
  // startDeg=135 (lower-left), goes CW through top to 45 (lower-right) = 270° total
  const s = _pt(cx, cy, r, startDeg);
  const endDeg = startDeg + 270 * sweepPct;
  const e = _pt(cx, cy, r, endDeg);
  const large = 270 * sweepPct > 180 ? 1 : 0;
  if (sweepPct <= 0) return '';
  if (sweepPct >= 1) {
    // Full arc: split into two halves to avoid degenerate case
    const m = _pt(cx, cy, r, startDeg + 135);
    return `M${s.x.toFixed(2)},${s.y.toFixed(2)} A${r},${r} 0 1,1 ${m.x.toFixed(2)},${m.y.toFixed(2)} A${r},${r} 0 1,1 ${s.x.toFixed(2)},${s.y.toFixed(2)}`;
  }
  return `M${s.x.toFixed(2)},${s.y.toFixed(2)} A${r},${r} 0 ${large},1 ${e.x.toFixed(2)},${e.y.toFixed(2)}`;
}






// ── 7-Segment Display ───────────────────────────────────────────
const SEGS = {0:[1,1,1,1,1,1,0],1:[0,1,1,0,0,0,0],2:[1,1,0,1,1,0,1],
  3:[1,1,1,1,0,0,1],4:[0,1,1,0,0,1,1],5:[1,0,1,1,0,1,1],
  6:[1,0,1,1,1,1,1],7:[1,1,1,0,0,0,0],8:[1,1,1,1,1,1,1],
  9:[1,1,1,1,0,1,1],'-':[0,0,0,0,0,0,1],' ':[0,0,0,0,0,0,0]};

function _digit7seg(char, ox, oy, w, h, on, off) {
  const s = SEGS[char] ?? SEGS[' '];
  const t=2.5, g=0.8;
  const paths = [
    `M${ox+t+g},${oy+g} L${ox+w-t-g},${oy+g} L${ox+w-t},${oy+t} L${ox+t},${oy+t}Z`,
    `M${ox+w-t},${oy+t+g} L${ox+w},${oy+t} L${ox+w},${oy+h/2-g} L${ox+w-t},${oy+h/2-t}Z`,
    `M${ox+w-t},${oy+h/2+g} L${ox+w},${oy+h/2+t} L${ox+w},${oy+h-t} L${ox+w-t},${oy+h-t-g}Z`,
    `M${ox+t+g},${oy+h-g} L${ox+w-t-g},${oy+h-g} L${ox+w-t},${oy+h-t} L${ox+t},${oy+h-t}Z`,
    `M${ox},${oy+h/2+t} L${ox+t},${oy+h/2+g} L${ox+t},${oy+h-t-g} L${ox},${oy+h-t}Z`,
    `M${ox},${oy+t} L${ox+t},${oy+t+g} L${ox+t},${oy+h/2-t} L${ox},${oy+h/2-g}Z`,
    `M${ox+t+g},${oy+h/2-t/2} L${ox+w-t-g},${oy+h/2-t/2} L${ox+w-t},${oy+h/2} L${ox+t},${oy+h/2}Z`,
  ];
  return paths.map((p,i)=>`<path d="${p}" fill="${s[i]?on:off}"/>`).join('');
}
function _sevenSeg(val, p) {
  const str = String(val ?? '--').slice(0,p.digits||4).padStart(p.digits||4,' ');
  const dw=16, dh=28, sp=3, pad=5;
  const n = str.length;
  const W = n*(dw+sp)+pad*2, H = dh+pad*2;
  const on = p.color||'#00ff88', off = p.bgColor||'#1a1a1a';
  let svg = '';
  for(let i=0;i<n;i++) svg += _digit7seg(str[i], pad+i*(dw+sp), pad, dw, dh, on, off);
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"
               style="width:100%;height:100%;background:${off};border-radius:4px">
    ${svg}
    ${p.label?`<text x="${W/2}" y="${H+10}" text-anchor="middle" font-size="8" fill="#94a3b8">${_e(p.label)}</text>`:''}
  </svg>`;
}

// ── Alarm Indicator ──────────────────────────────────────────────
function _alarmInd(val, p) {
  const active = val > 0;
  const color = active ? (p.colorOn||'#ef4444') : (p.colorOff||'#22c55e');
  const text  = active ? (p.textOn||'ALARMA') : (p.textOff||'NORMAL');
  const pulse = active ? `style="animation:blink 1s step-start infinite"` : '';
  return `<div style="width:100%;height:100%;display:flex;flex-direction:column;
                      align-items:center;justify-content:center;gap:6px">
    <div ${pulse} style="width:30px;height:30px;border-radius:50%;background:${color};
                  box-shadow:0 0 ${active?12:4}px ${color}"></div>
    <div style="font-size:10px;font-weight:800;color:${color};letter-spacing:.5px">${_e(text)}</div>
  </div>
  <style>@keyframes blink{0%,100%{opacity:1}50%{opacity:.25}}</style>`;
}

// ── LED ─────────────────────────────────────────────────────────
function _led(val, p) {
  const on = val > 0;
  const color = on ? (p.colorOn||'#22c55e') : (p.colorOff||'#374151');
  return `<div style="width:100%;height:100%;display:flex;align-items:center;
                      justify-content:center;background:transparent">
    <div style="width:70%;aspect-ratio:1;max-width:${Math.min(p.w||40,40)}px;
                border-radius:${p.forma==='cuadrado'?'15%':p.forma==='rombo'?'4px':'50%'};
                transform:${p.forma==='rombo'?'rotate(45deg)':'none'};
                background:radial-gradient(circle at 30% 30%, ${color}ff, ${color}88, ${color}44);
                box-shadow:${on?`0 0 12px 4px ${color}88`:'none'};
                transition:all .3s ease"></div>
  </div>`;
}

// ── Progress Bar ─────────────────────────────────────────────────
// Uniformada para escalar igual que el Slider: usa min/max dinámicos
// y la intensidad/opacidad del color crece junto con el valor actual.
function _progressBar(val, p) {
  val = typeof val==='number'?val:(p.min+p.max)/2;
  const pct = _pct(val,p.min||0,p.max||100)*100;
  const baseColor = p.color||'#14b8a6';
  const color = _colorAlpha(baseColor, 0.3 + 0.7*(pct/100));
  const isV = p.orientation==='vertical';
  return isV
    ? `<div style="width:100%;height:100%;display:flex;flex-direction:column;
                  align-items:center;justify-content:flex-end;position:relative;
                  background:#e2e8f0;border-radius:6px;overflow:hidden">
        <div style="width:100%;height:${pct}%;background:linear-gradient(to top,${color},${color});
                    border-radius:inherit;transition:height .4s ease,background .4s ease"></div>
        <div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);
                    font-size:11px;font-weight:800;color:#fff;text-shadow:0 1px 3px #0006">
          ${pct.toFixed(0)}%</div>
      </div>`
    : `<div style="width:100%;height:100%;position:relative;background:#e2e8f0;border-radius:6px;overflow:hidden">
        <div style="height:100%;width:${pct}%;background:linear-gradient(to right,${color},${color});
                    border-radius:inherit;transition:width .4s ease,background .4s ease"></div>
        <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
                    font-size:11px;font-weight:800;color:#fff;text-shadow:0 1px 3px #0006">
          ${val.toFixed?val.toFixed(p.decimals||0):val} ${_e(p.unit||'')}
        </div>
      </div>`;
}

// ── Bit Lamp ────────────────────────────────────────────────────
function _bitLamp(val, p) {
  const on = val > 0;
  const color = on ? (p.colorOn||'#22c55e') : (p.colorOff||'#6b7280');
  const forma = p.forma==='cuadrado' ? '10%' : p.forma==='rombo' ? '4px' : '50%';
  const transf = p.forma==='rombo' ? 'rotate(45deg)' : 'none';
  return `<div style="width:100%;height:100%;display:flex;flex-direction:column;
                      align-items:center;justify-content:center;gap:4px">
    <div style="width:55%;aspect-ratio:1;background:${color};border-radius:${forma};
                transform:${transf};box-shadow:${on?`0 0 10px 3px ${color}66`:'none'};
                transition:all .3s ease"></div>
    <div style="font-size:9px;color:var(--muted,#6b7280);font-weight:600;white-space:nowrap;
                overflow:hidden;text-overflow:ellipsis;max-width:100%;text-align:center">
      ${_e(p.etiqueta||p.label||'')}
    </div>
  </div>`;
}

// ── Numeric Display ──────────────────────────────────────────────
function _numericDisplay(val, p) {

  val = typeof val==='number' ? val : null;
  const decs = parseInt(p.decimals??2);
  const str = val!==null ? val.toFixed(decs) : '--';
  let color = p.color||'#14b8a6';
  let alarm = false;
  if (val!==null) {
    if (p.alarmLo!==null && p.alarmLo!==undefined && val<parseFloat(p.alarmLo)) { color='#ef4444'; alarm=true; }
    if (p.alarmHi!==null && p.alarmHi!==undefined && val>parseFloat(p.alarmHi)) { color='#f59e0b'; alarm=true; }
  }
  return `<div style="width:100%;height:100%;background:var(--panel2,#21262d);border:1px solid ${alarm?color:'var(--border,#30363d)'};
                      border-radius:7px;display:flex;flex-direction:column;
                      align-items:center;justify-content:center;gap:2px;overflow:hidden;
                      ${alarm?`box-shadow:0 0 8px ${color}44`:''};transition:all .3s">
    <div style="font-size:9px;color:var(--muted,#7d8590);text-transform:uppercase;
                letter-spacing:.5px;padding:0 8px">${_e(p.etiqueta||p.label||'Valor')}</div>
    <div style="font-family:monospace;font-size:22px;font-weight:800;color:${color};
                ${alarm?'animation:pulse .8s ease-in-out infinite alternate':''}">${str}</div>
    ${p.unit?`<div style="font-size:10px;color:var(--muted,#7d8590)">${_e(p.unit)}</div>`:''}
    ${alarm?`<div style="font-size:8px;color:${color};font-weight:700">⚠ ALARMA</div>`:''}
  </div>
  <style>@keyframes pulse{from{opacity:1}to{opacity:.4}}</style>`;
}

// ── LCD / Pantalla de Texto (Alfanumérica) ─────────────────────────
// Muestra una cadena de caracteres (string) enviada desde el ESP32,
// estilo pantalla LCD 16x2. Complementa al visor numérico (_numericDisplay).
function _lcdText(val, p) {
  const cols = parseInt(p.cols || 16);
  const rows = parseInt(p.rows || 2);
  const on   = p.color || '#00ff88';
  const off  = p.bgColor || '#0b1f14';
  let str = (val === null || val === undefined || val === '') ? (p.placeholder || '') : String(val);
  // Partir el texto en líneas de `cols` caracteres, hasta `rows` líneas
  const lines = [];
  for (let i = 0; i < rows; i++) lines.push(str.slice(i*cols, i*cols+cols).padEnd(cols, ' '));
  return `<div style="width:100%;height:100%;background:${off};border:3px solid #1a1a1a;
                      border-radius:6px;box-shadow:inset 0 2px 6px rgba(0,0,0,.5);
                      display:flex;flex-direction:column;align-items:center;justify-content:center;
                      gap:2px;padding:6px;box-sizing:border-box;overflow:hidden">
    ${lines.map(l => `<div style="font-family:'Courier New',monospace;font-weight:700;
                white-space:pre;letter-spacing:2px;color:${on};
                font-size:${parseInt(p.fontSize||14)}px;line-height:1.3;
                text-shadow:0 0 4px ${on}88;width:100%;text-align:left">${_e(l)}</div>`).join('')}
  </div>`;
}


function _button(val, p, isPreview) {
  const on = val > 0;
  const mode = p.modo||'momentaneo';
  const active = mode==='toggle' && on;
  // colorOn/colorOff (nuevo) con fallback al 'color' clásico para compatibilidad
  const colorOn  = p.colorOn  || p.color || '#14b8a6';
  const colorOff = p.colorOff || p.color || '#14b8a6';
  const color = active ? colorOn : colorOff;
  return `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;
                      border-radius:8px;cursor:${isPreview?'pointer':'default'};font-weight:700;
                      font-size:${Math.min(14,parseInt(p.fontSize)||13)}px;
                      background:${active?color:'transparent'};
                      color:${active?'#fff':color};
                      border:2px solid ${color};
                      box-shadow:${active?`0 4px 12px ${color}44`:'none'};
                      transition:all .15s ease;user-select:none">
    ${p.icon?`<i class="fa-solid fa-${_e(p.icon)}" style="margin-right:6px"></i>`:''}
    ${_e(p.text||'Botón')}
  </div>`;
}

// ── Toggle Switch ────────────────────────────────────────────────
function _toggleSwitch(val, p) {
  const on = val > 0;
  const color = p.colorOn||'#14b8a6';
  const off   = p.colorOff||'#6b7280';
  return `<div style="width:100%;height:100%;display:flex;flex-direction:column;
                      align-items:center;justify-content:center;gap:6px">
    <div style="width:52px;height:28px;border-radius:14px;background:${on?color:off};
                position:relative;transition:background .2s;box-shadow:inset 0 1px 3px #0003">
      <div style="position:absolute;width:22px;height:22px;border-radius:50%;
                  background:#fff;top:3px;left:${on?'27px':'3px'};
                  box-shadow:0 1px 4px #0004;transition:left .2s ease"></div>
    </div>
    <div style="font-size:10px;font-weight:700;color:${on?color:off}">
      ${on ? _e(p.textOn||'ON') : _e(p.textOff||'OFF')}
    </div>
    ${p.label?`<div style="font-size:9px;color:var(--muted,#6b7280)">${_e(p.label)}</div>`:''}
  </div>`;
}

// ── Slider ───────────────────────────────────────────────────────
function _slider(val, p) {
  val = typeof val==='number' ? val : (p.min+p.max)/2;
  const pct = _pct(val,p.min||0,p.max||100)*100;
  const baseColor = p.color||'#14b8a6';
  // Intensidad/opacidad proporcional al valor: tenue cerca de 0%, saturado cerca de 100%
  const color = _colorAlpha(baseColor, 0.3 + 0.7*(pct/100));
  const isV = p.orientation==='vertical';
  return isV
    ? `<div style="width:100%;height:100%;display:flex;flex-direction:column;
                  align-items:center;gap:6px">
        <div style="font-size:10px;font-weight:800;color:${baseColor};font-family:monospace">
          ${val.toFixed?val.toFixed(p.decimals||0):val}</div>
        <div style="flex:1;width:8px;background:#e2e8f0;border-radius:4px;
                    position:relative;overflow:hidden">
          <div style="position:absolute;bottom:0;width:100%;height:${pct}%;
                      background:${color};border-radius:4px;transition:height .2s,background .2s"></div>
          <div style="position:absolute;width:18px;height:18px;border-radius:50%;
                      background:#fff;border:3px solid ${color};
                      bottom:calc(${pct}% - 9px);left:-5px;box-shadow:0 2px 6px #0003"></div>
        </div>
        <div style="font-size:9px;color:var(--muted,#6b7280)">${_e(p.unit||'')}</div>
      </div>`
    : `<div style="width:100%;height:100%;display:flex;flex-direction:column;
                  align-items:center;justify-content:center;gap:6px;padding:0 8px;box-sizing:border-box">
        <div style="font-size:11px;font-weight:800;color:${baseColor};font-family:monospace">
          ${val.toFixed?val.toFixed(p.decimals||0):val} ${_e(p.unit||'')}</div>
        <div style="width:100%;height:8px;background:#e2e8f0;border-radius:4px;
                    position:relative">
          <div style="width:${pct}%;height:100%;background:${color};border-radius:4px;transition:width .2s,background .2s"></div>
          <div style="position:absolute;width:18px;height:18px;border-radius:50%;
                      background:#fff;border:3px solid ${color};
                      top:-5px;left:calc(${pct}% - 9px);box-shadow:0 2px 6px #0003"></div>
        </div>
        <div style="display:flex;justify-content:space-between;width:100%;font-size:8px;color:#94a3b8">
          <span>${p.min||0}</span><span>${p.max||100}</span>
        </div>
      </div>`;
}

// ── Checkbox ─────────────────────────────────────────────────────
function _checkbox(val, p) {
  const on = val > 0;
  const color = p.color||'#14b8a6';
  return `<div style="width:100%;height:100%;display:flex;align-items:center;gap:10px;
                      padding:8px;box-sizing:border-box">
    <div style="width:20px;height:20px;border-radius:5px;flex-shrink:0;
                background:${on?color:'transparent'};border:2px solid ${on?color:'#9ca3af'};
                display:flex;align-items:center;justify-content:center;transition:all .15s">
      ${on?`<i class="fa-solid fa-check" style="font-size:11px;color:#fff"></i>`:''}
    </div>
    <span style="font-size:12px;color:var(--text,#1a2332);font-weight:${on?'700':'400'}">
      ${_e(p.label||p.text||'Opción')}
    </span>
  </div>`;
}

// ── Numeric Input ────────────────────────────────────────────────
function _numericInput(val, p) {
  val = typeof val==='number'?val:0;
  const color=p.color||'#14b8a6';
  return `<div style="width:100%;height:100%;display:flex;flex-direction:column;
                      align-items:center;justify-content:center;gap:4px;
                      padding:6px;box-sizing:border-box">
    <div style="font-size:9px;color:var(--muted,#7d8590);text-transform:uppercase;letter-spacing:.4px">
      ${_e(p.label||'Entrada')}</div>
    <div style="display:flex;align-items:center;gap:6px;width:100%">
      <div style="flex:0 0 28px;height:28px;border-radius:6px;background:${color};
                  display:flex;align-items:center;justify-content:center;cursor:pointer;
                  color:#fff;font-weight:800;font-size:16px">−</div>
      <div style="flex:1;height:32px;border:2px solid ${color};border-radius:6px;
                  display:flex;align-items:center;justify-content:center;
                  font-family:monospace;font-size:15px;font-weight:700;color:${color};
                  background:var(--panel2,#21262d)">
        ${val.toFixed?val.toFixed(p.decimals||0):val} ${_e(p.unit||'')}
      </div>
      <div style="flex:0 0 28px;height:28px;border-radius:6px;background:${color};
                  display:flex;align-items:center;justify-content:center;cursor:pointer;
                  color:#fff;font-weight:800;font-size:16px">+</div>
    </div>
  </div>`;
}

// ── Clock Widget ─────────────────────────────────────────────────
function _clock(p) {
  const now = new Date();
  const offset = parseFloat(localStorage?.getItem?.('hmi_tz_offset') ?? '-5');
  const utc = Date.now() + (new Date().getTimezoneOffset()*60000);
  const d   = new Date(utc + offset*3600000);
  const hh = String(d.getHours()).padStart(2,'0');
  const mm = String(d.getMinutes()).padStart(2,'0');
  const ss = String(d.getSeconds()).padStart(2,'0');
  const DIAS   = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
  const MESES  = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const fecha  = DIAS[d.getDay()] + ' ' + d.getDate() + ' ' + MESES[d.getMonth()] + ' ' + d.getFullYear();
  const color  = p.color||'#14b8a6';
  return `<div style="width:100%;height:100%;display:flex;flex-direction:column;
                      align-items:center;justify-content:center;gap:3px">
    <div style="font-family:monospace;font-size:${p.fontSize||22}px;font-weight:800;
                color:${color};letter-spacing:2px">${hh}:${mm}:${ss}</div>
    ${p.showDate!==false?`<div style="font-size:10px;color:var(--muted,#7d8590)">${fecha}</div>`:''}
  </div>`;
}

// ── Camera Placeholder ───────────────────────────────────────────
function _camera(p) {
  return `<div style="width:100%;height:100%;background:#000;border-radius:4px;position:relative;
                      display:flex;align-items:center;justify-content:center;overflow:hidden">
    ${p.url
      ? `<img src="${_e(p.url)}" style="width:100%;height:100%;object-fit:cover;border-radius:4px"
             onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
      : ''}
    <div style="display:${p.url?'none':'flex'};position:absolute;flex-direction:column;
                align-items:center;gap:6px;color:#666;text-align:center;padding:6px">
      <i class="fa-solid fa-video" style="font-size:24px"></i>
      <span style="font-size:10px">${_e(p.label||'Cámara')}</span>
      ${p.url?`<span style="font-size:9px;color:#555;word-break:break-all">${_e(p.url)}</span>`:'<span style="font-size:9px">Configura la URL</span>'}
    </div>
  </div>`;
}

// ── Botón de navegación entre páginas (multipágina) ────────────────
function _navButton(p, kind, isPreview) {
  const bg = p.bg || (kind==='next'?'#22c55e':kind==='prev'?'#64748b':'#0ea5e9');
  const color = p.color || '#ffffff';
  const arrow = kind==='next' ? '→' : kind==='prev' ? '←' : '⇥';
  const icon = (p.showIcon !== false) ? `<span style="font-size:16px">${arrow}</span>` : '';
  const text = _e(p.text || (kind==='next'?'Siguiente':kind==='prev'?'Anterior':'Ir a…'));
  let onclick = '';
  if (isPreview) {
    if (kind==='next') onclick = `onclick="window.__hmiPageNav && window.__hmiPageNav(1, ${p.loop!==false})"`;
    if (kind==='prev') onclick = `onclick="window.__hmiPageNav && window.__hmiPageNav(-1, ${p.loop!==false})"`;
    if (kind==='goto') onclick = `onclick="window.__hmiPageGoto && window.__hmiPageGoto('${_e(p.targetPage||'')}')"`;
  }
  const disabled = (kind==='goto' && !p.targetPage) ? 'opacity:0.55' : '';
  return `<button type="button" ${onclick} style="
      width:100%;height:100%;background:${bg};color:${color};${disabled}
      border:none;border-radius:6px;font-weight:700;font-size:13px;
      cursor:${isPreview?'pointer':'default'};box-shadow:0 2px 0 rgba(0,0,0,.18);
      display:flex;align-items:center;justify-content:center;gap:8px;
      padding:0 10px;box-sizing:border-box;user-select:none">
    ${kind==='prev'?icon:''}<span>${text}</span>${kind!=='prev'?icon:''}
  </button>`;
}


function _textEl(p) {
  return `<div style="width:100%;height:100%;display:flex;align-items:${p.vAlign||'center'};
                      justify-content:${p.hAlign||'flex-start'};overflow:hidden;
                      font-size:${p.fontSize||14}px;color:${p.color||'#1a2332'};
                      font-weight:${p.bold?700:400};font-style:${p.italic?'italic':'normal'};
                      text-decoration:${p.underline?'underline':'none'};
                      word-break:break-word;padding:2px;box-sizing:border-box">
    ${_e(p.text||'Texto')}
  </div>`;
}

// ── Image Widget ─────────────────────────────────────────────────
function _imageWidget(p) {
  if (!p.url && !p.svgPath) return `<div style="width:100%;height:100%;border:2px dashed #94a3b8;
    border-radius:6px;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:11px">
    <i class="fa-solid fa-image"></i> URL de imagen</div>`;
  const src = p.url || p.svgPath || '';
  return `<img src="${_e(src)}" style="width:100%;height:100%;object-fit:${p.fit||'contain'};
              border-radius:${p.radius||0}px;opacity:${p.opacity||1}"
           onerror="this.src='data:image/svg+xml,<svg xmlns=\\'http://www.w3.org/2000/svg\\' viewBox=\\'0 0 50 50\\'><rect width=\\'50\\' height=\\'50\\' fill=\\'%23374151\\'/><text x=\\'25\\' y=\\'30\\' text-anchor=\\'middle\\' fill=\\'%23888\\' font-size=\\'14\\'>?</text></svg>'">`;
}

// ── Icon Widget ──────────────────────────────────────────────────
function _iconWidget(p) {
  return `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center">
    <i class="${_e(p.iconClass||'fa-solid fa-star')}"
       style="font-size:${p.iconSize||32}px;color:${p.color||'#14b8a6'}"></i>
  </div>`;
}

// ── Line Widget ──────────────────────────────────────────────────
function _lineWidget(p) {
  const deg = p.angle||0;
  // strokeStyle nuevo (solid/dashed/dotted), con fallback al 'dashed' booleano clásico
  let style = p.strokeStyle || (p.dashed ? 'dashed' : 'solid');
  const sw = p.strokeW||2;
  let dasharray = 'none';
  if (style === 'dashed') dasharray = `${sw*4},${sw*2}`;
  if (style === 'dotted') dasharray = `${sw},${sw*1.6}`;
  return `<svg viewBox="0 0 100 100" preserveAspectRatio="none"
               xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;overflow:visible">
    <line x1="0" y1="50" x2="100" y2="50"
          stroke="${p.color||'#14b8a6'}" stroke-width="${sw}"
          stroke-dasharray="${dasharray}" stroke-linecap="${style==='dotted'?'round':'round'}"
          transform="rotate(${deg},50,50) scale(1,${sw})"/>
  </svg>`;
}

// ── Chart Placeholder (editor) / Real (preview) ──────────────────
function _chartEl(w, p, tagValues) {
  if (tagValues) {
    // Preview: render canvas para Chart.js
    return `<canvas id="chart_${_e(w.id)}" style="width:100%;height:100%"></canvas>`;
  }
  const icons = {line:'📈',area:'📉',bar:'📊',pie:'🥧',realtime:'⚡',scatter:'✦',hist:'📶'};
  return `<div style="width:100%;height:100%;background:var(--panel2,#f1f5f9);
                      border:1.5px dashed #94a3b8;border-radius:6px;
                      display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;
                      color:#64748b">
    <span style="font-size:28px">${icons[p.chartType||'line']||'📈'}</span>
    <span style="font-weight:700;font-size:12px">${_e(p.title||'Gráfica')}</span>
    <span style="font-size:10px">${p.tag?'Tag: '+_e(p.tag):'Sin tag asignado'}</span>
    <span style="font-size:9px;color:#94a3b8">${p.chartType||'line'} · ${p.maxPoints||60} pts · ${_e(p.unit||'')}</span>
  </div>`;
}

// ── Industrial Widget (SVG + estado) ─────────────────────────────
function _industrial(val, p, type) {
  const on = val > 0;
  const svgFiles = {
    'ind-motor':    ['dinamicos/motor.svg','dinamicos/motor1.svg'],
    'ind-pump':     ['dinamicos/pump1.svg','dinamicos/pump_3d_90_1.svg'],
    'ind-valve':    ['dinamicos/valve_3d_h2_open.svg','dinamicos/valve_3d_h2_closed.svg'],
    'ind-pump3d':   ['dinamicos/pump_3d_straight1.svg','dinamicos/pump_3d_straight1_flipped.svg'],
    'ind-conveyor': ['dinamicos/conveyor.svg','dinamicos/conveyor.svg'],
    'ind-fan':      ['dinamicos/blower3.svg','dinamicos/blower4.svg'],
    'ind-sensor':   ['dinamicos/sensor_rtd.svg','dinamicos/sensor_rtd.svg'],
    'ind-flowmeter':['dinamicos/flowmeter.svg','dinamicos/flowmeter1.svg'],
  };
  const svgPair = svgFiles[type] || ['dinamicos/pump1.svg','dinamicos/pump1.svg'];
  const svgSrc  = p.svgOverride || ('imagenes/widgets/' + (on ? svgPair[0] : svgPair[1]));
  const color   = on ? (p.colorOn||'#22c55e') : (p.colorOff||'#6b7280');
  const animCss = on && p.animacion!=='ninguna'
    ? `animation:${p.animacion||'spin'} ${p.animSpeed||2}s linear infinite`
    : '';
  return `<div style="width:100%;height:100%;display:flex;flex-direction:column;
                      align-items:center;justify-content:center;gap:4px;position:relative">
    <img src="${_e(svgSrc)}" style="width:80%;height:75%;object-fit:contain;
              filter:${on
                ? `drop-shadow(0 0 6px ${color}88) saturate(1.5) brightness(1.1)`
                : 'grayscale(60%) brightness(0.8)'};
              ${animCss}"
         onerror="this.style.display='none'">
    <div style="font-size:9px;font-weight:700;color:${color};letter-spacing:.4px">
      ${on ? _e(p.textOn||'ACTIVO') : _e(p.textOff||'PARADO')}
    </div>
    ${p.label?`<div style="font-size:8px;color:var(--muted,#7d8590)">${_e(p.label)}</div>`:''}
    <div style="position:absolute;top:2px;right:2px;width:8px;height:8px;
                border-radius:50%;background:${color};
                box-shadow:${on?`0 0 5px ${color}`:'none'}"></div>
  </div>
  <style>
    @keyframes spin{to{transform:rotate(360deg)}}
    @keyframes pulse-ind{0%,100%{opacity:1}50%{opacity:.5}}
  </style>`;
}

// ════════════════════════════════════════════════════════════════
// WIDGET DEFINITIONS — registro centralizado
// ════════════════════════════════════════════════════════════════
const DEFS = {
  // ── BÁSICOS ──────────────────────────────────────────────────
  'label': {
    category:'Básicos', label:'Label / Texto', icon:'🔤',
    defaultSize:{w:160,h:36}, defaults:{text:'Etiqueta',fontSize:14,color:'#1a2332',bold:false,italic:false,underline:false,hAlign:'flex-start',vAlign:'center'},
    schema:[{k:'text',l:'Texto',t:'textarea'},{k:'fontSize',l:'Tamaño fuente',t:'number',min:8,max:72},{k:'color',l:'Color',t:'color'},{k:'bold',l:'Negrita',t:'bool'},{k:'italic',l:'Cursiva',t:'bool'},{k:'hAlign',l:'Alineación H',t:'select',opts:[{v:'flex-start',l:'Izquierda'},{v:'center',l:'Centro'},{v:'flex-end',l:'Derecha'}]}],
    render:(w,tv)=>_textEl(w.props)
  },
  'image':{
    category:'Básicos',label:'Imagen',icon:'🖼️',
    defaultSize:{w:120,h:120},defaults:{url:'',fit:'contain',radius:0,opacity:1},
    schema:[
      {k:'url',l:'URL o archivo (ver propiedades)',t:'text'},
      {k:'fit',l:'Ajuste',t:'select',opts:[{v:'contain',l:'Contener'},{v:'cover',l:'Cubrir'},{v:'fill',l:'Estirar'}]},
      {k:'radius',l:'Bordes redondeados',t:'number',min:0,max:80},
      {k:'opacity',l:'Opacidad (0-1)',t:'number',min:0,max:1}
    ],
    propsExtra: (w) => `
      <div class="prop-row">
        <label>📁 Subir imagen desde PC</label>
        <input type="file" accept="image/*,image/svg+xml"
               style="font-size:11px;padding:6px;border:1px solid var(--border2);
                      border-radius:6px;background:var(--bg2);color:var(--text);width:100%;
                      box-sizing:border-box;cursor:pointer"
               onchange="WL._uploadImg('${w.id}', this)">
        <div style="font-size:9px;color:var(--muted);margin-top:3px">
          PNG, JPG, SVG — se guarda en el canvas (base64)
        </div>
      </div>`,
    render:(w,tv)=>_imageWidget(w.props)
  },
  'icon':{
    category:'Básicos',label:'Ícono',icon:'⭐',
    defaultSize:{w:60,h:60},defaults:{iconClass:'fa-solid fa-star',iconSize:32,color:'#14b8a6'},
    schema:[{k:'iconClass',l:'Clase FontAwesome (ej: fa-solid fa-star)',t:'text'},{k:'iconSize',l:'Tamaño (px)',t:'number',min:8,max:120},{k:'color',l:'Color',t:'color'}],
    render:(w,tv)=>_iconWidget(w.props)
  },
  'line':{
    category:'Básicos',label:'Línea',icon:'━',
    defaultSize:{w:200,h:4},defaults:{color:'#14b8a6',strokeW:2,strokeStyle:'solid',dashed:false,angle:0},
    schema:[{k:'color',l:'Color',t:'color'},{k:'strokeW',l:'Grosor (px)',t:'number',min:1,max:20},
      {k:'strokeStyle',l:'Estilo de trazo',t:'select',opts:[{v:'solid',l:'Sólido'},{v:'dashed',l:'Discontinuo'},{v:'dotted',l:'Punteado'}]}],
    render:(w,tv)=>_lineWidget(w.props)
  },
  'rect':{
    category:'Básicos',label:'Rectángulo',icon:'⬜',
    defaultSize:{w:120,h:80},defaults:{fill:'transparent',stroke:'#14b8a6',strokeW:2,strokeStyle:'solid',radius:4},
    schema:[{k:'fill',l:'Relleno',t:'color'},{k:'stroke',l:'Borde',t:'color'},{k:'strokeW',l:'Grosor borde',t:'number',min:0,max:20},
      {k:'strokeStyle',l:'Estilo de borde',t:'select',opts:[{v:'solid',l:'Sólido'},{v:'dashed',l:'Discontinuo'},{v:'dotted',l:'Punteado'}]},
      {k:'radius',l:'Radio esquinas',t:'number',min:0,max:60}],
    render:(w,tv)=>`<div style="width:100%;height:100%;background:${w.props.fill||'transparent'};border:${w.props.strokeW||2}px ${w.props.strokeStyle||'solid'} ${w.props.stroke||'#14b8a6'};border-radius:${w.props.radius||4}px;box-sizing:border-box"></div>`
  },
  'ellipse':{
    category:'Básicos',label:'Elipse / Círculo',icon:'⭕',
    defaultSize:{w:80,h:80},defaults:{fill:'transparent',stroke:'#14b8a6',strokeW:2,strokeStyle:'solid'},
    schema:[{k:'fill',l:'Relleno',t:'color'},{k:'stroke',l:'Borde',t:'color'},{k:'strokeW',l:'Grosor borde',t:'number',min:0,max:20},
      {k:'strokeStyle',l:'Estilo de borde',t:'select',opts:[{v:'solid',l:'Sólido'},{v:'dashed',l:'Discontinuo'},{v:'dotted',l:'Punteado'}]}],
    render:(w,tv)=>`<div style="width:100%;height:100%;background:${w.props.fill||'transparent'};border:${w.props.strokeW||2}px ${w.props.strokeStyle||'solid'} ${w.props.stroke||'#14b8a6'};border-radius:50%;box-sizing:border-box"></div>`
  },
  'svg':{
    category:'SVG',label:'Imagen SVG',icon:'🔧',
    defaultSize:{w:80,h:80},defaults:{svgPath:'',label:''},
    schema:[{k:'tag',l:'Tag (estado ON/OFF)',t:'tag'}],
    render:(w,tv)=>{
      const val=_tv(tv,w.props.tag,0);const on=val>0;
      return `<img src="${_e(w.svgPath||w.ruta||w.props.svgPath||'')}"
        style="width:100%;height:100%;object-fit:contain;pointer-events:none;
               filter:${on?'none':'grayscale(40%) brightness(0.85)'}"
        onerror="this.src='data:image/svg+xml,<svg xmlns=\\'http://www.w3.org/2000/svg\\' viewBox=\\'0 0 50 50\\'><rect width=\\'50\\' height=\\'50\\' fill=\\'%2330363d\\' rx=\\'4\\'/><text x=\\'25\\' y=\\'30\\' text-anchor=\\'middle\\' fill=\\'%23888\\' font-size=\\'14\\'>?</text></svg>'">`;
    }
  },

  // ── CONTROLES ─────────────────────────────────────────────────
  'button':{
    category:'Controles',label:'Botón (Push)',icon:'⬛',
    defaultSize:{w:130,h:44},defaults:{text:'Botón',tag:'',modo:'momentaneo',valorOn:1,valorOff:0,color:'#14b8a6',colorOn:'#14b8a6',colorOff:'#14b8a6',icon:'',fontSize:13},
    schema:[{k:'text',l:'Texto',t:'text'},{k:'tag',l:'Tag',t:'tag'},{k:'modo',l:'Modo',t:'select',opts:[{v:'momentaneo',l:'Momentáneo'},{v:'toggle',l:'Toggle'}]},{k:'valorOn',l:'Valor ON',t:'number'},{k:'valorOff',l:'Valor OFF',t:'number'},{k:'colorOn',l:'Color ON',t:'color'},{k:'colorOff',l:'Color OFF',t:'color'},{k:'icon',l:'Ícono FA (ej: play)',t:'text'}],
    render:(w,tv,isP)=>{
      const p = w.props||{};
      const on = _tv(tv,p.tag,0)>0;
      // colorOn/colorOff nuevos, con fallback al 'color' clásico para compatibilidad con botones ya guardados
      const colorOn  = p.colorOn  || p.color || '#14b8a6';
      const colorOff = p.colorOff || p.color || '#14b8a6';
      const text  = p.text||'Botón';
      const active = (p.modo==='toggle') && on;
      // El color del botón siempre refleja el estado actual del tag (encendido/apagado),
      // no solo cuando está en modo 'toggle' activo.
      const color = on ? colorOn : colorOff;
      const click = (isP && p.tag) ? `onclick="WL._cmd('${w.id}','click')"` : '';
      const icon = p.icon ? `<i class="fa-solid fa-${_e(p.icon)}" style="margin-right:5px;pointer-events:none"></i>` : '';
      return `<div ${click} style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;
                          border-radius:8px;cursor:${isP&&p.tag?'pointer':'default'};font-weight:700;
                          font-size:${parseInt(p.fontSize)||13}px;
                          background:${active?color:'transparent'};
                          color:${active?'#fff':color};
                          border:2px solid ${color};
                          box-shadow:${active?`0 4px 12px ${color}44`:'none'};
                          transition:all .15s ease;user-select:none">
        ${icon}<span style="pointer-events:none">${_e(text)}</span>
      </div>`;
    }
  },
  'toggle':{
    category:'Controles',label:'Toggle Switch',icon:'🔘',
    defaultSize:{w:100,h:70},defaults:{tag:'',textOn:'ON',textOff:'OFF',colorOn:'#14b8a6',colorOff:'#6b7280',label:'Switch'},
    schema:[{k:'tag',l:'Tag',t:'tag'},{k:'textOn',l:'Texto ON',t:'text'},{k:'textOff',l:'Texto OFF',t:'text'},{k:'colorOn',l:'Color ON',t:'color'},{k:'colorOff',l:'Color OFF',t:'color'},{k:'label',l:'Etiqueta',t:'text'}],
    render:(w,tv,isP)=>{
      const p = w.props||{};
      const on = _tv(tv,p.tag,0)>0;
      const color = p.colorOn||'#14b8a6';
      const off   = p.colorOff||'#6b7280';
      const click = (isP && p.tag) ? `onclick="WL._cmd('${w.id}','toggle')"` : '';
      return `<div ${click} style="width:100%;height:100%;display:flex;flex-direction:column;
                          align-items:center;justify-content:center;gap:6px;
                          cursor:${isP&&p.tag?'pointer':'default'};user-select:none">
        <div ${click} style="width:52px;height:28px;border-radius:14px;background:${on?color:off};
                    position:relative;transition:background .2s;box-shadow:inset 0 1px 3px #0003">
          <div style="position:absolute;width:22px;height:22px;border-radius:50%;
                      background:#fff;top:3px;left:${on?'27px':'3px'};
                      box-shadow:0 1px 4px #0004;transition:left .2s ease"></div>
        </div>
        <div style="font-size:10px;font-weight:700;color:${on?color:off}">
          ${on ? _e(p.textOn||'ON') : _e(p.textOff||'OFF')}
        </div>
        ${p.label?`<div style="font-size:9px;color:var(--muted,#6b7280)">${_e(p.label)}</div>`:''}
      </div>`;
    }
  },
  'slider':{
    category:'Controles',label:'Slider',icon:'🎚️',
    defaultSize:{w:200,h:60},defaults:{tag:'',min:0,max:100,step:1,unit:'',orientation:'horizontal',color:'#14b8a6',decimals:0},
    schema:[{k:'tag',l:'Tag',t:'tag'},{k:'min',l:'Mínimo',t:'number'},{k:'max',l:'Máximo',t:'number'},{k:'unit',l:'Unidad',t:'text'},{k:'color',l:'Color',t:'color'},{k:'orientation',l:'Orientación',t:'select',opts:[{v:'horizontal',l:'Horizontal'},{v:'vertical',l:'Vertical'}]}],
    render:(w,tv,isP)=>{
      const p = w.props||{};
      const val = _tv(tv,p.tag,(parseFloat(p.min||0)+parseFloat(p.max||100))/2);
      const baseColor = p.color||'#14b8a6';
      const pct = _pct(val, parseFloat(p.min||0), parseFloat(p.max||100))*100;
      // Intensidad/opacidad del color según el valor actual (tenue en 0%, saturado en 100%)
      const color = _colorAlpha(baseColor, 0.3 + 0.7*(pct/100));
      const isV   = p.orientation==='vertical';
      if (isP && p.tag) {
        // Modo interactivo: input range real
        if (isV) {
          return `<div style="width:100%;height:100%;display:flex;flex-direction:column;
                              align-items:center;gap:4px;padding:4px;box-sizing:border-box">
            <span style="font-size:11px;font-weight:800;color:${baseColor};font-family:monospace">
              ${val.toFixed?val.toFixed(p.decimals||0):val} ${_e(p.unit||'')}</span>
            <input type="range" orient="vertical" min="${p.min||0}" max="${p.max||100}"
                   step="${p.step||1}" value="${val}"
                   style="writing-mode:vertical-lr;direction:rtl;flex:1;accent-color:${color};
                          pointer-events:auto;cursor:pointer"
                   oninput="this.previousElementSibling.textContent=this.value+' ${_e(p.unit||'')}'"
                   onchange="WL._cmd('${w.id}',+this.value)">
          </div>`;
        }
        return `<div style="width:100%;height:100%;display:flex;flex-direction:column;
                            justify-content:center;gap:4px;padding:4px 8px;box-sizing:border-box">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <span style="font-size:10px;color:var(--muted,#6b7280)">${p.min||0}</span>
            <span style="font-size:12px;font-weight:800;color:${baseColor};font-family:monospace"
                  id="sv_${w.id}">${val.toFixed?val.toFixed(p.decimals||0):val} ${_e(p.unit||'')}</span>
            <span style="font-size:10px;color:var(--muted,#6b7280)">${p.max||100}</span>
          </div>
          <input type="range" min="${p.min||0}" max="${p.max||100}"
                 step="${p.step||1}" value="${val}"
                 style="width:100%;accent-color:${color};pointer-events:auto;cursor:pointer"
                 oninput="const el=document.getElementById('sv_${w.id}');if(el)el.textContent=this.value+' ${_e(p.unit||'')}'"
                 onchange="WL._cmd('${w.id}',+this.value)">
        </div>`;
      }
      return _slider(val, p);
    }
  },
  'checkbox':{
    category:'Controles',label:'Checkbox',icon:'☑️',
    defaultSize:{w:150,h:36},defaults:{tag:'',label:'Opción',color:'#14b8a6'},
    schema:[{k:'tag',l:'Tag',t:'tag'},{k:'label',l:'Texto',t:'text'},{k:'color',l:'Color activo',t:'color'}],
    render:(w,tv,isP)=>{
      const p = w.props||{};
      const on = _tv(tv,p.tag,0)>0;
      const color = p.color||'#14b8a6';
      const click = (isP && p.tag) ? `onclick="WL._cmd('${w.id}','toggle')"` : '';
      return `<div ${click} style="width:100%;height:100%;display:flex;align-items:center;gap:10px;
                          padding:8px;box-sizing:border-box;cursor:${isP&&p.tag?'pointer':'default'};
                          user-select:none">
        <div style="width:20px;height:20px;border-radius:5px;flex-shrink:0;pointer-events:none;
                    background:${on?color:'transparent'};border:2px solid ${on?color:'#9ca3af'};
                    display:flex;align-items:center;justify-content:center;transition:all .15s">
          ${on?`<i class="fa-solid fa-check" style="font-size:11px;color:#fff"></i>`:''}
        </div>
        <span style="font-size:12px;color:var(--text,#1a2332);font-weight:${on?'700':'400'};pointer-events:none">
          ${_e(p.label||p.text||'Opción')}
        </span>
      </div>`;
    }
  },
  'numeric-input':{
    category:'Controles',label:'Entrada Numérica',icon:'✏️',
    defaultSize:{w:160,h:65},defaults:{tag:'',min:0,max:100,step:1,unit:'',label:'Valor',color:'#14b8a6',decimals:0},
    schema:[{k:'tag',l:'Tag',t:'tag'},{k:'label',l:'Etiqueta',t:'text'},{k:'min',l:'Mínimo',t:'number'},{k:'max',l:'Máximo',t:'number'},{k:'unit',l:'Unidad',t:'text'},{k:'color',l:'Color',t:'color'}],
    render:(w,tv,isP)=>{
      const p = w.props||{};
      const val = _tv(tv,p.tag,0);
      const color = p.color||'#14b8a6';
      const step  = parseFloat(p.step||1);
      const mn    = parseFloat(p.min||0);
      const mx    = parseFloat(p.max||100);
      const minusEvt = (isP && p.tag)
        ? `onclick="WL._cmd('${w.id}','minus')" style="...;cursor:pointer"`
        : `style="..."`;
      const plusEvt  = (isP && p.tag)
        ? `onclick="WL._cmd('${w.id}','plus')"  style="...;cursor:pointer"`
        : `style="..."`;
      return `<div style="width:100%;height:100%;display:flex;flex-direction:column;
                          align-items:center;justify-content:center;gap:4px;
                          padding:6px;box-sizing:border-box">
        <div style="font-size:9px;color:var(--muted,#7d8590);text-transform:uppercase;letter-spacing:.4px">
          ${_e(p.label||'Entrada')}</div>
        <div style="display:flex;align-items:center;gap:6px;width:100%">
          <div style="flex:0 0 30px;height:30px;border-radius:6px;background:${color};
                      display:flex;align-items:center;justify-content:center;
                      color:#fff;font-weight:800;font-size:18px;user-select:none;
                      cursor:${isP&&p.tag?'pointer':'default'}"
               ${isP&&p.tag?`onclick="WL._cmd('${w.id}','minus')"`:''}>−</div>
          <div style="flex:1;height:32px;border:2px solid ${color};border-radius:6px;
                      display:flex;align-items:center;justify-content:center;
                      font-family:monospace;font-size:15px;font-weight:700;color:${color};
                      background:var(--panel2,#21262d)">
            ${val.toFixed?val.toFixed(p.decimals||0):val} ${_e(p.unit||'')}
          </div>
          <div style="flex:0 0 30px;height:30px;border-radius:6px;background:${color};
                      display:flex;align-items:center;justify-content:center;
                      color:#fff;font-weight:800;font-size:18px;user-select:none;
                      cursor:${isP&&p.tag?'pointer':'default'}"
               ${isP&&p.tag?`onclick="WL._cmd('${w.id}','plus')"`:''}>+</div>
        </div>
      </div>`;
    }
  },

  // ── INDICADORES ───────────────────────────────────────────────
  'bit-lamp':{
    category:'Indicadores',label:'Bit Lamp',icon:'🔵',
    defaultSize:{w:70,h:70},defaults:{tag:'',etiqueta:'Estado',colorOn:'#22c55e',colorOff:'#6b7280',forma:'circulo'},
    schema:[{k:'tag',l:'Tag',t:'tag'},{k:'etiqueta',l:'Etiqueta',t:'text'},{k:'colorOn',l:'Color ON',t:'color'},{k:'colorOff',l:'Color OFF',t:'color'},{k:'forma',l:'Forma',t:'select',opts:[{v:'circulo',l:'Círculo'},{v:'cuadrado',l:'Cuadrado'},{v:'rombo',l:'Rombo'}]}],
    render:(w,tv)=>_bitLamp(_tv(tv,w.props.tag,0),w.props)
  },
  'led':{
    category:'Indicadores',label:'LED',icon:'💡',
    defaultSize:{w:50,h:50},defaults:{tag:'',colorOn:'#22c55e',colorOff:'#374151',forma:'circulo'},
    schema:[{k:'tag',l:'Tag',t:'tag'},{k:'colorOn',l:'Color ON',t:'color'},{k:'colorOff',l:'Color OFF',t:'color'},{k:'forma',l:'Forma',t:'select',opts:[{v:'circulo',l:'Círculo'},{v:'cuadrado',l:'Cuadrado'},{v:'rombo',l:'Rombo'}]}],
    render:(w,tv)=>_led(_tv(tv,w.props.tag,0),w.props)
  },
  'numd':{
    category:'Indicadores',label:'Visor Numérico',icon:'🔢',
    defaultSize:{w:150,h:65},defaults:{tag:'',etiqueta:'Valor',unit:'',decimals:2,color:'#14b8a6',alarmLo:null,alarmHi:null},
    schema:[{k:'tag',l:'Tag',t:'tag'},{k:'etiqueta',l:'Etiqueta',t:'text'},{k:'unit',l:'Unidad',t:'text'},{k:'decimals',l:'Decimales',t:'number',min:0,max:6},{k:'color',l:'Color',t:'color'},{k:'alarmLo',l:'Alarma mínima',t:'number'},{k:'alarmHi',l:'Alarma máxima',t:'number'}],
    render:(w,tv)=>_numericDisplay(
      tv ? _tv(tv,w.props.tag,null)
         : _demoVal(w.props, 42.5),
      w.props)
  },
  'lcd-text':{
    category:'Indicadores',label:'Pantalla LCD (Texto)',icon:'🖥️',
    defaultSize:{w:190,h:70},
    defaults:{tag:'',cols:16,rows:2,color:'#00ff88',bgColor:'#0b1f14',fontSize:14,placeholder:'Sin datos...'},
    schema:[
      {k:'tag',l:'Tag (string)',t:'tag'},
      {k:'cols',l:'Columnas (caracteres)',t:'number',min:4,max:40},
      {k:'rows',l:'Filas',t:'number',min:1,max:4},
      {k:'fontSize',l:'Tamaño de fuente',t:'number',min:8,max:28},
      {k:'color',l:'Color de texto',t:'color'},
      {k:'bgColor',l:'Color de fondo',t:'color'},
      {k:'placeholder',l:'Texto sin datos',t:'text'},
    ],
    // Recibe/muestra cadenas de caracteres (strings) enviadas desde el ESP32,
    // complementando al Visor Numérico (numd) que solo maneja valores numéricos.
    render:(w,tv)=>_lcdText(
      tv ? _tv(tv,w.props.tag,null)
         : (w.props.placeholder || 'HOLA MUNDO'),
      w.props)
  },
  'progress-bar':{
    category:'Indicadores',label:'Barra de Progreso',icon:'📶',
    defaultSize:{w:200,h:28},defaults:{tag:'',min:0,max:100,unit:'',color:'#14b8a6',orientation:'horizontal',decimals:0},
    schema:[{k:'tag',l:'Tag',t:'tag'},{k:'min',l:'Mínimo',t:'number'},{k:'max',l:'Máximo',t:'number'},{k:'unit',l:'Unidad',t:'text'},{k:'color',l:'Color',t:'color'},{k:'orientation',l:'Orientación',t:'select',opts:[{v:'horizontal',l:'Horizontal'},{v:'vertical',l:'Vertical'}]}],
    render:(w,tv)=>_progressBar(
      tv ? _tv(tv,w.props.tag,(parseFloat(w.props.min||0)+parseFloat(w.props.max||100))/2)
         : _demoVal(w.props, 55),
      w.props)
  },
  
  'seven-seg':{
    category:'Indicadores',label:'Display 7 Segmentos',icon:'🔋',
    defaultSize:{w:120,h:50},defaults:{tag:'',digits:4,color:'#00ff88',bgColor:'#111',label:''},
    schema:[{k:'tag',l:'Tag',t:'tag'},{k:'digits',l:'Número de dígitos',t:'number',min:1,max:8},{k:'color',l:'Color de segmentos',t:'color'},{k:'bgColor',l:'Color de fondo',t:'color'},{k:'label',l:'Etiqueta',t:'text'}],
    render:(w,tv)=>_sevenSeg(_tv(tv,w.props.tag,0),w.props)
  },
  'alarm-ind':{
    category:'Indicadores',label:'Indicador de Alarma',icon:'⚠️',
    defaultSize:{w:100,h:80},defaults:{tag:'',textOn:'ALARMA',textOff:'NORMAL',colorOn:'#ef4444',colorOff:'#22c55e'},
    schema:[{k:'tag',l:'Tag (0=normal, 1=alarma)',t:'tag'},{k:'textOn',l:'Texto alarma activa',t:'text'},{k:'textOff',l:'Texto estado normal',t:'text'},{k:'colorOn',l:'Color alarma',t:'color'},{k:'colorOff',l:'Color normal',t:'color'}],
    render:(w,tv)=>_alarmInd(_tv(tv,w.props.tag,0),w.props)
  },

  // ── GRÁFICAS ──────────────────────────────────────────────────
  'chart-line':{
    category:'Gráficas',label:'Gráfica de Línea',icon:'📈',
    defaultSize:{w:320,h:200},defaults:{tag:'',title:'Tendencia',unit:'',color:'#14b8a6',maxPoints:60,chartType:'line',showGrid:true,showLegend:false},
    schema:[{k:'tag',l:'Tag',t:'tag'},{k:'title',l:'Título',t:'text'},{k:'unit',l:'Unidad',t:'text'},{k:'color',l:'Color',t:'color'},{k:'maxPoints',l:'Máx. puntos',t:'number',min:10,max:500},{k:'chartType',l:'Tipo',t:'select',opts:[{v:'line',l:'Línea'},{v:'area',l:'Área'}]},{k:'showGrid',l:'Mostrar cuadrícula',t:'bool'}],
    render:(w,tv)=>_chartEl(w,{...w.props,chartType:'line'},tv)
  },
  'chart-area':{
    category:'Gráficas',label:'Gráfica de Área',icon:'📉',
    defaultSize:{w:320,h:200},defaults:{tag:'',title:'Tendencia',unit:'',color:'#14b8a6',maxPoints:60,chartType:'area'},
    schema:[{k:'tag',l:'Tag',t:'tag'},{k:'title',l:'Título',t:'text'},{k:'unit',l:'Unidad',t:'text'},{k:'color',l:'Color',t:'color'},{k:'maxPoints',l:'Máx. puntos',t:'number',min:10,max:500}],
    render:(w,tv)=>_chartEl(w,{...w.props,chartType:'area'},tv)
  },
  'chart-bar':{
    category:'Gráficas',label:'Gráfica de Barras',icon:'📊',
    defaultSize:{w:320,h:200},defaults:{tag:'',title:'Histograma',unit:'',color:'#14b8a6',maxPoints:30,chartType:'bar'},
    schema:[{k:'tag',l:'Tag',t:'tag'},{k:'title',l:'Título',t:'text'},{k:'unit',l:'Unidad',t:'text'},{k:'color',l:'Color',t:'color'},{k:'maxPoints',l:'Máx. barras',t:'number',min:5,max:100}],
    render:(w,tv)=>_chartEl(w,{...w.props,chartType:'bar'},tv)
  },
  'chart-pie':{
    category:'Gráficas',label:'Gráfica Circular',icon:'🥧',
    defaultSize:{w:200,h:200},defaults:{tags:'',title:'Distribución',chartType:'pie'},
    schema:[{k:'title',l:'Título',t:'text'}],
    render:(w,tv)=>_chartEl(w,{...w.props,chartType:'pie'},tv)
  },
  'chart-realtime':{
    category:'Gráficas',label:'Tendencia en Tiempo Real',icon:'⚡',
    defaultSize:{w:350,h:200},defaults:{tag:'',title:'Tiempo Real',unit:'',color:'#14b8a6',maxPoints:60,chartType:'realtime',interval:2000},
    schema:[{k:'tag',l:'Tag',t:'tag'},{k:'title',l:'Título',t:'text'},{k:'unit',l:'Unidad',t:'text'},{k:'color',l:'Color',t:'color'},{k:'maxPoints',l:'Máx. puntos',t:'number',min:10,max:500}],
    render:(w,tv)=>_chartEl(w,{...w.props,chartType:'realtime'},tv)
  },

  // ── UTILIDADES ────────────────────────────────────────────────
  'clock-widget':{
    category:'Utilidades',label:'Reloj / Fecha',icon:'🕐',
    defaultSize:{w:180,h:60},defaults:{color:'#14b8a6',fontSize:22,showDate:true},
    schema:[{k:'color',l:'Color',t:'color'},{k:'fontSize',l:'Tamaño hora',t:'number',min:12,max:48},{k:'showDate',l:'Mostrar fecha',t:'bool'}],
    render:(w,tv)=>_clock(w.props)
  },
  'camera-widget':{
    category:'Utilidades',label:'Cámara IP / MJPEG',icon:'📷',
    defaultSize:{w:240,h:180},defaults:{url:'',label:'Cámara'},
    schema:[{k:'url',l:'URL del stream',t:'text',ph:'http://192.168.1.50:8081/stream',hint:'Ej: http://192.168.1.50:8081/stream (MJPEG / ESP32-CAM) o rtsp://usuario:clave@192.168.1.100:554/stream1'},{k:'label',l:'Etiqueta',t:'text'}],
    render:(w,tv)=>_camera(w.props)
  },

  // ── NAVEGACIÓN (multipágina) ────────────────────────────────────
  // Llaman a window.__hmiPageNav(delta) / window.__hmiPageGoto(id), funciones
  // globales definidas por editor.html (vista previa) y view.html (runtime).
  'next-page':{
    category:'Navegación',label:'Página siguiente',icon:'➡️',
    defaultSize:{w:130,h:44},
    defaults:{text:'Siguiente',showIcon:true,loop:true,bg:'#22c55e',color:'#ffffff'},
    schema:[
      {k:'text',l:'Texto',t:'text'},
      {k:'showIcon',l:'Mostrar flecha',t:'bool'},
      {k:'loop',l:'Ciclar al llegar al final',t:'bool'},
      {k:'bg',l:'Fondo',t:'color'},
      {k:'color',l:'Color de texto',t:'color'},
    ],
    render:(w,tv,isP)=>_navButton(w.props,'next',isP)
  },
  'prev-page':{
    category:'Navegación',label:'Página anterior',icon:'⬅️',
    defaultSize:{w:130,h:44},
    defaults:{text:'Anterior',showIcon:true,loop:true,bg:'#64748b',color:'#ffffff'},
    schema:[
      {k:'text',l:'Texto',t:'text'},
      {k:'showIcon',l:'Mostrar flecha',t:'bool'},
      {k:'loop',l:'Ciclar al llegar al inicio',t:'bool'},
      {k:'bg',l:'Fondo',t:'color'},
      {k:'color',l:'Color de texto',t:'color'},
    ],
    render:(w,tv,isP)=>_navButton(w.props,'prev',isP)
  },
  'goto-page':{
    category:'Navegación',label:'Ir a página…',icon:'⇥',
    defaultSize:{w:150,h:44},
    defaults:{text:'Ir a…',targetPage:'',bg:'#0ea5e9',color:'#ffffff'},
    schema:[
      {k:'text',l:'Texto',t:'text'},
      {k:'targetPage',l:'ID de página destino',t:'text',ph:'p1, p2, p3…',hint:'Copia el ID desde las pestañas de página en el editor'},
      {k:'bg',l:'Fondo',t:'color'},
      {k:'color',l:'Color de texto',t:'color'},
    ],
    render:(w,tv,isP)=>_navButton(w.props,'goto',isP)
  },
};

// ════════════════════════════════════════════════════════════════
// PROPIEDADES PANEL — generador unificado
// ════════════════════════════════════════════════════════════════
function buildPropsHTML(w) {
  const def = DEFS[w.type];
  if (!def) return '<div style="padding:20px 0;text-align:center;color:var(--muted);font-size:11px">Tipo desconocido: '+_e(w.type)+'</div>';
  const p = { ...def.defaults, ...(w.props||{}) };
  const schema = def.schema || [];
  return `
    <div class="prop-section"><i class="fa-solid fa-cube"></i> ${_e(def.label)}</div>
    <div class="prop-row"><label>Etiqueta del widget</label>
      <input value="${_e(w.label||'')}" oninput="updW('${w.id}','label',this.value)"></div>
    <div class="prop-sep"></div>
    ${schema.map(f => _propField(w.id, f, p[f.k])).join('')}
    <div class="prop-sep"></div>
    <div style="display:flex;gap:6px;margin-top:4px">
      <button class="tbtn ${w.locked?'accent':'ghost'}" style="flex:1" onclick="toggleBloqueo()">
        <i class="fa-solid fa-${w.locked?'lock-open':'lock'}"></i> ${w.locked?'Desbloquear':'Bloquear'}
      </button>
      <button class="tbtn red" onclick="eliminarSeleccionado()" title="Eliminar">
        <i class="fa-solid fa-trash"></i>
      </button>
    </div>`;
}

function _propField(wid, f, val) {
  const id  = `p_${wid}_${f.k}`;
  const v   = val ?? '';
  switch(f.t) {
    case 'text':    return `<div class="prop-row"><label>${_e(f.l)}</label>
      <input value="${_e(v)}" placeholder="${_e(f.ph||'')}" title="${_e(f.hint||'')}" oninput="updProp('${wid}','${f.k}',this.value)">
      ${f.hint?`<div style="font-size:10px;color:var(--muted);margin-top:3px;line-height:1.35">${_e(f.hint)}</div>`:''}</div>`;
    case 'textarea':return `<div class="prop-row"><label>${_e(f.l)}</label>
      <textarea rows="2" oninput="updProp('${wid}','${f.k}',this.value)">${_e(v)}</textarea></div>`;
    case 'number':  return `<div class="prop-row"><label>${_e(f.l)}</label>
      <input type="number" value="${v}" ${f.min!==undefined?`min="${f.min}"`:''}
             ${f.max!==undefined?`max="${f.max}"`:''}
             oninput="updPropN('${wid}','${f.k}',this.value)"></div>`;
    case 'color':   return `<div class="prop-row"><label>${_e(f.l)}</label>
      <div style="display:flex;gap:6px;align-items:center">
        <input type="color" value="${v||'#14b8a6'}" oninput="updProp('${wid}','${f.k}',this.value)"
               style="width:40px;height:32px;padding:2px;border-radius:5px;border:1px solid var(--border2);cursor:pointer">
        <input value="${v||''}" oninput="updProp('${wid}','${f.k}',this.value)"
               style="flex:1" placeholder="#14b8a6">
      </div></div>`;
    case 'select':  return `<div class="prop-row"><label>${_e(f.l)}</label>
      <select onchange="updProp('${wid}','${f.k}',this.value)">
        ${(f.opts||[]).map(o=>`<option value="${o.v}"${v===o.v?' selected':''}>${_e(o.l)}</option>`).join('')}
      </select></div>`;
    case 'bool':    return `<div class="prop-row">
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
        <input type="checkbox"${v?' checked':''} onchange="updProp('${wid}','${f.k}',this.checked)"
               style="width:16px;height:16px;accent-color:var(--accent);cursor:pointer">
        ${_e(f.l)}
      </label></div>`;
    case 'tag': {
      // Usar TagManager si está disponible (dropdown), si no, input manual
      let tagInput;
      if (window.TagManagerUI) {
        tagInput = TagManagerUI.tagSelect(wid, v, f.k);
      } else {
        tagInput = `<input value="${_e(v)}" placeholder="nombre_del_tag..." oninput="updProp('${wid}','${f.k}',this.value)" list="tag_dl" autocomplete="off">`;
      }
      const def = window.TagManager ? TagManager.getDef(v) : null;
      const info = def ? `<i class="fa-solid fa-circle-check" style="color:var(--green)"></i> ${_e(def.tipo)} — ${_e(def.descripcion||def.unidad||'')}` : (v ? `<i class="fa-solid fa-triangle-exclamation" style="color:var(--yellow)"></i> Tag sin definir` : '');
      return `<div class="prop-row"><label>🏷️ ${_e(f.l||'Tag')}</label>
        ${tagInput}
        ${info ? `<div style="font-size:9px;color:var(--muted);margin-top:3px">${info}</div>` : ''}
      </div>`;
    }
    default:        return '';
  }
}

// ════════════════════════════════════════════════════════════════
// API PÚBLICA
// ════════════════════════════════════════════════════════════════
global.WL = {
  DEFS,
  _cmd,

  render(w, tagValues, isPreview) {
    const def = DEFS[w.type];
    if (!def) {
      // Fallback para SVG (compatibilidad con widgets del sistema antiguo)
      return `<img src="${_e(w.svgPath||w.ruta||w.props?.svgPath||'')}"
        style="width:100%;height:100%;object-fit:contain;pointer-events:none"
        onerror="this.style.display='none'">`;
    }
    try {
      return def.render(w, tagValues, isPreview);
    } catch(e) {
      console.error('[WL] render error for', w.type, e);
      return `<div style="padding:8px;font-size:10px;color:#f85149">⚠ Error: ${_e(String(e))}</div>`;
    }
  },

  defaults(type) {
    return { ...(DEFS[type]?.defaults || {}), tag: '' };
  },

  defaultSize(type) {
    return DEFS[type]?.defaultSize || { w:80, h:80 };
  },

  propsHTML(w) {
    return buildPropsHTML(w);
  },

  // Upload de imagen: convierte file a base64 y actualiza el widget
  _uploadImg(widgetId, input) {
    const file = input.files && input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const b64 = e.target.result;
      if (window.__widgetPropUpdate) {
        window.__widgetPropUpdate(widgetId, 'url', b64);
      }
    };
    reader.readAsDataURL(file);
  },

  getCategories() {
    const cats = {};
    for (const [type, def] of Object.entries(DEFS)) {
      const cat = def.category || 'Otros';
      if (!cats[cat]) cats[cat] = [];
      cats[cat].push({ type, label:def.label, icon:def.icon, ...def.defaultSize });
    }
    return cats;
  },
};

})(window);