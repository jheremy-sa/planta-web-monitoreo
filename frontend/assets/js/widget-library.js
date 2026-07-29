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



// ════════════════════════════════════════════════════════════════
// TAGS DISPONIBLES DEL SISTEMA
// ════════════════════════════════════════════════════════════════
const TAG_MAP = {
  nivel_p1:'Nivel P1 (cm)', caudal_p1:'Caudal P1 (L/min)',
  temp_ambiente:'Temp. Ambiente (°C)', humedad:'Humedad (%)',
  temp_agua:'Temp. Agua (°C)', flotador_bajo:'Flotador Bajo P1',
  flotador_alto:'Flotador Alto P1', bomba_p1:'Bomba P1 (0/1)',
  valvula_p1:'Válvula P1 (0/1)', nivel_p2:'Nivel P2 (cm)',
  caudal_p2:'Caudal P2 (L/min)', bomba_p2:'Bomba P2 (0/1)',
  valvula_p2:'Válvula P2 (0/1)',
};

// ════════════════════════════════════════════════════════════════
// HELPERS — SVG MATH
// ════════════════════════════════════════════════════════════════
function _e(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function _clamp(v,mn,mx) { return Math.min(mx, Math.max(mn, v)); }
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

// ── Circular Gauge SVG ──────────────────────────────────────────
function _gaugeCircular(val, p) {
  val = typeof val === 'number' ? val : (p.min + p.max) / 2;
  const pct  = _pct(val, p.min, p.max);
  const cx=60, cy=58, R=42;
  const bgArc = _arc(cx,cy,R,135,1);
  const valArc= _arc(cx,cy,R,135,pct);
  const dispVal = val.toFixed ? val.toFixed(p.decimals||1) : '--';
  let nColor = p.color||'#14b8a6';
  if (p.alarmLo !== undefined && val <= p.alarmLo) nColor='#ef4444';
  if (p.alarmHi !== undefined && val >= p.alarmHi) nColor='#f59e0b';
  return `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%">
    <path d="${bgArc}" fill="none" stroke="#e2e8f0" stroke-width="8" stroke-linecap="round"/>
    ${valArc?`<path d="${valArc}" fill="none" stroke="${nColor}" stroke-width="8" stroke-linecap="round"/>` : ''}
    <circle cx="${cx}" cy="${cy}" r="4" fill="${nColor}"/>
    <text x="${cx}" y="${cy+6}" text-anchor="middle" font-family="monospace"
          font-size="17" font-weight="800" fill="currentColor">${_e(dispVal)}</text>
    <text x="${cx}" y="${cy+19}" text-anchor="middle" font-size="9" fill="#94a3b8">${_e(p.unit||'')}</text>
    <text x="5" y="105" font-size="7" fill="#94a3b8">${p.min??0}</text>
    <text x="95" y="105" text-anchor="end" font-size="7" fill="#94a3b8">${p.max??100}</text>
    ${p.title?`<text x="${cx}" y="115" text-anchor="middle" font-size="8" font-weight="600" fill="#64748b">${_e(p.title)}</text>`:''}
  </svg>`;
}

// ── Linear Gauge SVG ────────────────────────────────────────────
function _gaugeLinear(val, p) {
  val = typeof val === 'number' ? val : (p.min+p.max)/2;
  const pct = _pct(val, p.min, p.max) * 100;
  const color = p.color||'#14b8a6';
  const isV = p.orientation === 'vertical';
  if (isV) {
    return `<svg viewBox="0 0 40 120" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%">
      <rect x="14" y="10" width="12" height="95" rx="4" fill="#e2e8f0"/>
      <rect x="14" y="${10+95*(1-pct/100)}" width="12" height="${95*pct/100}" rx="4" fill="${color}"/>
      <text x="20" y="115" text-anchor="middle" font-size="8" fill="#64748b">${p.unit||''}</text>
      <text x="12" y="14" text-anchor="end" font-size="7" fill="#94a3b8">${p.max}</text>
      <text x="12" y="105" text-anchor="end" font-size="7" fill="#94a3b8">${p.min}</text>
      <text x="20" y="${10+95*(1-pct/100)+4}" text-anchor="middle" font-size="7" fill="white" font-weight="bold">${val.toFixed?val.toFixed(p.decimals||0):val}</text>
    </svg>`;
  }
  return `<svg viewBox="0 0 160 50" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%">
    ${p.title?`<text x="80" y="10" text-anchor="middle" font-size="9" fill="#64748b">${_e(p.title)}</text>`:''}
    <rect x="10" y="18" width="140" height="12" rx="4" fill="#e2e8f0"/>
    <rect x="10" y="18" width="${140*pct/100}" height="12" rx="4" fill="${color}"/>
    <text x="80" y="46" text-anchor="middle" font-size="9" fill="#64748b">
      ${val.toFixed?val.toFixed(p.decimals||1):val} ${_e(p.unit||'')}
    </text>
    <text x="10" y="16" font-size="7" fill="#94a3b8">${p.min}</text>
    <text x="150" y="16" text-anchor="end" font-size="7" fill="#94a3b8">${p.max}</text>
  </svg>`;
}

// ── Tank SVG ────────────────────────────────────────────────────
function _tankSvg(val, p) {
  val = typeof val === 'number' ? val : 50;
  const pct = _pct(val, p.min||0, p.max||100) * 100;
  let fill = p.color||'#3b82f6';
  if (p.alarmLo !== undefined && pct <= p.alarmLo) fill='#ef4444';
  if (p.alarmHi !== undefined && pct >= p.alarmHi) fill='#f59e0b';
  const h=75, y0=15, width=40, cx=60;
  const fillY = y0 + h - (pct/100)*h;
  return `<svg viewBox="0 0 120 115" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%">
    ${p.title?`<text x="${cx}" y="10" text-anchor="middle" font-size="9" font-weight="700" fill="#64748b">${_e(p.title)}</text>`:''}
    <rect x="${cx-width/2}" y="${y0}" width="${width}" height="${h}" rx="4" fill="#e5e7eb" stroke="#9ca3af" stroke-width="1.5"/>
    <clipPath id="tc${Math.random().toString(36).slice(2,6)}"><rect x="${cx-width/2}" y="${y0}" width="${width}" height="${h}" rx="4"/></clipPath>
    <rect x="${cx-width/2}" y="${fillY}" width="${width}" height="${(pct/100)*h}" fill="${fill}" opacity="0.85"/>
    <text x="${cx}" y="${y0+h/2+5}" text-anchor="middle" font-size="10" font-weight="800"
          fill="${pct>25?'#fff':'#374151'}">${pct.toFixed(0)}%</text>
    <text x="${cx}" y="106" text-anchor="middle" font-size="10" font-weight="800" fill="${fill}">
      ${val.toFixed?val.toFixed(p.decimals||1):val} ${_e(p.unit||'')}
    </text>
    ${[0,25,50,75,100].map(t=>`<line x1="${cx+width/2}" y1="${y0+h-t*h/100}" x2="${cx+width/2+5}" y2="${y0+h-t*h/100}" stroke="#9ca3af" stroke-width="1"/>`).join('')}
  </svg>`;
}

// ── Thermometer SVG ─────────────────────────────────────────────
function _thermoSvg(val, p) {
  val = typeof val === 'number' ? val : (p.min+p.max)/2;
  const pct = _pct(val, p.min||0, p.max||100);
  const color = p.color||'#ef4444';
  const h=70, ty=12, cx=30, tw=10;
  const fillH = pct * h;
  const fillY = ty + h - fillH;
  return `<svg viewBox="0 0 80 130" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%">
    <rect x="${cx-tw/2}" y="${ty}" width="${tw}" height="${h}" rx="${tw/2}" fill="#e5e7eb" stroke="#9ca3af" stroke-width="1.5"/>
    <rect x="${cx-tw/2}" y="${fillY}" width="${tw}" height="${fillH}" rx="${tw/2}" fill="${color}"/>
    <circle cx="${cx}" cy="${ty+h+14}" r="15" fill="${color}" stroke="#9ca3af" stroke-width="1.5"/>
    <circle cx="${cx}" cy="${ty+h+14}" r="10" fill="${color}"/>
    <text x="${cx}" y="${ty+h+19}" text-anchor="middle" font-size="8" font-weight="800" fill="#fff">
      ${val.toFixed?val.toFixed(1):val}
    </text>
    ${[0,25,50,75,100].map(t=>{
    const mn=parseFloat(p.min)||0; const mx=parseFloat(p.max)||100;
    return `<line x1="${cx+tw/2}" y1="${ty+h-t*h/100}" x2="${cx+tw/2+6}" y2="${ty+h-t*h/100}" stroke="#9ca3af" stroke-width="1"/>
      <text x="${cx+tw/2+8}" y="${ty+h-t*h/100+3}" font-size="7" fill="#94a3b8">${(mn+(mx-mn)*t/100).toFixed(0)}</text>`;
  }).join('')}
    <text x="${cx}" y="126" text-anchor="middle" font-size="8" fill="#64748b">${_e(p.unit||'°C')}</text>
  </svg>`;
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
function _progressBar(val, p) {
  val = typeof val==='number'?val:(p.min+p.max)/2;
  const pct = _pct(val,p.min||0,p.max||100)*100;
  const color=p.color||'#14b8a6';
  const isV = p.orientation==='vertical';
  return isV
    ? `<div style="width:100%;height:100%;display:flex;flex-direction:column;
                  align-items:center;justify-content:flex-end;position:relative;
                  background:#e2e8f0;border-radius:6px;overflow:hidden">
        <div style="width:100%;height:${pct}%;background:linear-gradient(to top,${color},${color}bb);
                    border-radius:inherit;transition:height .4s ease"></div>
        <div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);
                    font-size:11px;font-weight:800;color:#fff;text-shadow:0 1px 3px #0006">
          ${pct.toFixed(0)}%</div>
      </div>`
    : `<div style="width:100%;height:100%;position:relative;background:#e2e8f0;border-radius:6px;overflow:hidden">
        <div style="height:100%;width:${pct}%;background:linear-gradient(to right,${color},${color}bb);
                    border-radius:inherit;transition:width .4s ease"></div>
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

// ── Button ───────────────────────────────────────────────────────
function _button(val, p, isPreview) {
  const on = val > 0;
  const color = p.color||'#14b8a6';
  const mode = p.modo||'momentaneo';
  const active = mode==='toggle' && on;
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
  const color = p.color||'#14b8a6';
  const isV = p.orientation==='vertical';
  return isV
    ? `<div style="width:100%;height:100%;display:flex;flex-direction:column;
                  align-items:center;gap:6px">
        <div style="font-size:10px;font-weight:800;color:${color};font-family:monospace">
          ${val.toFixed?val.toFixed(p.decimals||0):val}</div>
        <div style="flex:1;width:8px;background:#e2e8f0;border-radius:4px;
                    position:relative;overflow:hidden">
          <div style="position:absolute;bottom:0;width:100%;height:${pct}%;
                      background:${color};border-radius:4px;transition:height .2s"></div>
          <div style="position:absolute;width:18px;height:18px;border-radius:50%;
                      background:#fff;border:3px solid ${color};
                      bottom:calc(${pct}% - 9px);left:-5px;box-shadow:0 2px 6px #0003"></div>
        </div>
        <div style="font-size:9px;color:var(--muted,#6b7280)">${_e(p.unit||'')}</div>
      </div>`
    : `<div style="width:100%;height:100%;display:flex;flex-direction:column;
                  align-items:center;justify-content:center;gap:6px;padding:0 8px;box-sizing:border-box">
        <div style="font-size:11px;font-weight:800;color:${color};font-family:monospace">
          ${val.toFixed?val.toFixed(p.decimals||0):val} ${_e(p.unit||'')}</div>
        <div style="width:100%;height:8px;background:#e2e8f0;border-radius:4px;
                    position:relative">
          <div style="width:${pct}%;height:100%;background:${color};border-radius:4px;transition:width .2s"></div>
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
  return `<div style="width:100%;height:100%;background:#000;border-radius:4px;
                      display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px">
    ${p.url
      ? `<img src="${_e(p.url)}/video-en-vivo" style="width:100%;height:100%;object-fit:cover;border-radius:4px"
             onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
      : ''}
    <div style="display:flex;flex-direction:column;align-items:center;gap:6px;color:#555">
      <i class="fa-solid fa-video" style="font-size:24px"></i>
      <span style="font-size:10px">${_e(p.label||'Cámara')}</span>
      ${p.url?`<span style="font-size:9px;color:#444">${_e(p.url)}</span>`:'<span style="font-size:9px">Configura la URL</span>'}
    </div>
  </div>`;
}

// ── Text Label ───────────────────────────────────────────────────
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
  return `<svg viewBox="0 0 100 100" preserveAspectRatio="none"
               xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;overflow:visible">
    <line x1="0" y1="50" x2="100" y2="50"
          stroke="${p.color||'#14b8a6'}" stroke-width="${p.strokeW||2}"
          stroke-dasharray="${p.dashed?'8,4':'none'}" stroke-linecap="round"
          transform="rotate(${deg},50,50) scale(1,${p.strokeW||2})"/>
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
    defaultSize:{w:200,h:4},defaults:{color:'#14b8a6',strokeW:2,dashed:false,angle:0},
    schema:[{k:'color',l:'Color',t:'color'},{k:'strokeW',l:'Grosor (px)',t:'number',min:1,max:20},{k:'dashed',l:'Línea discontinua',t:'bool'}],
    render:(w,tv)=>_lineWidget(w.props)
  },
  'rect':{
    category:'Básicos',label:'Rectángulo',icon:'⬜',
    defaultSize:{w:120,h:80},defaults:{fill:'transparent',stroke:'#14b8a6',strokeW:2,radius:4},
    schema:[{k:'fill',l:'Relleno',t:'color'},{k:'stroke',l:'Borde',t:'color'},{k:'strokeW',l:'Grosor borde',t:'number',min:0,max:20},{k:'radius',l:'Radio esquinas',t:'number',min:0,max:60}],
    render:(w,tv)=>`<div style="width:100%;height:100%;background:${w.props.fill||'transparent'};border:${w.props.strokeW||2}px solid ${w.props.stroke||'#14b8a6'};border-radius:${w.props.radius||4}px;box-sizing:border-box"></div>`
  },
  'ellipse':{
    category:'Básicos',label:'Elipse / Círculo',icon:'⭕',
    defaultSize:{w:80,h:80},defaults:{fill:'transparent',stroke:'#14b8a6',strokeW:2},
    schema:[{k:'fill',l:'Relleno',t:'color'},{k:'stroke',l:'Borde',t:'color'},{k:'strokeW',l:'Grosor borde',t:'number',min:0,max:20}],
    render:(w,tv)=>`<div style="width:100%;height:100%;background:${w.props.fill||'transparent'};border:${w.props.strokeW||2}px solid ${w.props.stroke||'#14b8a6'};border-radius:50%;box-sizing:border-box"></div>`
  },
  'svg':{
    category:'SVG',label:'Imagen SVG',icon:'🔧',
    defaultSize:{w:80,h:80},defaults:{svgPath:'',label:''},
    schema:[{k:'svgPath',l:'Ruta SVG',t:'text'},{k:'tag',l:'Tag (estado ON/OFF)',t:'tag'}],
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
    defaultSize:{w:130,h:44},defaults:{text:'Botón',tag:'',modo:'momentaneo',valorOn:1,valorOff:0,color:'#14b8a6',icon:'',fontSize:13},
    schema:[{k:'text',l:'Texto',t:'text'},{k:'tag',l:'Tag',t:'tag'},{k:'modo',l:'Modo',t:'select',opts:[{v:'momentaneo',l:'Momentáneo'},{v:'toggle',l:'Toggle'}]},{k:'valorOn',l:'Valor ON',t:'number'},{k:'valorOff',l:'Valor OFF',t:'number'},{k:'color',l:'Color',t:'color'},{k:'icon',l:'Ícono FA (ej: play)',t:'text'}],
    render:(w,tv,isP)=>{
      const p = w.props||{};
      const on = _tv(tv,p.tag,0)>0;
      const color = p.color||'#14b8a6';
      const text  = p.text||'Botón';
      const active = (p.modo==='toggle') && on;
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
      const color = p.color||'#14b8a6';
      const isV   = p.orientation==='vertical';
      if (isP && p.tag) {
        // Modo interactivo: input range real
        if (isV) {
          return `<div style="width:100%;height:100%;display:flex;flex-direction:column;
                              align-items:center;gap:4px;padding:4px;box-sizing:border-box">
            <span style="font-size:11px;font-weight:800;color:${color};font-family:monospace">
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
            <span style="font-size:12px;font-weight:800;color:${color};font-family:monospace"
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
  'progress-bar':{
    category:'Indicadores',label:'Barra de Progreso',icon:'📶',
    defaultSize:{w:200,h:28},defaults:{tag:'',min:0,max:100,unit:'',color:'#14b8a6',orientation:'horizontal',decimals:0},
    schema:[{k:'tag',l:'Tag',t:'tag'},{k:'min',l:'Mínimo',t:'number'},{k:'max',l:'Máximo',t:'number'},{k:'unit',l:'Unidad',t:'text'},{k:'color',l:'Color',t:'color'},{k:'orientation',l:'Orientación',t:'select',opts:[{v:'horizontal',l:'Horizontal'},{v:'vertical',l:'Vertical'}]}],
    render:(w,tv)=>_progressBar(
      tv ? _tv(tv,w.props.tag,(parseFloat(w.props.min||0)+parseFloat(w.props.max||100))/2)
         : _demoVal(w.props, 55),
      w.props)
  },
  'gauge-circular':{
    category:'Indicadores',label:'Gauge Circular',icon:'⏱️',
    defaultSize:{w:150,h:150},defaults:{tag:'',min:0,max:100,unit:'',title:'Gauge',color:'#14b8a6',decimals:1,alarmLo:null,alarmHi:null},
    schema:[{k:'tag',l:'Tag',t:'tag'},{k:'title',l:'Título',t:'text'},{k:'min',l:'Mínimo',t:'number'},{k:'max',l:'Máximo',t:'number'},{k:'unit',l:'Unidad',t:'text'},{k:'color',l:'Color',t:'color'},{k:'decimals',l:'Decimales',t:'number',min:0,max:4},{k:'alarmLo',l:'Alarma baja',t:'number'},{k:'alarmHi',l:'Alarma alta',t:'number'}],
    render:(w,tv)=>_gaugeCircular(
      tv ? _tv(tv,w.props.tag,(parseFloat(w.props.min||0)+parseFloat(w.props.max||100))/2)
         : _demoVal(w.props, 60),  // Valor demo en editor
      w.props)
  },
  'gauge-linear':{
    category:'Indicadores',label:'Gauge Lineal',icon:'📏',
    defaultSize:{w:180,h:50},defaults:{tag:'',min:0,max:100,unit:'',title:'',color:'#14b8a6',decimals:1,orientation:'horizontal'},
    schema:[{k:'tag',l:'Tag',t:'tag'},{k:'title',l:'Título',t:'text'},{k:'min',l:'Mínimo',t:'number'},{k:'max',l:'Máximo',t:'number'},{k:'unit',l:'Unidad',t:'text'},{k:'color',l:'Color',t:'color'},{k:'orientation',l:'Orientación',t:'select',opts:[{v:'horizontal',l:'Horizontal'},{v:'vertical',l:'Vertical'}]}],
    render:(w,tv)=>_gaugeLinear(
      tv ? _tv(tv,w.props.tag,(parseFloat(w.props.min||0)+parseFloat(w.props.max||100))/2)
         : _demoVal(w.props, 65),
      w.props)
  },
  'tank':{
    category:'Indicadores',label:'Tanque con Nivel',icon:'🪣',
    defaultSize:{w:90,h:130},defaults:{tag:'',min:0,max:100,unit:'cm',title:'Tanque',color:'#3b82f6',decimals:1,alarmLo:15,alarmHi:85},
    schema:[{k:'tag',l:'Tag (nivel)',t:'tag'},{k:'title',l:'Título',t:'text'},{k:'min',l:'Valor mínimo',t:'number'},{k:'max',l:'Valor máximo',t:'number'},{k:'unit',l:'Unidad',t:'text'},{k:'color',l:'Color del fluido',t:'color'},{k:'alarmLo',l:'Alarma bajo (%)',t:'number'},{k:'alarmHi',l:'Alarma alto (%)',t:'number'}],
    render:(w,tv)=>_tankSvg(
      tv ? _tv(tv,w.props.tag,50)
         : _demoVal(w.props, 60),
      w.props)
  },
  'thermometer':{
    category:'Indicadores',label:'Termómetro',icon:'🌡️',
    defaultSize:{w:80,h:130},defaults:{tag:'',min:0,max:100,unit:'°C',color:'#ef4444'},
    schema:[{k:'tag',l:'Tag',t:'tag'},{k:'min',l:'Temperatura mínima',t:'number'},{k:'max',l:'Temperatura máxima',t:'number'},{k:'unit',l:'Unidad',t:'text'},{k:'color',l:'Color del mercurio',t:'color'}],
    render:(w,tv)=>_thermoSvg(
      tv ? _tv(tv,w.props.tag,(parseFloat(w.props.min||0)+parseFloat(w.props.max||100))/2)
         : _demoVal(w.props, 65),
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

  // ── OBJETOS INDUSTRIALES ──────────────────────────────────────
  'ind-motor':{
    category:'Controles',label:'Motor',icon:'⚙️',
    defaultSize:{w:90,h:90},defaults:{tag:'',label:'Motor',colorOn:'#22c55e',colorOff:'#6b7280',textOn:'MARCHA',textOff:'PARADO',animacion:'spin',animSpeed:2},
    schema:[{k:'tag',l:'Tag (ON=1)',t:'tag'},{k:'label',l:'Etiqueta',t:'text'},{k:'colorOn',l:'Color activo',t:'color'},{k:'colorOff',l:'Color parado',t:'color'},{k:'textOn',l:'Texto activo',t:'text'},{k:'textOff',l:'Texto parado',t:'text'},{k:'animacion',l:'Animación',t:'select',opts:[{v:'spin',l:'Girar'},{v:'pulse-ind',l:'Pulsar'},{v:'ninguna',l:'Ninguna'}]},{k:'animSpeed',l:'Velocidad (s)',t:'number',min:0.1,max:10}],
    render:(w,tv)=>_industrial(_tv(tv,w.props.tag,0),w.props,'ind-motor')
  },
  'ind-pump':{
    category:'Controles',label:'Bomba',icon:'💧',
    defaultSize:{w:90,h:90},defaults:{tag:'',label:'Bomba',colorOn:'#3b82f6',colorOff:'#6b7280',textOn:'ACTIVA',textOff:'PARADA',animacion:'pulse-ind',animSpeed:1},
    schema:[{k:'tag',l:'Tag (ON=1)',t:'tag'},{k:'label',l:'Etiqueta',t:'text'},{k:'colorOn',l:'Color activa',t:'color'},{k:'colorOff',l:'Color parada',t:'color'},{k:'textOn',l:'Texto activa',t:'text'},{k:'textOff',l:'Texto parada',t:'text'}],
    render:(w,tv)=>_industrial(_tv(tv,w.props.tag,0),w.props,'ind-pump')
  },
  'ind-valve':{
    category:'Controles',label:'Válvula',icon:'🔩',
    defaultSize:{w:90,h:90},defaults:{tag:'',label:'Válvula',colorOn:'#22c55e',colorOff:'#ef4444',textOn:'ABIERTA',textOff:'CERRADA',animacion:'ninguna'},
    schema:[{k:'tag',l:'Tag (abierta=1)',t:'tag'},{k:'label',l:'Etiqueta',t:'text'},{k:'colorOn',l:'Color abierta',t:'color'},{k:'colorOff',l:'Color cerrada',t:'color'},{k:'textOn',l:'Texto abierta',t:'text'},{k:'textOff',l:'Texto cerrada',t:'text'}],
    render:(w,tv)=>_industrial(_tv(tv,w.props.tag,0),w.props,'ind-valve')
  },
  'ind-fan':{
    category:'Controles',label:'Ventilador',icon:'🌀',
    defaultSize:{w:90,h:90},defaults:{tag:'',label:'Ventilador',colorOn:'#06b6d4',colorOff:'#6b7280',textOn:'ACTIVO',textOff:'PARADO',animacion:'spin',animSpeed:1},
    schema:[{k:'tag',l:'Tag (ON=1)',t:'tag'},{k:'label',l:'Etiqueta',t:'text'},{k:'colorOn',l:'Color activo',t:'color'},{k:'colorOff',l:'Color parado',t:'color'},{k:'animSpeed',l:'Velocidad giro (s)',t:'number',min:0.2,max:10}],
    render:(w,tv)=>_industrial(_tv(tv,w.props.tag,0),w.props,'ind-fan')
  },
  'ind-sensor':{
    category:'Controles',label:'Sensor',icon:'📡',
    defaultSize:{w:70,h:90},defaults:{tag:'',label:'Sensor',colorOn:'#14b8a6',colorOff:'#6b7280',textOn:'OK',textOff:'---',animacion:'ninguna'},
    schema:[{k:'tag',l:'Tag',t:'tag'},{k:'label',l:'Etiqueta',t:'text'},{k:'colorOn',l:'Color activo',t:'color'}],
    render:(w,tv)=>_industrial(_tv(tv,w.props.tag,0),w.props,'ind-sensor')
  },
  'ind-flowmeter':{
    category:'Controles',label:'Caudalímetro',icon:'💦',
    defaultSize:{w:90,h:90},defaults:{tag:'',label:'Caudal',colorOn:'#3b82f6',colorOff:'#6b7280',textOn:'FLUJO',textOff:'SIN FLUJO',animacion:'ninguna'},
    schema:[{k:'tag',l:'Tag',t:'tag'},{k:'label',l:'Etiqueta',t:'text'},{k:'colorOn',l:'Color con flujo',t:'color'}],
    render:(w,tv)=>_industrial(_tv(tv,w.props.tag,0),w.props,'ind-flowmeter')
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
    schema:[{k:'url',l:'URL del stream MJPEG',t:'text'},{k:'label',l:'Etiqueta',t:'text'}],
    render:(w,tv)=>_camera(w.props)
  },
};

// ════════════════════════════════════════════════════════════════
// PROPIEDADES PANEL — generador unificado
// ════════════════════════════════════════════════════════════════
function _propField(wid, f, val) {
  const id  = `p_${wid}_${f.k}`;
  const v   = val ?? '';
  switch(f.t) {
    case 'text':    return `<div class="prop-row"><label>${_e(f.l)}</label>
      <input value="${_e(v)}" oninput="updProp('${wid}','${f.k}',this.value)"></div>`;
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

function buildPropsHTML(w) {
  const def = DEFS[w.type];
  if (!def) return '<div class="prop-no-sel">Tipo de widget desconocido: '+_e(w.type)+'</div>';
  const p   = { ...def.defaults, ...(w.props||{}) };
  const schema = def.schema || [];
  return `
    <div class="prop-section"><i class="fa-solid fa-cube"></i> ${_e(def.label)}</div>
    <div class="prop-row"><label>Etiqueta del widget</label>
      <input value="${_e(w.label||'')}" oninput="updW('${w.id}','label',this.value)"></div>
    <div class="prop-sep"></div>
    ${schema.map(f => _propField(w.id, f, p[f.k])).join('')}
    <div class="prop-sep"></div>
    <div class="prop-section"><i class="fa-solid fa-arrows-up-down-left-right"></i> Posición y Tamaño</div>
    <div class="prop-row two"><label>Posición (X, Y)</label>
      <input type="number" value="${w.x}" oninput="updWNum('${w.id}','x',this.value)">
      <input type="number" value="${w.y}" oninput="updWNum('${w.id}','y',this.value)">
    </div>
    <div class="prop-row two"><label>Tamaño (W, H)</label>
      <input type="number" value="${w.w}" min="8" oninput="updWNum('${w.id}','w',this.value)">
      <input type="number" value="${w.h}" min="8" oninput="updWNum('${w.id}','h',this.value)">
    </div>
    <div class="prop-row"><label>Rotación (°)</label>
      <input type="range" min="0" max="360" step="5" value="${w.rotation||0}"
             oninput="updWNum('${w.id}','rotation',this.value);this.nextElementSibling.textContent=this.value+'°'">
      <span style="font-size:11px;color:var(--muted)">${w.rotation||0}°</span>
    </div>
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

// ════════════════════════════════════════════════════════════════
// API PÚBLICA
// ════════════════════════════════════════════════════════════════
global.WL = {
  TAG_MAP,
  DEFS,

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
