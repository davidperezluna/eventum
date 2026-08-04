(function () {
  'use strict';

  var BUILD_KEY = 'eventum-ngsw-build';
  var RELOAD_KEY = 'eventum-ngsw-reload';

  function simpleHash(text) {
    var hash = 0;
    for (var i = 0; i < text.length; i++) {
      hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
    }
    return String(hash);
  }

  function clearNgswAndReload() {
    var tasks = [];

    if ('caches' in window) {
      tasks.push(
        caches.keys().then(function (names) {
          return Promise.all(
            names
              .filter(function (name) {
                return name.indexOf('ngsw:') === 0;
              })
              .map(function (name) {
                return caches.delete(name);
              }),
          );
        }),
      );
    }

    if ('serviceWorker' in navigator) {
      tasks.push(
        navigator.serviceWorker.getRegistrations().then(function (registrations) {
          return Promise.all(
            registrations
              .filter(function (registration) {
                var scriptUrl =
                  (registration.active && registration.active.scriptURL) ||
                  (registration.waiting && registration.waiting.scriptURL) ||
                  (registration.installing && registration.installing.scriptURL) ||
                  '';
                return /ngsw-worker\.js/.test(scriptUrl);
              })
              .map(function (registration) {
                return registration.unregister();
              }),
          );
        }),
      );
    }

    Promise.all(tasks).finally(function () {
      window.location.reload();
    });
  }

  function checkBuild() {
    if (typeof fetch !== 'function') {
      return;
    }

    fetch('/ngsw.json?build-check=' + Date.now(), {
      cache: 'no-store',
      credentials: 'same-origin',
    })
      .then(function (response) {
        if (!response.ok) {
          return null;
        }
        return response.text();
      })
      .then(function (body) {
        if (!body) {
          return;
        }

        var hash = simpleHash(body);
        var previous = localStorage.getItem(BUILD_KEY);

        if (previous && previous !== hash) {
          localStorage.setItem(BUILD_KEY, hash);
          if (sessionStorage.getItem(RELOAD_KEY) === hash) {
            return;
          }
          sessionStorage.setItem(RELOAD_KEY, hash);
          clearNgswAndReload();
          return;
        }

        if (!previous) {
          localStorage.setItem(BUILD_KEY, hash);
        }
      })
      .catch(function () {});
  }

  checkBuild();

  window.addEventListener('pageshow', function (event) {
    if (event.persisted) {
      checkBuild();
    }
  });
})();
