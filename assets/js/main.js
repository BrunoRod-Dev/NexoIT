/* NexoIT · main.js
   Progressive enhancement. Registry de módulos por [data-module].
   Sin JS: nav visible, anchors funcionando, header sin estado de scroll. */
(function () {
  'use strict';

  var doc = document;
  var root = doc.documentElement;

  /* Marca de JS disponible.
     El estado inicial del menú móvil (colapsado) solo se aplica si la página
     tiene el toggle: en páginas que cargan main.js sin menú desplegable
     (grow/, home/) setearlo dejaría el .nav oculto y sin botón para abrirlo.
     Se hace antes del boot para evitar parpadeo del panel en el hub. */
  root.classList.add('js');
  if (doc.querySelector('[data-toggle="menu"]')) {
    root.setAttribute('data-menu', 'closed');
  }

  /* --- Módulo: header (estado de scroll) --------------------------------- */

  function initHeader(header) {
    var ticking = false;

    function update() {
      header.classList.toggle('is-scrolled', window.scrollY > 8);
      ticking = false;
    }

    function onScroll() {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(update);
    }

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* --- Menú móvil (data-toggle="menu") ---------------------------------- */

  function initMenu() {
    var toggles = doc.querySelectorAll('[data-toggle="menu"]');
    if (!toggles.length) return;

    function isOpen() {
      return root.getAttribute('data-menu') === 'open';
    }

    function setOpen(open) {
      root.setAttribute('data-menu', open ? 'open' : 'closed');
      for (var i = 0; i < toggles.length; i += 1) {
        toggles[i].setAttribute('aria-expanded', open ? 'true' : 'false');
      }
    }

    for (var i = 0; i < toggles.length; i += 1) {
      toggles[i].addEventListener('click', function () {
        setOpen(!isOpen());
      });
    }

    /* Al elegir un destino, el panel se cierra. */
    doc.addEventListener('click', function (event) {
      if (!isOpen()) return;
      var target = event.target;
      var link = target && target.closest ? target.closest('.nav a') : null;
      if (link) setOpen(false);
    });

    /* Escape cierra y devuelve el foco al botón. */
    doc.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape' || !isOpen()) return;
      setOpen(false);
      if (toggles[0]) toggles[0].focus();
    });
  }

  /* --- Registry ---------------------------------------------------------- */

  var modules = {
    header: initHeader
  };

  function boot() {
    var nodes = doc.querySelectorAll('[data-module]');
    for (var i = 0; i < nodes.length; i += 1) {
      var name = nodes[i].getAttribute('data-module');
      if (Object.prototype.hasOwnProperty.call(modules, name)) {
        modules[name](nodes[i]);
      }
    }
    initMenu();
  }

  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
