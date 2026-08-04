(function () {
  'use strict';

  var BUILD_KEY = 'eventum-ngsw-build';
  var RELOAD_KEY = 'eventum-ngsw-reload';
  var CHECKING = false;

  function isAppleWebKit() {
    var ua = navigator.userAgent || '';
    var isIOS =
      /iPad|iPhone|iPod/.test(ua) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    var isSafari =
      /Safari\//.test(ua) &&
      !/Chrome\//.test(ua) &&
      !/CriOS\//.test(ua) &&
      !/FxiOS\//.test(ua);
    return isIOS || isSafari;
  }

  function isStandalonePwa() {
    return (
      (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
      window.navigator.standalone === true
    );
  }

  function simpleHash(text) {
    var hash = 0;
    for (var i = 0; i < text.length; i++) {
      hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
    }
    return String(hash);
  }

  function readStored(key) {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      try {
        return sessionStorage.getItem(key);
      } catch (e2) {
        return null;
      }
    }
  }

  function writeStored(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      try {
        sessionStorage.setItem(key, value);
      } catch (e2) {}
    }
  }

  function fetchViaXhr(url) {
    return new Promise(function (resolve) {
      try {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.setRequestHeader('Cache-Control', 'no-cache');
        xhr.setRequestHeader('Pragma', 'no-cache');
        xhr.onload = function () {
          resolve(xhr.status >= 200 && xhr.status < 300 ? xhr.responseText : null);
        };
        xhr.onerror = function () {
          resolve(null);
        };
        xhr.send();
      } catch (e) {
        resolve(null);
      }
    });
  }

  function getAppBaseHref() {
    var baseEl = document.querySelector('base');
    var href = (baseEl && baseEl.getAttribute('href')) || '/';
    href = String(href).trim() || '/';
    if (href === '/') {
      return '/';
    }
    if (href.charAt(0) !== '/') {
      href = '/' + href;
    }
    if (href.charAt(href.length - 1) !== '/') {
      href += '/';
    }
    return href;
  }

  function resolveAppAssetUrl(relativePath) {
    var base = getAppBaseHref();
    var path = String(relativePath || '').replace(/^\//, '');
    if (base === '/') {
      return '/' + path;
    }
    return base + path;
  }

  function fetchFreshManifest() {
    var url = resolveAppAssetUrl('ngsw.json') + '?_=' + Date.now();

    if (typeof fetch !== 'function') {
      return fetchViaXhr(url);
    }

    return fetch(url, {
      cache: 'reload',
      credentials: 'same-origin',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
      },
    })
      .then(function (response) {
        if (response.ok) {
          return response.text();
        }
        return fetchViaXhr(url);
      })
      .catch(function () {
        return fetchViaXhr(url);
      });
  }

  function hardReload() {
    try {
      var url = new URL(window.location.href);
      url.searchParams.set('_nc', String(Date.now()));
      window.location.replace(url.toString());
    } catch (e) {
      window.location.reload();
    }
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

    Promise.all(tasks).finally(hardReload);
  }

  function checkBuild() {
    if (CHECKING) {
      return;
    }
    CHECKING = true;

    fetchFreshManifest()
      .then(function (body) {
        if (!body) {
          return;
        }

        var hash = simpleHash(body);
        var previous = readStored(BUILD_KEY);

        if (previous && previous !== hash) {
          writeStored(BUILD_KEY, hash);
          if (readStored(RELOAD_KEY) === hash) {
            return;
          }
          writeStored(RELOAD_KEY, hash);
          clearNgswAndReload();
          return;
        }

        if (!previous) {
          writeStored(BUILD_KEY, hash);
        }
      })
      .catch(function () {})
      .finally(function () {
        CHECKING = false;
      });
  }

  var apple = isAppleWebKit();
  var standalone = isStandalonePwa();
  var intervalMs = standalone ? 20000 : apple ? 30000 : 60000;

  checkBuild();

  window.setInterval(checkBuild, intervalMs);

  window.addEventListener('pageshow', function (event) {
    checkBuild();
    if (event.persisted) {
      window.setTimeout(checkBuild, 500);
    }
  });

  window.addEventListener('focus', checkBuild);

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') {
      checkBuild();
    }
  });

  window.addEventListener('online', checkBuild);
})();
