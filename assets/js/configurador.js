/* NexoHome · configurador 3D (vanilla sobre three r147 vendorizado).
   Sin dependencias externas ni red. Expone window.nexoConfigurador para
   diagnóstico y una futura integración F2 (guardar diseño con cuenta). */
(function () {
  'use strict';

  var container = document.getElementById('config-canvas');
  var panel = document.getElementById('config-panel');
  if (!container || !panel || !window.THREE) return;

  var REDUCED = window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;

  var CATS = [
    {
      id: 'iluminacion',
      label: 'Iluminación',
      hex: '#2dd4bf',
      desc: 'Luces LED regulables por ambiente, con escenas y control desde el celular.'
    },
    {
      id: 'clima',
      label: 'Climatización',
      hex: '#60a5fa',
      desc: 'Aire y calefacción con termostato inteligente, horarios y zonas.'
    },
    {
      id: 'seguridad',
      label: 'Seguridad',
      hex: '#f87171',
      desc: 'Cámaras, sensores de apertura y alertas en el celular.'
    },
    {
      id: 'energia',
      label: 'Energía',
      hex: '#4ade80',
      desc: 'Tablero inteligente, panel solar y batería para cortes de luz.'
    }
  ];

  var PRESETS = {
    depto: {
      id: 'depto',
      w: 10,
      d: 7,
      partitions: [
        { x: 1.0, z: -2.0, len: 3.0, axis: 'z' },
        { x: 1.0, z: 2.0, len: 3.0, axis: 'z' }
      ],
      lights: [
        [-3.4, -1.8], [-3.4, 1.8], [-1.0, 0],
        [3.1, -1.9], [3.1, 1.9], [3.1, 0]
      ],
      clima: [
        [-3.2, 2.3, 0],
        [3.0, -2.3, Math.PI]
      ],
      cameras: [
        [-4.4, -2.9, 0.7],
        [4.4, -2.9, -0.7]
      ],
      sensors: [
        [3.9, 3.3]
      ]
    },
    casa: {
      id: 'casa',
      w: 14,
      d: 10,
      partitions: [
        { x: -1.4, z: -3.0, len: 4.0, axis: 'z' },
        { x: -1.4, z: 3.0, len: 4.0, axis: 'z' },
        { x: 0.8, z: 1.4, len: 4.0, axis: 'x' },
        { x: 4.8, z: 1.4, len: 2.4, axis: 'x' },
        { x: 4.2, z: -1.8, len: 3.2, axis: 'z' }
      ],
      lights: [
        [-5.6, -3.0], [-5.6, 1.6], [-3.4, -3.0], [-3.4, 1.6],
        [-0.2, -2.6], [-0.2, 0.2], [2.6, -3.0], [2.6, -0.4],
        [5.4, -3.2], [5.4, 3.4]
      ],
      clima: [
        [-5.6, 3.6, 0],
        [-0.2, -4.0, Math.PI],
        [2.6, 3.6, Math.PI],
        [5.4, -0.2, -Math.PI / 2]
      ],
      cameras: [
        [-6.4, -4.4, 0.6],
        [6.4, -4.4, -0.6],
        [6.4, 4.4, -2.4]
      ],
      sensors: [
        [-6.4, 4.4],
        [0, -4.6]
      ]
    }
  };

  var state = {
    house: 'depto',
    cats: { iluminacion: true, clima: false, seguridad: false, energia: false }
  };

  var scene;
  var camera;
  var renderer;
  var controls;
  var root = null;
  var groups = {};

  var houseButtons = [].slice.call(document.querySelectorAll('.house-switch__btn'));
  var toggleButtons = [].slice.call(document.querySelectorAll('.config-toggle'));

  // --- Utilidades de material -------------------------------------------------

  function newMat(color, opts) {
    var params = { color: color };
    if (opts) {
      for (var k in opts) {
        if (Object.prototype.hasOwnProperty.call(opts, k)) params[k] = opts[k];
      }
    }
    return new THREE.MeshStandardMaterial(params);
  }

  function collectMaterials(group) {
    var mats = [];
    group.traverse(function (obj) {
      if (!obj.material) return;
      var list = Array.isArray(obj.material) ? obj.material : [obj.material];
      list.forEach(function (m) {
        if (mats.indexOf(m) !== -1) return;
        m.transparent = true;
        m.userData.baseOpacity = m.opacity;
        m.userData.baseEmissive = m.emissiveIntensity || 0;
        mats.push(m);
      });
    });
    group.userData.materials = mats;
    return group;
  }

  function groupWithTargets(group, on) {
    group.userData.value = on ? 1 : 0;
    group.userData.target = on ? 1 : 0;
    return group;
  }

  function countMeshes(obj) {
    var n = 0;
    obj.traverse(function (o) {
      if (o.isMesh && o.visible !== false) n += 1;
    });
    return n;
  }

  // --- Construcción de la vivienda -------------------------------------------

  function addWall(parent, len, x, z, axis, wallMat, edgeMat) {
    var height = 1.1;
    var geo = axis === 'x'
      ? new THREE.BoxGeometry(len, height, 0.12)
      : new THREE.BoxGeometry(0.12, height, len);
    var wall = new THREE.Mesh(geo, wallMat);
    wall.position.set(x, height / 2, z);
    parent.add(wall);

    var edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat);
    edges.position.copy(wall.position);
    parent.add(edges);
  }

  function buildPreset(preset) {
    var w = preset.w;
    var d = preset.d;

    root = new THREE.Group();

    var floorMat = newMat(0x131f33, { roughness: 0.95, metalness: 0.05 });
    var floor = new THREE.Mesh(new THREE.BoxGeometry(w, 0.16, d), floorMat);
    floor.position.y = -0.08;
    root.add(floor);

    var wallMat = newMat(0x263449, { roughness: 0.8, transparent: true, opacity: 0.9 });
    var edgeMat = new THREE.LineBasicMaterial({
      color: 0x8b9ab5,
      transparent: true,
      opacity: 0.45
    });

    // Perímetro abierto al frente (diorama): fondo, izquierda y derecha.
    addWall(root, w, 0, -d / 2, 'x', wallMat, edgeMat);
    addWall(root, d, -w / 2, 0, 'z', wallMat, edgeMat);
    addWall(root, d, w / 2, 0, 'z', wallMat, edgeMat);

    preset.partitions.forEach(function (p) {
      addWall(root, p.len, p.x, p.z, p.axis, wallMat, edgeMat);
    });

    groups = {
      iluminacion: groupWithTargets(
        collectMaterials(buildLighting(preset)),
        state.cats.iluminacion
      ),
      clima: groupWithTargets(collectMaterials(buildClimate(preset)), state.cats.clima),
      seguridad: groupWithTargets(
        collectMaterials(buildSecurity(preset)),
        state.cats.seguridad
      ),
      energia: groupWithTargets(collectMaterials(buildEnergy(preset)), state.cats.energia)
    };

    Object.keys(groups).forEach(function (key) {
      root.add(groups[key]);
      applyFade(groups[key], true);
    });

    scene.add(root);
  }

  function buildLighting(preset) {
    var g = new THREE.Group();
    var bulbMat = newMat(0x2dd4bf, {
      emissive: 0x2dd4bf,
      emissiveIntensity: 1.5,
      roughness: 0.35
    });
    var discMat = new THREE.MeshBasicMaterial({
      color: 0x2dd4bf,
      transparent: true,
      opacity: 0.12,
      depthWrite: false
    });

    preset.lights.forEach(function (p) {
      var bulb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10), bulbMat);
      bulb.position.set(p[0], 1.0, p[1]);
      g.add(bulb);

      var disc = new THREE.Mesh(new THREE.CircleGeometry(0.5, 24), discMat);
      disc.rotation.x = -Math.PI / 2;
      disc.position.set(p[0], 0.015, p[1]);
      g.add(disc);
    });

    return g;
  }

  function buildClimate(preset) {
    var g = new THREE.Group();
    var ventMat = newMat(0x60a5fa, { emissive: 0x60a5fa, emissiveIntensity: 0.4, roughness: 0.5 });
    var glassMat = newMat(0x0f1a2c, { emissive: 0x60a5fa, emissiveIntensity: 0.3, roughness: 0.2 });
    var zoneMat = new THREE.MeshBasicMaterial({
      color: 0x60a5fa,
      transparent: true,
      opacity: 0.1,
      depthWrite: false
    });

    // Termostato en la pared del fondo.
    var thermostat = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.18, 0.04), glassMat);
    thermostat.position.set(0, 0.9, -preset.d / 2 + 0.1);
    g.add(thermostat);

    preset.clima.forEach(function (p) {
      var vent = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.16), ventMat);
      vent.position.set(p[0], 1.02, p[1]);
      vent.rotation.y = p[2];
      g.add(vent);

      var zone = new THREE.Mesh(new THREE.CircleGeometry(0.85, 24), zoneMat);
      zone.rotation.x = -Math.PI / 2;
      zone.position.set(p[0], 0.02, p[1]);
      g.add(zone);
    });

    return g;
  }

  function buildSecurity(preset) {
    var g = new THREE.Group();
    var camMat = newMat(0xf87171, { emissive: 0xf87171, emissiveIntensity: 0.45, roughness: 0.5 });
    var lensMat = newMat(0x0f1a2c, { roughness: 0.2 });

    preset.cameras.forEach(function (p) {
      var cam = new THREE.Group();
      var body = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.1), camMat);
      cam.add(body);
      var cone = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.16, 10), camMat);
      cone.rotation.x = Math.PI / 2;
      cone.position.z = -0.13;
      cam.add(cone);
      var lens = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), lensMat);
      lens.position.z = 0.06;
      cam.add(lens);
      cam.position.set(p[0], 1.02, p[1]);
      cam.rotation.y = p[2];
      g.add(cam);
    });

    preset.sensors.forEach(function (p) {
      var sensor = new THREE.Group();
      var box = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.16, 0.04), camMat);
      sensor.add(box);
      var led = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), camMat);
      led.position.set(0, 0.06, 0.025);
      sensor.add(led);
      sensor.position.set(p[0], 0.85, p[1]);
      g.add(sensor);
    });

    return g;
  }

  function buildEnergy(preset) {
    var g = new THREE.Group();
    var panelMat = newMat(0x4ade80, { emissive: 0x4ade80, emissiveIntensity: 0.18, roughness: 0.3 });
    var darkMat = newMat(0x0f1a2c, { roughness: 0.6 });

    // Panel solar sobre la línea de cubierta.
    var solar = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.05, 1.0), panelMat);
    solar.position.set(-preset.w * 0.25, 1.16, -preset.d / 2 + 1.2);
    solar.rotation.x = -0.18;
    g.add(solar);

    // Batería de respaldo.
    var battery = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.5, 0.22), panelMat);
    battery.position.set(-preset.w / 2 + 0.55, 0.25, preset.d / 2 - 1.0);
    g.add(battery);

    // Tablero inteligente en la pared derecha.
    var board = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.4), darkMat);
    board.position.set(preset.w / 2 - 0.08, 0.58, 0);
    g.add(board);

    return g;
  }

  // --- Toggles y panel --------------------------------------------------------

  function countsOf(preset) {
    return {
      iluminacion: preset.lights.length,
      clima: preset.clima.length + 1,
      seguridad: preset.cameras.length + preset.sensors.length,
      energia: 3
    };
  }

  function renderPanel() {
    var preset = PRESETS[state.house];
    var counts = countsOf(preset);
    var html = '';

    CATS.forEach(function (cat) {
      if (!state.cats[cat.id]) return;
      html +=
        '<div class="config-panel__row">' +
        '<p class="config-panel__head">' +
        '<span class="config-panel__name">' +
        '<span class="config-panel__dot" style="--dot:' + cat.hex + '"></span>' +
        cat.label +
        '</span>' +
        '<span class="config-panel__count">' + counts[cat.id] + ' dispositivos</span>' +
        '</p>' +
        '<p class="config-panel__desc">' + cat.desc + '</p>' +
        '</div>';
    });

    panel.innerHTML = html ||
      '<p class="config-panel__empty">Activá una capa para ver qué incluye.</p>';
  }

  function applyFade(group, instant) {
    var target = group.userData.target;

    if (instant || REDUCED) {
      group.userData.value = target;
    } else {
      group.userData.value += (target - group.userData.value) * 0.18;
      if (Math.abs(target - group.userData.value) < 0.005) group.userData.value = target;
    }

    var value = group.userData.value;
    group.userData.materials.forEach(function (m) {
      m.opacity = m.userData.baseOpacity * value;
      if (m.userData.baseEmissive) {
        m.emissiveIntensity = m.userData.baseEmissive * value;
      }
    });
    group.visible = value > 0.01;
  }

  function setCategory(id, on) {
    if (!Object.prototype.hasOwnProperty.call(state.cats, id)) return;
    state.cats[id] = !!on;

    toggleButtons.forEach(function (btn) {
      if (btn.getAttribute('data-cat') === id) {
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      }
    });

    if (groups[id]) {
      groups[id].userData.target = on ? 1 : 0;
    }
    renderPanel();
  }

  function rebuild() {
    if (root) {
      scene.remove(root);
      root.traverse(function (o) {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          var list = Array.isArray(o.material) ? o.material : [o.material];
          list.forEach(function (m) { m.dispose(); });
        }
      });
      root = null;
    }
    groups = {};
    buildPreset(PRESETS[state.house]);
    focusCamera(PRESETS[state.house]);
    resize();
  }

  function setHouse(id) {
    if (!PRESETS[id] || id === state.house) return;
    state.house = id;
    houseButtons.forEach(function (btn) {
      btn.setAttribute('aria-pressed', btn.getAttribute('data-house') === id ? 'true' : 'false');
    });
    rebuild();
    renderPanel();
  }

  // --- Escena -----------------------------------------------------------------

  function focusCamera(preset) {
    camera.position.set(
      preset.w * 0.85,
      Math.max(preset.w, preset.d) * 1.25,
      preset.d * 1.35
    );
    controls.target.set(0, 0.35, 0);
    controls.update();
  }

  function resize() {
    var w = container.clientWidth;
    var h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function init() {
    // r147: interpretar los hex como sRGB desde el inicio (antes de crear
    // colores), para que el fondo y los materiales no se laven.
    if (THREE.ColorManagement) THREE.ColorManagement.legacyMode = false;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b1220);
    scene.fog = new THREE.Fog(0x0b1220, 18, 55);

    camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);

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
    key.position.set(7, 12, 6);
    scene.add(key);

    var fill = new THREE.DirectionalLight(0x60a5fa, 0.35);
    fill.position.set(-8, 6, -6);
    scene.add(fill);

    if (THREE.OrbitControls) {
      controls = new THREE.OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.minDistance = 8;
      controls.maxDistance = 34;
      controls.maxPolarAngle = Math.PI / 2.15;
      controls.autoRotate = !REDUCED;
      controls.autoRotateSpeed = 0.7;
      controls.addEventListener('start', function () {
        controls.autoRotate = false;
      });
    } else {
      controls = {
        target: new THREE.Vector3(0, 0.35, 0),
        update: function () {}
      };
      camera.lookAt(controls.target);
    }

    buildPreset(PRESETS[state.house]);
    focusCamera(PRESETS[state.house]);
    resize();
    renderPanel();

    window.addEventListener('resize', resize);

    (function animate() {
      window.requestAnimationFrame(animate);
      Object.keys(groups).forEach(function (key2) {
        var g = groups[key2];
        if (g.userData.value !== g.userData.target) applyFade(g, false);
      });
      if (controls.update) controls.update();
      renderer.render(scene, camera);
    })();
  }

  houseButtons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      setHouse(btn.getAttribute('data-house'));
    });
  });

  toggleButtons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var id = btn.getAttribute('data-cat');
      setCategory(id, btn.getAttribute('aria-pressed') !== 'true');
    });
  });

  // API mínima de diagnóstico / integración F2.
  window.nexoConfigurador = {
    getState: function () {
      var preset = PRESETS[state.house];
      var visible = {};
      Object.keys(groups).forEach(function (k) {
        visible[k] = {
          visible: groups[k].visible,
          opacity: Math.round(groups[k].userData.value * 100) / 100,
          meshes: countMeshes(groups[k])
        };
      });
      return {
        house: state.house,
        cats: JSON.parse(JSON.stringify(state.cats)),
        counts: countsOf(preset),
        groups: visible,
        autoRotate: controls ? !!controls.autoRotate : false,
        reducedMotion: REDUCED,
        canvas: { width: renderer.domElement.width, height: renderer.domElement.height }
      };
    },
    setCategory: setCategory,
    setHouse: setHouse
  };

  init();
})();
