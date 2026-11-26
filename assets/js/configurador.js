/* NexoHome · configurador / room builder (vanilla sobre three r147 vendorizado).
   Editor 2D + preview 3D en vivo + sugerencias por ambiente + draft anónimo.
   Sin dependencias extra ni red. Expone window.nexoConfigurador (F3 lo usará). */
(function () {
  'use strict';

  var container = document.getElementById('config-canvas');
  var plan = document.getElementById('plan');
  if (!container || !plan || !window.THREE) return;

  var REDUCED = window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;

  var STORAGE_KEY = 'nexo-casa-draft';
  var AREA = { w: 12, d: 10, step: 0.5, min: 1.5, wallH: 1.1 };

  var MAX_PLANO_CHARS = 2500000;
  var MAX_PLANO_WIDTH = 1400;
  var PDF_SCRIPT = '../../assets/vendor/pdf.min.js';
  var PDF_WORKER = '../../assets/vendor/pdf.worker.min.js';
  var pdfLibPromise = null;
  var DXF_FALLBACK_TEXT =
    'No pudimos leer los ambientes automáticamente. Probá subir una imagen del plano y dibujarlos encima.';

  var CATS = {
    iluminacion: { label: 'Iluminación', hex: '#2dd4bf', color: 0x2dd4bf },
    clima: { label: 'Clima', hex: '#60a5fa', color: 0x60a5fa },
    seguridad: { label: 'Seguridad', hex: '#f87171', color: 0xf87171 },
    energia: { label: 'Energía', hex: '#4ade80', color: 0x4ade80 }
  };
  var CAT_ORDER = ['iluminacion', 'clima', 'seguridad', 'energia'];

  var TIPOS = {
    dormitorio: { label: 'Dormitorio', w: 3.5, h: 3.5, color: 0x60a5fa },
    living: { label: 'Living-Comedor', w: 5, h: 4, color: 0x2dd4bf },
    cocina: { label: 'Cocina', w: 3, h: 2.5, color: 0x4ade80 },
    bano: { label: 'Baño', w: 2, h: 2, color: 0x38bdf8 },
    oficina: { label: 'Oficina', w: 2.5, h: 2.5, color: 0xa78bfa },
    garage: { label: 'Garage', w: 3.5, h: 5, color: 0x94a3b8 },
    exterior: { label: 'Exterior', w: 4, h: 3, color: 0xfbbf24 }
  };

  var SUGERENCIAS = {
    dormitorio: [
      { key: 'dorm-luz', cat: 'iluminacion', nombre: 'Luces regulables', desc: 'Escenas suaves para dormir y despertar.' },
      { key: 'dorm-presencia', cat: 'seguridad', nombre: 'Sensor de presencia', desc: 'Apaga luces y avisa movimiento.' },
      { key: 'dorm-termostato', cat: 'clima', nombre: 'Termostato', desc: 'Temperatura por horario y modo noche.' },
      { key: 'dorm-cortinas', cat: 'energia', nombre: 'Cortinas motorizadas', desc: 'Control solar para ahorrar energía.' }
    ],
    living: [
      { key: 'liv-luz', cat: 'iluminacion', nombre: 'Luces regulables', desc: 'Escenas de living, cine y visita.' },
      { key: 'liv-movimiento', cat: 'seguridad', nombre: 'Sensor de movimiento', desc: 'Alerta y rutina de ausencia.' },
      { key: 'liv-termostato', cat: 'clima', nombre: 'Termostato', desc: 'Clima por ambiente y horarios.' },
      { key: 'liv-enchufe', cat: 'energia', nombre: 'Enchufe medidor', desc: 'Mide consumo de TV y equipos.' }
    ],
    cocina: [
      { key: 'coc-luz', cat: 'iluminacion', nombre: 'Luces de trabajo', desc: 'Luz puntual sobre mesada y isla.' },
      { key: 'coc-humo', cat: 'seguridad', nombre: 'Sensor de humo', desc: 'Aviso inmediato al celular.' },
      { key: 'coc-gas', cat: 'seguridad', nombre: 'Sensor de gas', desc: 'Corta la válvula si detecta fuga.' },
      { key: 'coc-extractor', cat: 'clima', nombre: 'Extractor automático', desc: 'Arranca con humedad y olores.' }
    ],
    bano: [
      { key: 'ban-luz', cat: 'iluminacion', nombre: 'Luces automáticas', desc: 'Encendido por presencia, luz cálida.' },
      { key: 'ban-extractor', cat: 'clima', nombre: 'Extractor', desc: 'Ventila por humedad, no por horario.' },
      { key: 'ban-movimiento', cat: 'seguridad', nombre: 'Sensor de movimiento', desc: 'Rutina nocturna con luz baja.' }
    ],
    oficina: [
      { key: 'ofi-luz', cat: 'iluminacion', nombre: 'Luces regulables', desc: 'Temperatura de color según tarea.' },
      { key: 'ofi-termostato', cat: 'clima', nombre: 'Termostato', desc: 'Confort estable en jornada laboral.' },
      { key: 'ofi-enchufe', cat: 'energia', nombre: 'Enchufe medidor', desc: 'Consumo de escritorio y monitores.' },
      { key: 'ofi-presencia', cat: 'seguridad', nombre: 'Sensor de presencia', desc: 'Apaga equipos al salir.' }
    ],
    garage: [
      { key: 'gar-luz', cat: 'iluminacion', nombre: 'Luces con sensor', desc: 'Encendido al entrar el auto.' },
      { key: 'gar-camara', cat: 'seguridad', nombre: 'Cámara', desc: 'Vista y grabación del acceso.' },
      { key: 'gar-apertura', cat: 'seguridad', nombre: 'Sensor de apertura', desc: 'Aviso si la puerta queda abierta.' },
      { key: 'gar-ev', cat: 'energia', nombre: 'Cargador EV', desc: 'Carga programada en horario barato.' }
    ],
    exterior: [
      { key: 'ext-luz', cat: 'iluminacion', nombre: 'Luces con sensor', desc: 'Paisajismo que enciende al atardecer.' },
      { key: 'ext-camara', cat: 'seguridad', nombre: 'Cámara exterior', desc: 'Perímetro con visión nocturna.' },
      { key: 'ext-enchufe', cat: 'energia', nombre: 'Enchufe de paisajismo', desc: 'Riego y luces con horario.' },
      { key: 'ext-riego', cat: 'energia', nombre: 'Riego automático', desc: 'Riega según humedad del suelo.' }
    ]
  };

  function rooms(list) {
    return list.map(function (r) {
      return { tipo: r.t, nombre: r.n, x: r.x, y: r.y, w: r.w, h: r.h };
    });
  }

  var TEMPLATES = {
    depto: rooms([
      { t: 'living', n: 'Living-Comedor', x: 0.5, y: 0.5, w: 5, h: 4 },
      { t: 'dormitorio', n: 'Dormitorio', x: 6, y: 0.5, w: 4, h: 3.5 },
      { t: 'cocina', n: 'Cocina', x: 0.5, y: 5, w: 3.5, h: 3 },
      { t: 'bano', n: 'Baño', x: 4.5, y: 5, w: 2.5, h: 2.5 }
    ]),
    casa: rooms([
      { t: 'living', n: 'Living-Comedor', x: 0.5, y: 0.5, w: 6, h: 5 },
      { t: 'cocina', n: 'Cocina', x: 7, y: 0.5, w: 4.5, h: 3 },
      { t: 'bano', n: 'Baño', x: 7, y: 4, w: 2.5, h: 2 },
      { t: 'oficina', n: 'Oficina', x: 9.5, y: 4, w: 2, h: 2 },
      { t: 'dormitorio', n: 'Dormitorio 1', x: 0.5, y: 6, w: 3.5, h: 3.5 },
      { t: 'dormitorio', n: 'Dormitorio 2', x: 4.5, y: 6, w: 3.5, h: 3.5 },
      { t: 'dormitorio', n: 'Dormitorio 3', x: 8.5, y: 6, w: 3, h: 3.5 }
    ]),
    cero: []
  };

  var state = {
    ambientes: [],
    aceptadas: {},
    selectedId: null,
    template: null,
    plano: null
  };
  var restoredOmitted = false;

  var planEl = plan;
  var propsEl = document.getElementById('props');
  var suggestionsEl = document.getElementById('suggestions');
  var totalsEl = document.getElementById('totals');
  var hintEl = document.getElementById('draft-hint');
  var planStatusEl = document.getElementById('plan-status');
  var planActionsEl = document.getElementById('plan-actions');
  var planNameEl = document.getElementById('plan-name');
  var planFileEl = document.getElementById('plan-file');
  var planRemoveEl = document.getElementById('plan-remove');
  var dxfFileEl = document.getElementById('dxf-file');
  var dxfFallbackEl = document.getElementById('dxf-fallback');
  var templateButtons = [].slice.call(document.querySelectorAll('.template-btn'));
  var paletteButtons = [].slice.call(document.querySelectorAll('.palette__btn'));

  var uidCounter = 1;

  // --- Utilidades ------------------------------------------------------------

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function snap(value) {
    return Math.round(value / AREA.step) * AREA.step;
  }

  function round(value) {
    return Math.round(value * 10) / 10;
  }

  function pct(value, total) {
    return (value / total) * 100;
  }

  function getRoom(id) {
    for (var i = 0; i < state.ambientes.length; i += 1) {
      if (state.ambientes[i].id === id) return state.ambientes[i];
    }
    return null;
  }

  function tipoOf(room) {
    return TIPOS[room.tipo] || TIPOS.dormitorio;
  }

  function deviceIndex(tipo) {
    return SUGERENCIAS[tipo] || [];
  }

  function findDevice(tipo, key) {
    var list = deviceIndex(tipo);
    for (var i = 0; i < list.length; i += 1) {
      if (list[i].key === key) return list[i];
    }
    return null;
  }

  function defaultsFor(tipo) {
    return deviceIndex(tipo).map(function (d) { return d.key; });
  }

  function ensureAceptadas(room) {
    var current = state.aceptadas[room.id];
    if (!current) {
      state.aceptadas[room.id] = defaultsFor(room.tipo);
    }
  }

  function totals() {
    var out = { total: 0, iluminacion: 0, clima: 0, seguridad: 0, energia: 0 };
    state.ambientes.forEach(function (room) {
      var keys = state.aceptadas[room.id] || [];
      keys.forEach(function (key) {
        var device = findDevice(room.tipo, key);
        if (!device) return;
        out.total += 1;
        out[device.cat] += 1;
      });
    });
    return out;
  }

  function newId() {
    var n = uidCounter;
    while (getRoom('r' + n)) n += 1;
    uidCounter = n + 1;
    return 'r' + n;
  }

  function normalizeRoom(raw) {
    var tipo = TIPOS[raw.tipo] ? raw.tipo : 'dormitorio';
    var def = TIPOS[tipo];
    var w = clamp(Number(raw.w) || def.w, AREA.min, AREA.w);
    var h = clamp(Number(raw.h) || def.h, AREA.min, AREA.d);
    return {
      id: raw.id && /^r\d+$/.test(raw.id) ? raw.id : newId(),
      tipo: tipo,
      nombre: String(raw.nombre || def.label).slice(0, 40),
      x: clamp(snap(Number(raw.x) || 0), 0, AREA.w - w),
      y: clamp(snap(Number(raw.y) || 0), 0, AREA.d - h),
      w: w,
      h: h
    };
  }

  // --- Persistencia ----------------------------------------------------------

  function serialize() {
    var aceptadas = {};
    state.ambientes.forEach(function (room) {
      aceptadas[room.id] = (state.aceptadas[room.id] || []).slice();
    });

    var plano = null;
    var omitido = false;
    if (state.plano) {
      if (state.plano.dataUrl.length <= MAX_PLANO_CHARS) {
        plano = state.plano;
      } else {
        omitido = true;
      }
    }

    return {
      v: 2,
      template: state.template,
      ambientes: state.ambientes,
      aceptadas: aceptadas,
      plano: plano,
      planoOmitted: omitido,
      savedAt: Date.now()
    };
  }

  function saveDraft() {
    try {
      var data = serialize();
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      if (data.planoOmitted && hintEl) {
        hintEl.hidden = false;
        hintEl.textContent = 'El plano no se guardó por tamaño; los ambientes sí.';
      }
    } catch (err) {
      /* storage lleno o bloqueado: el configurador sigue funcionando */
    }
  }

  var saveTimer = null;
  function scheduleSave() {
    if (saveTimer) window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(function () {
      saveTimer = null;
      saveDraft();
    }, 200);
  }

  function restoreDraft() {
    var raw;
    try {
      raw = window.localStorage.getItem(STORAGE_KEY);
    } catch (err) {
      return false;
    }
    if (!raw) return false;
    try {
      var data = JSON.parse(raw);
      if (!data || !Array.isArray(data.ambientes)) return false;
      var restored = [];
      data.ambientes.slice(0, 40).forEach(function (r) {
        if (!r || typeof r !== 'object') return;
        var room = normalizeRoom(r);
        if (room) restored.push(room);
      });
      state.ambientes = restored;
      state.aceptadas = {};
      restored.forEach(function (room) {
        var keys = data.aceptadas && data.aceptadas[room.id];
        var valid = deviceIndex(room.tipo).map(function (d) { return d.key; });
        state.aceptadas[room.id] = Array.isArray(keys)
          ? keys.filter(function (k) { return valid.indexOf(k) !== -1; })
          : defaultsFor(room.tipo);
      });
      state.template = data.template || null;
      state.selectedId = restored.length ? restored[0].id : null;

      state.plano = null;
      if (
        data.plano && typeof data.plano === 'object' &&
        typeof data.plano.dataUrl === 'string' &&
        /^data:image\/(png|jpeg);/.test(data.plano.dataUrl)
      ) {
        state.plano = {
          nombre: String(data.plano.nombre || 'plano'),
          dataUrl: data.plano.dataUrl,
          w: Number(data.plano.w) || 0,
          h: Number(data.plano.h) || 0
        };
      }
      restoredOmitted = !!data.planoOmitted;
      return restored.length > 0 || !!state.plano;
    } catch (err) {
      return false;
    }
  }

  function clearDraft() {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch (err) {
      /* noop */
    }
  }

  // --- Plano de fondo (imagen o primera página de PDF) -----------------------

  function setPlanStatus(text, kind) {
    if (!planStatusEl) return;
    planStatusEl.className = 'plan-upload__status' + (kind ? ' is-' + kind : '');
    planStatusEl.textContent = text;
  }

  function renderPlanoUI() {
    if (!planActionsEl || !planNameEl) return;
    if (state.plano) {
      planActionsEl.hidden = false;
      planNameEl.textContent = state.plano.nombre;
    } else {
      planActionsEl.hidden = true;
      planNameEl.textContent = '';
    }
  }

  function canvasToPlan(canvas) {
    return {
      dataUrl: canvas.toDataURL('image/jpeg', 0.8),
      w: canvas.width,
      h: canvas.height
    };
  }

  function readImageFile(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        var scale = Math.min(1, MAX_PLANO_WIDTH / img.naturalWidth);
        var w = Math.max(1, Math.round(img.naturalWidth * scale));
        var h = Math.max(1, Math.round(img.naturalHeight * scale));
        var canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvasToPlan(canvas));
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('No pudimos leer la imagen.'));
      };
      img.src = url;
    });
  }

  function loadPdfLib() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if (pdfLibPromise) return pdfLibPromise;
    pdfLibPromise = new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = PDF_SCRIPT;
      script.onload = function () {
        if (!window.pdfjsLib) {
          reject(new Error('No pudimos cargar el lector de PDF.'));
          return;
        }
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER;
        resolve(window.pdfjsLib);
      };
      script.onerror = function () {
        reject(new Error('No pudimos cargar el lector de PDF.'));
      };
      document.head.appendChild(script);
    });
    return pdfLibPromise;
  }

  function readPdfFile(file) {
    return loadPdfLib()
      .then(function (lib) {
        return file.arrayBuffer().then(function (buffer) {
          return lib.getDocument({ data: new Uint8Array(buffer) }).promise;
        });
      })
      .then(function (pdf) {
        return pdf.getPage(1).then(function (page) {
          var base = page.getViewport({ scale: 1 });
          var scale = Math.min(2, MAX_PLANO_WIDTH / base.width);
          var viewport = page.getViewport({ scale: scale });
          var canvas = document.createElement('canvas');
          canvas.width = Math.round(viewport.width);
          canvas.height = Math.round(viewport.height);
          var ctx = canvas.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          return page.render({ canvasContext: ctx, viewport: viewport }).promise.then(function () {
            return canvasToPlan(canvas);
          });
        });
      })
      .catch(function () {
        throw new Error('Para PDF: exportá la primera página como imagen (PNG o JPG).');
      });
  }

  function handlePlanFile(file) {
    var name = (file && file.name) || 'plano';
    if (!file || !file.size) {
      setPlanStatus('No pudimos leer el archivo.', 'error');
      return;
    }
    var isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(name);
    var isImage = /^image\/(png|jpeg)$/.test(file.type) || /\.(png|jpe?g)$/i.test(name);
    if (!isPdf && !isImage) {
      setPlanStatus('Formato no soportado. Subí PNG, JPG o PDF.', 'error');
      return;
    }

    setPlanStatus('Procesando plano…', '');
    var task = isPdf ? readPdfFile(file) : readImageFile(file);

    task
      .then(function (result) {
        state.plano = { nombre: name, dataUrl: result.dataUrl, w: result.w, h: result.h };
        state.ambientes = [];
        state.aceptadas = {};
        state.selectedId = null;
        state.template = null;
        syncTemplates();
        renderPlanoUI();
        renderPlan();
        renderProps();
        renderSuggestions();
        renderTotals();
        schedule3D();
        saveDraft();
        setPlanStatus('Plano cargado: ' + name, 'ok');
      })
      .catch(function (err) {
        setPlanStatus(
          err && err.message ? err.message : 'No pudimos leer el archivo.',
          'error'
        );
      });
  }

  function clearPlano() {
    if (!state.plano) return;
    state.plano = null;
    renderPlanoUI();
    renderPlan();
    schedule3D();
    saveDraft();
    setPlanStatus('Plano quitado.', '');
  }

  // --- DXF del arquitecto (F2c) ----------------------------------------------

  function applyDxf(payload) {
    var list = Array.isArray(payload.ambientes) ? payload.ambientes : [];
    var warnings = Array.isArray(payload.advertencias) ? payload.advertencias.slice() : [];
    var imported = [];

    list.forEach(function (raw) {
      if (!raw || typeof raw !== 'object') return;
      var tipo = TIPOS[raw.tipo] ? raw.tipo : 'living';
      imported.push({
        id: newId(),
        tipo: tipo,
        nombre: String(raw.nombre || TIPOS[tipo].label).slice(0, 40),
        x: Number(raw.x) || 0,
        y: Number(raw.y) || 0,
        w: Math.max(0.5, Number(raw.w) || TIPOS[tipo].w),
        h: Math.max(0.5, Number(raw.h) || TIPOS[tipo].h)
      });
    });

    if (!imported.length) {
      setPlanStatus(DXF_FALLBACK_TEXT, 'error');
      if (dxfFallbackEl) dxfFallbackEl.hidden = false;
      return;
    }

    var minX = Infinity;
    var minY = Infinity;
    var maxX = -Infinity;
    var maxY = -Infinity;
    imported.forEach(function (room) {
      minX = Math.min(minX, room.x);
      minY = Math.min(minY, room.y);
      maxX = Math.max(maxX, room.x + room.w);
      maxY = Math.max(maxY, room.y + room.h);
    });

    var margin = 0.5;
    var spanX = Math.max(0.001, maxX - minX);
    var spanY = Math.max(0.001, maxY - minY);
    var scale = Math.min(
      1,
      (AREA.w - margin * 2) / spanX,
      (AREA.d - margin * 2) / spanY
    );
    var adjusted = scale < 0.999;

    imported.forEach(function (room) {
      room.x = snap((room.x - minX) * scale + margin);
      room.y = snap((room.y - minY) * scale + margin);
      room.w = Math.max(0.5, snap(room.w * scale));
      room.h = Math.max(0.5, snap(room.h * scale));
      room.x = clamp(room.x, 0, AREA.w - room.w);
      room.y = clamp(room.y, 0, AREA.d - room.h);
    });

    if (adjusted) warnings.push('Escala ajustada al lienzo.');

    state.ambientes = imported;
    state.aceptadas = {};
    imported.forEach(function (room) {
      state.aceptadas[room.id] = defaultsFor(room.tipo);
    });
    state.selectedId = imported[0].id;
    state.template = null;
    state.plano = null;
    syncTemplates();
    renderPlanoUI();
    renderPlan();
    renderProps();
    renderSuggestions();
    renderTotals();
    schedule3D();
    saveDraft();

    var count = imported.length;
    var mensaje = 'Traemos ' + count + ' ambientes de tu CAD — revisá tipos y posiciones.';
    if (payload.unidades) mensaje += ' Unidades: ' + payload.unidades + '.';
    if (warnings.length) mensaje += ' ' + warnings.join(' ');
    setPlanStatus(mensaje, 'ok');
    if (hintEl) {
      hintEl.hidden = false;
      hintEl.textContent = mensaje;
    }
    if (dxfFallbackEl) dxfFallbackEl.hidden = true;
  }

  function handleDxfFile(file) {
    var name = (file && file.name) || 'plano.dxf';
    if (!file || !file.size) {
      setPlanStatus('No pudimos leer el archivo.', 'error');
      return;
    }
    if (!/\.dxf$/i.test(name)) {
      setPlanStatus('Subí un archivo .dxf exportado desde tu CAD.', 'error');
      return;
    }

    setPlanStatus('Procesando CAD…', '');
    if (dxfFallbackEl) dxfFallbackEl.hidden = true;

    var body = new FormData();
    body.append('file', file, name);

    fetch('/dxf-parse', { method: 'POST', body: body })
      .then(function (response) {
        return response
          .json()
          .catch(function () { return null; })
          .then(function (data) { return { response: response, data: data }; });
      })
      .then(function (result) {
        if (!result.data || result.data.ok !== true) {
          var msg = (result.data && result.data.error) || DXF_FALLBACK_TEXT;
          setPlanStatus(msg, 'error');
          if (dxfFallbackEl) dxfFallbackEl.hidden = false;
          return;
        }
        applyDxf(result.data);
      })
      .catch(function () {
        setPlanStatus(
          'No pudimos procesar el CAD. Si estás sin servidor, usá el modo imagen.',
          'error'
        );
        if (dxfFallbackEl) dxfFallbackEl.hidden = false;
      });
  }

  // --- Render 2D -------------------------------------------------------------

  function roomLabel(room) {
    return room.nombre || tipoOf(room).label;
  }

  function applyRoomStyle(el, room) {
    el.style.left = pct(room.x, AREA.w) + '%';
    el.style.top = pct(room.y, AREA.d) + '%';
    el.style.width = pct(room.w, AREA.w) + '%';
    el.style.height = pct(room.h, AREA.d) + '%';
  }

  function updateRoomEl(room) {
    var el = planEl.querySelector('.room[data-id="' + room.id + '"]');
    if (!el) return;
    applyRoomStyle(el, room);
    var size = el.querySelector('.room__size');
    if (size) size.textContent = round(room.w) + ' × ' + round(room.h) + ' m';
    el.setAttribute('data-tipo', room.tipo);
    el.setAttribute('aria-label', roomLabel(room) + ', ' + round(room.w) + ' por ' + round(room.h) + ' metros');
  }

  function renderPlan() {
    planEl.innerHTML = '';

    if (state.plano) {
      var bg = document.createElement('img');
      bg.className = 'plan__bg';
      bg.alt = '';
      bg.setAttribute('aria-hidden', 'true');
      bg.src = state.plano.dataUrl;
      planEl.appendChild(bg);
    }

    if (!state.ambientes.length) {
      var empty = document.createElement('p');
      empty.className = 'plan-empty';
      empty.textContent = 'Elegí una plantilla o agregá un ambiente para empezar.';
      planEl.appendChild(empty);
      return;
    }

    state.ambientes.forEach(function (room) {
      var el = document.createElement('div');
      el.className = 'room' + (room.id === state.selectedId ? ' is-selected' : '');
      el.setAttribute('data-id', room.id);
      el.setAttribute('data-tipo', room.tipo);
      el.setAttribute('tabindex', '0');
      el.setAttribute('role', 'group');
      el.setAttribute('aria-label', roomLabel(room) + ', ' + round(room.w) + ' por ' + round(room.h) + ' metros');

      var name = document.createElement('span');
      name.className = 'room__name';
      name.textContent = roomLabel(room);

      var size = document.createElement('span');
      size.className = 'room__size';
      size.textContent = round(room.w) + ' × ' + round(room.h) + ' m';

      var handle = document.createElement('span');
      handle.className = 'room__handle';
      handle.setAttribute('aria-hidden', 'true');

      el.appendChild(name);
      el.appendChild(size);
      el.appendChild(handle);
      applyRoomStyle(el, room);
      planEl.appendChild(el);
    });
  }

  // --- Props -----------------------------------------------------------------

  function select(id) {
    if (state.selectedId === id) return;
    state.selectedId = id;
    var items = planEl.querySelectorAll('.room');
    for (var i = 0; i < items.length; i += 1) {
      items[i].classList.toggle('is-selected', items[i].getAttribute('data-id') === id);
    }
    renderProps();
  }

  function renderProps() {
    propsEl.innerHTML = '';
    var room = state.selectedId ? getRoom(state.selectedId) : null;

    if (!room) {
      var hint = document.createElement('p');
      hint.className = 'props__hint';
      hint.textContent = 'Seleccioná un ambiente en el plano para editarlo.';
      propsEl.appendChild(hint);
      return;
    }

    var title = document.createElement('p');
    title.className = 'props__title';
    title.textContent = 'Ambiente seleccionado';

    var fieldName = document.createElement('div');
    fieldName.className = 'field';
    var labelName = document.createElement('label');
    labelName.className = 'field__label';
    labelName.setAttribute('for', 'room-name');
    labelName.textContent = 'Nombre';
    var inputName = document.createElement('input');
    inputName.className = 'field__input';
    inputName.id = 'room-name';
    inputName.type = 'text';
    inputName.maxLength = 40;
    inputName.value = room.nombre;
    fieldName.appendChild(labelName);
    fieldName.appendChild(inputName);

    var fieldType = document.createElement('div');
    fieldType.className = 'field';
    var labelType = document.createElement('label');
    labelType.className = 'field__label';
    labelType.setAttribute('for', 'room-type');
    labelType.textContent = 'Tipo';
    var selectType = document.createElement('select');
    selectType.className = 'field__input';
    selectType.id = 'room-type';
    Object.keys(TIPOS).forEach(function (key) {
      var opt = document.createElement('option');
      opt.value = key;
      opt.textContent = TIPOS[key].label;
      if (key === room.tipo) opt.selected = true;
      selectType.appendChild(opt);
    });
    fieldType.appendChild(labelType);
    fieldType.appendChild(selectType);

    var meta = document.createElement('p');
    meta.className = 'props__meta';
    meta.textContent = 'Tamaño: ' + round(room.w) + ' × ' + round(room.h) + ' m · mové con flechas, arrastrá o usá la esquina.';

    var actions = document.createElement('div');
    actions.className = 'props__actions';
    var remove = document.createElement('button');
    remove.className = 'btn btn--ghost';
    remove.type = 'button';
    remove.textContent = 'Eliminar ambiente';
    actions.appendChild(remove);

    propsEl.appendChild(title);
    propsEl.appendChild(fieldName);
    propsEl.appendChild(fieldType);
    propsEl.appendChild(meta);
    propsEl.appendChild(actions);

    inputName.addEventListener('input', function () {
      room.nombre = inputName.value.slice(0, 40);
      var el = planEl.querySelector('.room[data-id="' + room.id + '"] .room__name');
      if (el) el.textContent = roomLabel(room);
      var elRoom = planEl.querySelector('.room[data-id="' + room.id + '"]');
      if (elRoom) elRoom.setAttribute('aria-label', roomLabel(room) + ', ' + round(room.w) + ' por ' + round(room.h) + ' metros');
      schedule3D();
      scheduleSave();
      updateSuggestionTitles();
    });

    selectType.addEventListener('change', function () {
      setTipo(room.id, selectType.value);
    });

    remove.addEventListener('click', function () {
      removeRoom(room.id);
    });
  }

  // --- Sugerencias -----------------------------------------------------------

  function roomArea(room) {
    return round(room.w * room.h);
  }

  function updateSuggestionTitles() {
    var cards = suggestionsEl.querySelectorAll('.suggest-card');
    for (var i = 0; i < cards.length; i += 1) {
      var id = cards[i].getAttribute('data-room');
      var room = getRoom(id);
      if (!room) continue;
      var head = cards[i].querySelector('.suggest-card__title');
      if (head) head.textContent = roomLabel(room) + ' · ' + roomArea(room) + ' m²';
    }
  }

  function renderSuggestions() {
    suggestionsEl.innerHTML = '';

    if (!state.ambientes.length) {
      var empty = document.createElement('p');
      empty.className = 'suggest-empty';
      empty.textContent = 'Agregá ambientes para ver qué te sugerimos en cada uno.';
      suggestionsEl.appendChild(empty);
      return;
    }

    state.ambientes.forEach(function (room) {
      ensureAceptadas(room);
      var devices = deviceIndex(room.tipo);
      var accepted = state.aceptadas[room.id] || [];

      var card = document.createElement('article');
      card.className = 'suggest-card';
      card.setAttribute('data-room', room.id);

      var head = document.createElement('div');
      head.className = 'suggest-card__head';
      var title = document.createElement('h3');
      title.className = 'suggest-card__title';
      title.textContent = roomLabel(room) + ' · ' + roomArea(room) + ' m²';
      head.appendChild(title);
      card.appendChild(head);

      var list = document.createElement('ul');
      list.className = 'suggest-list';

      devices.forEach(function (device) {
        var cat = CATS[device.cat];
        var item = document.createElement('li');
        var label = document.createElement('label');
        label.className = 'suggest-item';

        var input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = accepted.indexOf(device.key) !== -1;
        input.setAttribute('data-room', room.id);
        input.setAttribute('data-key', device.key);

        var dot = document.createElement('span');
        dot.className = 'dot';
        dot.style.backgroundColor = cat.hex;
        dot.setAttribute('aria-hidden', 'true');

        var text = document.createElement('span');
        text.className = 'suggest-item__text';
        var strong = document.createElement('strong');
        strong.textContent = device.nombre;
        var small = document.createElement('span');
        small.textContent = device.desc;
        text.appendChild(strong);
        text.appendChild(small);

        label.appendChild(input);
        label.appendChild(dot);
        label.appendChild(text);
        item.appendChild(label);
        list.appendChild(item);
      });

      card.appendChild(list);
      suggestionsEl.appendChild(card);
    });
  }

  function renderTotals() {
    var t = totals();
    totalsEl.textContent =
      t.total + ' dispositivos · Iluminación ' + t.iluminacion +
      ' · Clima ' + t.clima + ' · Seguridad ' + t.seguridad +
      ' · Energía ' + t.energia;
  }

  function syncTemplates() {
    templateButtons.forEach(function (btn) {
      btn.setAttribute('aria-pressed', btn.getAttribute('data-template') === state.template ? 'true' : 'false');
    });
  }

  // --- Mutaciones ------------------------------------------------------------

  function addRoom(tipo) {
    var def = TIPOS[tipo] || TIPOS.dormitorio;
    var w = def.w;
    var h = def.h;
    var count = state.ambientes.length;
    var x = clamp(snap(0.5 + (count % 3) * 2.6), 0, AREA.w - w);
    var y = clamp(snap(0.5 + (count % 2) * 2.6), 0, AREA.d - h);

    var room = normalizeRoom({
      tipo: tipo, nombre: def.label, x: x, y: y, w: w, h: h
    });
    state.ambientes.push(room);
    state.aceptadas[room.id] = defaultsFor(tipo);
    state.selectedId = room.id;
    state.template = null;
    syncTemplates();
    renderPlan();
    renderProps();
    renderSuggestions();
    renderTotals();
    schedule3D();
    scheduleSave();
    return room;
  }

  function removeRoom(id) {
    var index = -1;
    for (var i = 0; i < state.ambientes.length; i += 1) {
      if (state.ambientes[i].id === id) { index = i; break; }
    }
    if (index === -1) return;
    state.ambientes.splice(index, 1);
    delete state.aceptadas[id];
    if (state.selectedId === id) {
      state.selectedId = state.ambientes.length ? state.ambientes[0].id : null;
    }
    state.template = null;
    syncTemplates();
    renderPlan();
    renderProps();
    renderSuggestions();
    renderTotals();
    schedule3D();
    saveDraft();
  }

  function setTipo(id, tipo) {
    var room = getRoom(id);
    if (!room || !TIPOS[tipo]) return;
    room.tipo = tipo;
    if (room.nombre === TIPOS[room.tipo].label) {
      /* conserva el nombre; si era el label genérico, lo dejamos igual */
    }
    state.aceptadas[id] = defaultsFor(tipo);
    state.template = null;
    syncTemplates();
    renderPlan();
    renderProps();
    renderSuggestions();
    renderTotals();
    schedule3D();
    saveDraft();
  }

  function toggleDevice(roomId, key, checked) {
    var room = getRoom(roomId);
    if (!room) return;
    ensureAceptadas(room);
    var keys = state.aceptadas[roomId];
    var index = keys.indexOf(key);
    if (checked && index === -1) keys.push(key);
    if (!checked && index !== -1) keys.splice(index, 1);
    renderTotals();
    schedule3D();
    scheduleSave();
  }

  function moveRoom(room, dx, dy) {
    room.x = clamp(snap(room.x + dx), 0, AREA.w - room.w);
    room.y = clamp(snap(room.y + dy), 0, AREA.d - room.h);
    updateRoomEl(room);
    schedule3D();
    scheduleSave();
  }

  function loadTemplate(id) {
    var list = TEMPLATES[id] || [];
    state.plano = null;
    renderPlanoUI();
    setPlanStatus('', '');
    state.ambientes = list.map(function (r) {
      var room = normalizeRoom({ tipo: r.tipo, nombre: r.nombre, x: r.x, y: r.y, w: r.w, h: r.h });
      state.aceptadas[room.id] = defaultsFor(room.tipo);
      return room;
    });
    state.template = id;
    state.selectedId = state.ambientes.length ? state.ambientes[0].id : null;
    syncTemplates();
    renderPlan();
    renderProps();
    renderSuggestions();
    renderTotals();
    schedule3D();
    saveDraft();
  }

  function resetAll() {
    state.ambientes = [];
    state.aceptadas = {};
    state.selectedId = null;
    state.template = null;
    state.plano = null;
    clearDraft();
    renderPlanoUI();
    setPlanStatus('', '');
    if (hintEl) {
      hintEl.hidden = false;
      hintEl.textContent = 'Empezaste de cero. Elegí una plantilla o agregá ambientes.';
    }
    syncTemplates();
    renderPlan();
    renderProps();
    renderSuggestions();
    renderTotals();
    schedule3D();
  }

  // --- Drag & teclado --------------------------------------------------------

  var drag = null;

  function startDrag(event, room, resizing) {
    var rect = planEl.getBoundingClientRect();
    if (!rect.width) return;
    drag = {
      id: room.id,
      resizing: resizing,
      startX: event.clientX,
      startY: event.clientY,
      x0: room.x,
      y0: room.y,
      w0: room.w,
      h0: room.h,
      ppmX: AREA.w / rect.width,
      ppmY: AREA.d / rect.height
    };
    document.body.classList.add('is-dragging');
    if (event.pointerId !== undefined && event.target.setPointerCapture) {
      try { event.target.setPointerCapture(event.pointerId); } catch (err) { /* noop */ }
    }
    event.preventDefault();
  }

  planEl.addEventListener('pointerdown', function (event) {
    var roomEl = event.target.closest ? event.target.closest('.room') : null;
    if (!roomEl) {
      select(null);
      return;
    }
    var room = getRoom(roomEl.getAttribute('data-id'));
    if (!room) return;
    select(room.id);
    var handle = event.target.closest('.room__handle');
    startDrag(event, room, !!handle);
  });

  window.addEventListener('pointermove', function (event) {
    if (!drag) return;
    var room = getRoom(drag.id);
    if (!room) return;
    var dx = (event.clientX - drag.startX) * drag.ppmX;
    var dy = (event.clientY - drag.startY) * drag.ppmY;
    if (drag.resizing) {
      room.w = clamp(snap(drag.w0 + dx), AREA.min, AREA.w - room.x);
      room.h = clamp(snap(drag.h0 + dy), AREA.min, AREA.d - room.y);
    } else {
      room.x = clamp(snap(drag.x0 + dx), 0, AREA.w - room.w);
      room.y = clamp(snap(drag.y0 + dy), 0, AREA.d - room.h);
    }
    updateRoomEl(room);
    schedule3D();
  });

  function endDrag() {
    if (!drag) return;
    drag = null;
    document.body.classList.remove('is-dragging');
    renderProps();
    saveDraft();
  }

  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);

  planEl.addEventListener('focusin', function (event) {
    var roomEl = event.target.closest ? event.target.closest('.room') : null;
    if (roomEl) select(roomEl.getAttribute('data-id'));
  });

  planEl.addEventListener('keydown', function (event) {
    var roomEl = event.target.closest ? event.target.closest('.room') : null;
    if (!roomEl) return;
    var room = getRoom(roomEl.getAttribute('data-id'));
    if (!room) return;
    var key = event.key;

    if (key === 'Delete' || key === 'Backspace') {
      event.preventDefault();
      removeRoom(room.id);
      return;
    }

    var moves = { ArrowLeft: [-0.5, 0], ArrowRight: [0.5, 0], ArrowUp: [0, -0.5], ArrowDown: [0, 0.5] };
    if (!moves[key]) return;
    event.preventDefault();
    moveRoom(room, moves[key][0], moves[key][1]);
  });

  // --- Eventos de UI ---------------------------------------------------------

  paletteButtons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      addRoom(btn.getAttribute('data-add'));
    });
  });

  templateButtons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      loadTemplate(btn.getAttribute('data-template'));
    });
  });

  suggestionsEl.addEventListener('change', function (event) {
    var input = event.target;
    if (!input || input.type !== 'checkbox') return;
    toggleDevice(input.getAttribute('data-room'), input.getAttribute('data-key'), input.checked);
  });

  var resetBtn = document.getElementById('reset-draft');
  if (resetBtn) {
    resetBtn.addEventListener('click', resetAll);
  }

  if (planFileEl) {
    planFileEl.addEventListener('change', function () {
      var file = planFileEl.files && planFileEl.files[0];
      planFileEl.value = '';
      if (file) handlePlanFile(file);
    });
  }

  if (planRemoveEl) {
    planRemoveEl.addEventListener('click', clearPlano);
  }

  if (dxfFileEl) {
    dxfFileEl.addEventListener('change', function () {
      var file = dxfFileEl.files && dxfFileEl.files[0];
      dxfFileEl.value = '';
      if (file) handleDxfFile(file);
    });
  }

  // --- 3D --------------------------------------------------------------------

  var scene;
  var camera;
  var renderer;
  var controls;
  var root = null;
  var stats = { meshes: 0, sprites: 0 };
  var cameraLocked = false;

  function disposeRoot() {
    if (!root) return;
    scene.remove(root);
    root.traverse(function (obj) {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        var mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach(function (m) {
          if (m.map) m.map.dispose();
          m.dispose();
        });
      }
    });
    root = null;
  }

  function makeLabel(text) {
    var canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    var ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = '600 44px system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#e8eef7';
    var label = text.length > 18 ? text.slice(0, 17) + '…' : text;
    ctx.fillText(label, canvas.width / 2, canvas.height / 2);

    var tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    var mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
    var sprite = new THREE.Sprite(mat);
    sprite.scale.set(3.2, 0.8, 1);
    return sprite;
  }

  function buildRoom3D(room, wallMat, edgeMat) {
    var tipo = tipoOf(room);
    var color = new THREE.Color(0x111a2c).lerp(new THREE.Color(tipo.color), 0.2);
    var floorMat = new THREE.MeshStandardMaterial({ color: color, roughness: 0.95, metalness: 0.04 });

    var floor = new THREE.Mesh(new THREE.BoxGeometry(room.w - 0.06, 0.12, room.h - 0.06), floorMat);
    floor.position.set(room.x + room.w / 2, -0.06, room.y + room.h / 2);
    root.add(floor);

    var h = AREA.wallH;
    var walls = [
      { x: room.x + room.w / 2, z: room.y, w: room.w, d: 0.12 },
      { x: room.x + room.w / 2, z: room.y + room.h, w: room.w, d: 0.12 },
      { x: room.x, z: room.y + room.h / 2, w: 0.12, d: room.h },
      { x: room.x + room.w, z: room.y + room.h / 2, w: 0.12, d: room.h }
    ];
    walls.forEach(function (wall) {
      var geo = new THREE.BoxGeometry(wall.w, h, wall.d);
      var mesh = new THREE.Mesh(geo, wallMat);
      mesh.position.set(wall.x, h / 2, wall.z);
      root.add(mesh);
      var edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat);
      edges.position.copy(mesh.position);
      root.add(edges);
    });

    var sprite = makeLabel(roomLabel(room));
    sprite.position.set(room.x + room.w / 2, 1.4, room.y + room.h / 2);
    root.add(sprite);

    var keys = state.aceptadas[room.id] || [];
    keys.forEach(function (key, index) {
      var device = findDevice(room.tipo, key);
      if (!device) return;
      var cat = CATS[device.cat];
      var cols = Math.max(1, Math.floor(room.w / 0.9));
      var px = room.x + 0.45 + (index % cols) * 0.9;
      var pz = room.y + 0.45 + Math.floor(index / cols) * 0.9;
      px = Math.min(px, room.x + room.w - 0.3);
      pz = Math.min(pz, room.y + room.h - 0.3);

      var dotMat = new THREE.MeshStandardMaterial({
        color: cat.color, emissive: cat.color, emissiveIntensity: 0.9, roughness: 0.4
      });
      var dot = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 10), dotMat);
      dot.position.set(px, 0.16, pz);
      root.add(dot);

      var zoneMat = new THREE.MeshBasicMaterial({
        color: cat.color, transparent: true, opacity: 0.12, depthWrite: false
      });
      var zone = new THREE.Mesh(new THREE.CircleGeometry(0.32, 20), zoneMat);
      zone.rotation.x = -Math.PI / 2;
      zone.position.set(px, 0.012, pz);
      root.add(zone);
    });
  }

  var sceneGen = 0;

  function addPlanGround(gen) {
    var plano = state.plano;
    if (!plano) return;
    new THREE.TextureLoader().load(plano.dataUrl, function (texture) {
      if (gen !== sceneGen || !root) {
        texture.dispose();
        return;
      }
      if (THREE.sRGBEncoding) texture.encoding = THREE.sRGBEncoding;
      var ratio = plano.w && plano.h ? plano.w / plano.h : AREA.w / AREA.d;
      var pw = AREA.w + 0.4;
      var ph = AREA.d + 0.4;
      if (pw / ph > ratio) {
        pw = ph * ratio;
      } else {
        ph = pw / ratio;
      }
      var mat = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        opacity: 0.55,
        depthWrite: false
      });
      var plane = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), mat);
      plane.rotation.x = -Math.PI / 2;
      plane.position.set(AREA.w / 2, -0.135, AREA.d / 2);
      root.add(plane);
      stats.meshes += 1;
    });
  }

  function rebuildScene() {
    disposeRoot();
    sceneGen += 1;
    var gen = sceneGen;
    root = new THREE.Group();

    var wallMat = new THREE.MeshStandardMaterial({
      color: 0x263449, roughness: 0.8, transparent: true, opacity: 0.9
    });
    var edgeMat = new THREE.LineBasicMaterial({
      color: 0x8b9ab5, transparent: true, opacity: 0.45
    });

    state.ambientes.forEach(function (room) {
      buildRoom3D(room, wallMat, edgeMat);
    });

    if (state.plano) addPlanGround(gen);

    scene.add(root);
    stats = { meshes: 0, sprites: 0 };
    root.traverse(function (obj) {
      if (obj.isMesh) stats.meshes += 1;
      if (obj.isSprite) stats.sprites += 1;
    });
  }

  var rebuildPending = false;
  function schedule3D() {
    if (rebuildPending) return;
    rebuildPending = true;
    window.requestAnimationFrame(function () {
      rebuildPending = false;
      rebuildScene();
    });
  }

  function focusCamera() {
    var aspect = camera.aspect || 1;
    var vfov = (camera.fov * Math.PI) / 180;
    var hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
    var distance =
      Math.max(AREA.w / (2 * Math.tan(hfov / 2)), AREA.d / (2 * Math.tan(vfov / 2))) *
        1.15 +
      1.5;

    controls.target.set(AREA.w / 2, 0.35, AREA.d / 2);
    var dir = new THREE.Vector3(0.42, 0.95, 0.75).normalize();
    camera.position.copy(controls.target).addScaledVector(dir, distance);
    controls.update();
  }

  function resize() {
    var w = container.clientWidth;
    var h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (!cameraLocked) focusCamera();
  }

  function init() {
    if (THREE.ColorManagement) THREE.ColorManagement.legacyMode = false;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b1220);
    scene.fog = new THREE.Fog(0x0b1220, 22, 60);

    camera = new THREE.PerspectiveCamera(42, 1, 0.1, 220);

    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch (err) {
      container.innerHTML = '<p class="config-hint">No pudimos iniciar WebGL en este navegador.</p>';
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x0b1220, 1);
    if (THREE.sRGBEncoding) renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.domElement.setAttribute('aria-hidden', 'true');
    container.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0x9fb3cc, 0.75));
    var key = new THREE.DirectionalLight(0xffffff, 0.95);
    key.position.set(8, 14, 8);
    scene.add(key);
    var fill = new THREE.DirectionalLight(0x60a5fa, 0.3);
    fill.position.set(-8, 6, -6);
    scene.add(fill);

    if (THREE.OrbitControls) {
      controls = new THREE.OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.minDistance = 7;
      controls.maxDistance = 36;
      controls.maxPolarAngle = Math.PI / 2.15;
      controls.autoRotate = !REDUCED;
      controls.autoRotateSpeed = 0.6;
      controls.addEventListener('start', function () {
        controls.autoRotate = false;
        cameraLocked = true;
      });
    } else {
      controls = { target: new THREE.Vector3(AREA.w / 2, 0.35, AREA.d / 2), update: function () {} };
      camera.lookAt(controls.target);
    }

    resize();
    focusCamera();
    rebuildScene();
    window.addEventListener('resize', resize);

    (function animate() {
      window.requestAnimationFrame(animate);
      if (controls.update) controls.update();
      renderer.render(scene, camera);
    })();
  }

  // --- API pública -----------------------------------------------------------

  window.nexoConfigurador = {
    getState: function () {
      var t = totals();
      var aceptadas = {};
      state.ambientes.forEach(function (room) {
        aceptadas[room.id] = (state.aceptadas[room.id] || []).slice();
      });
      return {
        ambientes: JSON.parse(JSON.stringify(state.ambientes)),
        aceptadas: aceptadas,
        totals: t,
        selectedId: state.selectedId,
        template: state.template,
        plano: state.plano
          ? {
              nombre: state.plano.nombre,
              dataUrl: state.plano.dataUrl,
              w: state.plano.w,
              h: state.plano.h
            }
          : null,
        meshes: { total: stats.meshes, sprites: stats.sprites },
        reducedMotion: REDUCED,
        canvas: renderer
          ? { width: renderer.domElement.width, height: renderer.domElement.height }
          : null
      };
    },
    setTemplate: loadTemplate,
    addRoom: addRoom,
    removeRoom: removeRoom,
    reset: resetAll
  };

  // --- Arranque --------------------------------------------------------------

  var restored = restoreDraft();
  ensureAceptadasAll();
  syncTemplates();
  renderPlan();
  renderProps();
  renderSuggestions();
  renderTotals();
  renderPlanoUI();
  init();

  if (restoredOmitted && hintEl) {
    hintEl.hidden = false;
    hintEl.textContent = 'El plano no se guardó por tamaño; los ambientes sí.';
  } else if (restored && hintEl) {
    hintEl.hidden = false;
    hintEl.textContent = state.plano
      ? 'Recuperamos tu última casa y tu plano.'
      : 'Recuperamos tu última casa.';
  }

  function ensureAceptadasAll() {
    state.ambientes.forEach(function (room) {
      ensureAceptadas(room);
    });
  }
})();
