/**
 * dragdrop.js — Drag & drop genérico desde paleta al canvas + arrastre interno.
 *
 * Soporta dos flujos:
 *
 *   1) Paleta → Canvas:
 *      cada item de la paleta tiene data-type="<tipo>"; al hacer drag se
 *      almacena el tipo en dataTransfer, y al hacer drop sobre el canvas se
 *      invoca HMIRenderer.newComponent(type, {x,y}) y se agrega al estado.
 *
 *   2) Movimiento interno:
 *      al hacer mousedown sobre un componente del canvas se entra en modo
 *      mover hasta el mouseup. Soporta snap a rejilla (config.snap).
 *
 * Toda la lógica es 100% genérica: no contiene if/switch por tipo.
 */
(function () {
  'use strict';

  const SNAP = 5;   // tamaño de la cuadrícula (px)

  /** Devuelve todos los componentes que comparten un mismo groupId. */
  function expandirGrupo(gid) {
    if (!gid) return [];
    return window.HMIState.listComponents().filter(c => c.groupId === gid);
  }

  /** Activa drag desde un elemento de la paleta. */
  function bindPaletteItem(el) {
    el.setAttribute('draggable', 'true');
    el.addEventListener('dragstart', e => {
      const type = el.dataset.type;
      if (!type) return;
      e.dataTransfer.setData('text/x-hmi-type', type);
      e.dataTransfer.effectAllowed = 'copy';
      el.classList.add('dragging');
    });
    el.addEventListener('dragend', () => el.classList.remove('dragging'));
  }

  /** Configura el canvas como zona de drop. */
  function bindCanvas(canvas) {
    canvas.addEventListener('dragover', e => {
      if (e.dataTransfer.types.includes('text/x-hmi-type')) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }
    });
    canvas.addEventListener('drop', e => {
      const type = e.dataTransfer.getData('text/x-hmi-type');
      if (!type) return;
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const x = snap(e.clientX - rect.left);
      const y = snap(e.clientY - rect.top);
      window.HMIState.pushUndo();
      const c = window.HMIRenderer.newComponent(type, { x, y });
      if (c) {
        window.HMIState.addComponent(c);
        window.HMIState.setSelection(c.id);
      }
    });

    // Movimiento interno: mousedown sobre un componente → arrastrar
    canvas.addEventListener('mousedown', e => {
      const el = e.target.closest('.hc');
      if (!el) {
        // Click en zona vacía → iniciar marquee (rectángulo de selección)
        // salvo si presionó Shift (para no deseleccionar en multi-select)
        if (!e.shiftKey) window.HMIState.setSelection(null);
        iniciarMarquee(canvas, e);
        return;
      }
      const id = el.dataset.id;

      // Selección: Shift+click → toggle en el Set; click normal → set.
      // Alt+click permite seleccionar UN miembro de un grupo (ignora el grupo).
      const c = window.HMIState.getComponent(id);
      const esGrupo = c && c.groupId && !e.altKey;

      if (e.shiftKey) {
        if (esGrupo) {
          // Shift+click en grupo → agregar todos los miembros
          expandirGrupo(c.groupId).forEach(m => window.HMIState.addToSelection(m.id));
        } else {
          window.HMIState.addToSelection(id);
        }
      } else {
        // Click normal
        const ids = window.HMIState.getSelectionIds();
        if (esGrupo) {
          // Si el grupo YA está totalmente seleccionado, no reseteo (permite drag)
          const miembros = expandirGrupo(c.groupId).map(m => m.id);
          const todosDentro = miembros.every(mid => ids.includes(mid));
          if (!todosDentro || ids.length !== miembros.length) {
            window.HMIState.setSelection(miembros);
          }
        } else if (!ids.includes(id)) {
          window.HMIState.setSelection(id);
        } else if (ids.length === 1) {
          window.HMIState.setSelection(id);
        }
      }
      if (!c || c.locked) return;

      // Si el click es sobre un handle de resize/rotate, lo maneja
      // otro módulo; aquí solo el cuerpo
      if (e.target.closest('.rz, .rot, .properties-control, .hmi-handle')) return;

      // Snapshot inicial de posiciones para arrastre múltiple
      const selectedIds = window.HMIState.getSelectionIds();
      const dragTargets = selectedIds
        .map(sid => window.HMIState.getComponent(sid))
        .filter(cc => cc && !cc.locked)
        .map(cc => ({ c: cc, origX: cc.x, origY: cc.y }));

      const startX = e.clientX, startY = e.clientY;
      let moved    = false;

      const onMove = ev => {
        const dx = ev.clientX - startX, dy = ev.clientY - startY;
        if (!moved && (Math.abs(dx) > 2 || Math.abs(dy) > 2)) {
          window.HMIState.pushUndo();
          moved = true;
        }
        dragTargets.forEach(t => {
          t.c.x = snap(t.origX + dx);
          t.c.y = snap(t.origY + dy);
          window.HMIRenderer.updateComponent(t.c);
        });
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup',   onUp);
        if (moved) {
          dragTargets.forEach(t => window.HMIState.emit('componentChanged', t.c, 'position'));
        }
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup',   onUp);
    });
  }

  /**
   * Marquee: al hacer mousedown en zona vacía del canvas, dibuja un
   * rectángulo semitransparente hasta el mouseup. Al soltar, selecciona
   * todos los componentes cuyo bounding box intersecte con el rectángulo.
   */
  function iniciarMarquee(canvas, evStart) {
    const rectCanvas = canvas.getBoundingClientRect();
    const startX = evStart.clientX - rectCanvas.left;
    const startY = evStart.clientY - rectCanvas.top;

    const box = document.createElement('div');
    box.className = 'hmi-marquee';
    box.style.cssText = `
      position:absolute; border:1px dashed #3b82f6; background:rgba(59,130,246,0.10);
      pointer-events:none; z-index:9998; left:${startX}px; top:${startY}px;
      width:0; height:0`;
    canvas.appendChild(box);

    let didMove = false;
    const onMove = ev => {
      const x = ev.clientX - rectCanvas.left;
      const y = ev.clientY - rectCanvas.top;
      const bx = Math.min(startX, x), by = Math.min(startY, y);
      const bw = Math.abs(x - startX), bh = Math.abs(y - startY);
      box.style.left  = bx + 'px'; box.style.top   = by + 'px';
      box.style.width = bw + 'px'; box.style.height= bh + 'px';
      if (bw > 3 || bh > 3) didMove = true;
    };
    const onUp = ev => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);
      const bx = parseFloat(box.style.left), by = parseFloat(box.style.top);
      const bw = parseFloat(box.style.width), bh = parseFloat(box.style.height);
      box.remove();
      if (!didMove) return;

      // Buscar componentes en la página actual que intersecten el rect
      const currentPage = window.HMIState._raw.currentPage;
      const dentro = window.HMIState.listComponents(currentPage).filter(c => {
        const cx = +c.x || 0, cy = +c.y || 0;
        const cw = +c.w || 0, ch = +c.h || 0;
        return cx < bx + bw && cx + cw > bx && cy < by + bh && cy + ch > by;
      });
      if (dentro.length) {
        // Si Shift, agregar a la selección actual; si no, reemplazarla
        if (evStart.shiftKey) {
          dentro.forEach(c => window.HMIState.addToSelection(c.id));
        } else {
          window.HMIState.setSelection(dentro.map(c => c.id));
        }
      }
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
  }

  /** Aplica snap a la cuadrícula. */
  function snap(v) {
    return Math.round(v / SNAP) * SNAP;
  }

  /** Inicializa todos los items de paleta presentes en el documento. */
  function autoBindPalette(root = document) {
    root.querySelectorAll('[data-palette-item][data-type]').forEach(bindPaletteItem);
  }

  window.HMIDragDrop = {
    bindPaletteItem, bindCanvas, autoBindPalette, snap,
  };
})();
