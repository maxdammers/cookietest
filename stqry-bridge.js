/**
 * STQRY Storage Bridge
 * Gebaseerd op: https://github.com/mytours/stqry-api-bridge
 *
 * Implementeert cross-context data synchronisatie via postMessage API
 * in plaats van cookies voor betere betrouwbaarheid en flexibiliteit.
 *
 * Deze bridge ondersteunt drie runtime modes:
 * - NoRuntime: Standalone browser met localStorage + storage events
 * - IFrame: WebView binnen iframe, gebruikt postMessage naar parent
 * - ReactNative: React Native WebView met ReactNativeWebView.postMessage
 */

(function(window) {
  'use strict';

  // Constanten
  var STORAGE_KEY = 'stqryStorage'; // Default key voor localStorage
  var appCallbacks = {}; // Object om callback functies op te slaan per callbackId
  var lastAppCallbackId = 0; // Teller voor unieke callback IDs

  /**
   * Detecteer de runtime omgeving waarin de applicatie draait
   *
   * @returns {string} 'ReactNative', 'IFrame', of 'NoRuntime'
   */
  function detectRuntime() {
    // Check voor React Native WebView omgeving
    // React Native injecteert een ReactNativeWebView object met postMessage functie
    if (window.ReactNativeWebView) {
      return 'ReactNative';
    }

    // Check of we in een iframe zitten met parent toegang
    // window.parent verwijst naar het parent window (of zichzelf als er geen parent is)
    if (window.parent && window.parent !== window) {
      try {
        // Test of we toegang hebben tot parent.postMessage
        // Dit kan falen bij cross-origin iframes
        if (window.parent.postMessage) {
          return 'IFrame';
        }
      } catch (e) {
        // Cross-origin iframe: we hebben geen directe toegang maar postMessage werkt nog steeds
        return 'IFrame';
      }
    }

    // Fallback: standalone browser zonder parent context
    // Gebruik localStorage + storage events voor cross-tab communicatie
    return 'NoRuntime';
  }

  // Detecteer runtime bij laden en sla op in global variable
  window.stqryRuntime = detectRuntime();

  /**
   * Haal opgeslagen data op uit localStorage
   *
   * @param {string} storageKey - De localStorage key om uit te lezen
   * @returns {Object} Parsed JSON object of lege object bij fout
   */
  function getStoredData(storageKey) {
    try {
      var stored = localStorage.getItem(storageKey);
      // Parse JSON string naar object, of return leeg object als er niets is
      return stored ? JSON.parse(stored) : {};
    } catch (e) {
      console.error('Fout bij ophalen data:', e);
      return {};
    }
  }

  /**
   * Sla data op in localStorage als JSON string
   *
   * @param {string} storageKey - De localStorage key om naar te schrijven
   * @param {Object} value - Het object om op te slaan (wordt naar JSON geconverteerd)
   */
  function setStoredData(storageKey, value) {
    try {
      // Converteer object naar JSON string voordat we opslaan
      localStorage.setItem(storageKey, JSON.stringify(value));
    } catch (e) {
      console.error('Fout bij opslaan data:', e);
    }
  }

  /**
   * Verstuur een bericht naar de parent context (iframe parent of React Native)
   * Gebruikt het postMessage protocol voor cross-context communicatie
   *
   * @param {string} action - De actie naam (bijv. 'storage.set', 'storage.get')
   * @param {Object} data - De data payload voor deze actie
   * @param {Function} callback - Optionele callback die wordt aangeroepen met het response
   * @param {Function} fallback - Optionele fallback functie als parent niet reageert
   */
  function callApp(action, data, callback, fallback) {
    // Bouw het message object volgens het STQRY protocol
    var message = {
      action: action,      // De uit te voeren actie
      version: 'v1',       // Protocol versie
      data: data          // Payload data
    };

    // Als er een callback is, genereer een unieke ID en sla de callback op
    if (callback) {
      lastAppCallbackId++;
      var callbackId = lastAppCallbackId;
      message.callbackId = callbackId;
      appCallbacks[callbackId] = callback;

      // Stel timeout in: als parent niet binnen 500ms reageert, gebruik fallback
      if (fallback) {
        setTimeout(function() {
          // Als callback nog steeds bestaat, is er geen response gekomen
          if (appCallbacks[callbackId]) {
            delete appCallbacks[callbackId];
            console.warn('Parent not responding for action:', action, '- using fallback');
            fallback();
          }
        }, 500);
      }
    }

    // Verstuur message via het juiste kanaal afhankelijk van runtime
    if (window.stqryRuntime === 'ReactNative') {
      // React Native: gebruik de geïnjecteerde ReactNativeWebView.postMessage
      window.ReactNativeWebView.postMessage(JSON.stringify(message));
    } else if (window.stqryRuntime === 'IFrame') {
      // IFrame: gebruik window.parent.postMessage
      // '*' als targetOrigin betekent: accepteer alle origins (kan worden beperkt voor security)
      window.parent.postMessage(JSON.stringify(message), '*');
    }
    // Note: in NoRuntime mode roepen we callApp niet aan, alles gebeurt lokaal
  }

  /**
   * Verwerk inkomende berichten van parent context of andere tabs
   * Wordt aangeroepen door de message event listeners
   *
   * @param {MessageEvent} e - Het message event met data property
   */
  function onMessage(e) {
    var message;

    // Parse het bericht (kan JSON string zijn of al een object)
    try {
      message = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
    } catch (err) {
      return; // Niet een geldig JSON bericht, negeer
    }

    // Valideer dat het bericht een action property heeft
    if (!message || !message.action) {
      return;
    }

    // Verwerk callback responses van de parent
    // De parent stuurt een 'callback' action terug met de callbackId en resultaat
    if (message.action === 'callback' && message.callbackId) {
      var callback = appCallbacks[message.callbackId];
      if (callback) {
        // Roep de callback aan met de meegestuurde argumenten
        callback.apply(null, message.args || []);
        // Cleanup: verwijder callback na gebruik (één keer gebruik)
        delete appCallbacks[message.callbackId];
      }
    }

    // Verwerk storage update broadcasts (van parent of andere source)
    if (message.action === 'storage.updated' && message.data) {
      // Trigger een custom DOM event zodat andere delen van de app kunnen luisteren
      var event = new CustomEvent('stqryStorageUpdated', {
        detail: message.data
      });
      window.dispatchEvent(event);
    }
  }

  // Registreer message listeners voor inkomende berichten
  // window.addEventListener vangt postMessage events op van parent/opener
  window.addEventListener('message', onMessage);
  // document.addEventListener is voor React Native compatibility
  document.addEventListener('message', onMessage);

  /**
   * STQRY API - Public interface voor cross-context communicatie
   * Beschikbaar via window.stqry met modules: storage, user, device, language, location
   */
  window.stqry = {
    /**
     * Storage API - Data opslag en synchronisatie
     */
    storage: {
      /**
       * Haal een waarde op uit storage
       *
       * @param {string|null} key - De key om op te halen, of null voor alle data
       * @param {Function} callback - Functie die wordt aangeroepen met de opgehaalde waarde(s)
       * @param {string} customKey - Optionele custom localStorage key (default: 'stqryStorage')
       * @returns {*} De waarde (alleen in NoRuntime mode, anders undefined)
       *
       * @example
       * // Haal één waarde op
       * stqry.storage.get('username', function(value) {
       *   console.log('Username:', value);
       * });
       *
       * // Haal alle data op
       * stqry.storage.get(null, function(allData) {
       *   console.log('Alle data:', allData);
       * });
       */
      get: function(key, callback, customKey) {
        var storageKey = customKey || STORAGE_KEY;

        // In NoRuntime mode: lees direct uit localStorage
        if (window.stqryRuntime === 'NoRuntime') {
          var storedData = getStoredData(storageKey);
          // Als key is null, return alle data, anders alleen die key
          var value = key ? storedData[key] : storedData;
          if (callback) callback(value);
          return value;
        }

        // In IFrame/ReactNative mode: stuur request naar parent via postMessage
        callApp('storage.get', {
          key: key,
          storageKey: storageKey
        }, callback);
      },

      /**
       * Sla één of meerdere waarde(s) op in storage
       *
       * @param {Object} changeset - Object met key-value pairs om op te slaan
       * @param {Function} callback - Optionele functie die wordt aangeroepen na opslaan
       * @param {string} customKey - Optionele custom localStorage key
       *
       * @example
       * stqry.storage.set({
       *   username: 'Max',
       *   theme: 'dark'
       * }, function() {
       *   console.log('Data opgeslagen!');
       * });
       */
      set: function(changeset, callback, customKey) {
        var storageKey = customKey || STORAGE_KEY;

        // In NoRuntime mode: schrijf direct naar localStorage
        if (window.stqryRuntime === 'NoRuntime') {
          var storedData = getStoredData(storageKey);
          // Merge nieuwe data met bestaande data (Object.assign)
          var value = Object.assign(storedData, changeset);
          setStoredData(storageKey, value);

          // Broadcast update naar andere windows/tabs via storage events
          this.broadcastUpdate(value);

          if (callback) callback();
          return;
        }

        // In IFrame/ReactNative mode: stuur request naar parent
        callApp('storage.set', {
          changeset: changeset,
          storageKey: storageKey
        }, callback);
      },

      /**
       * Verwijder een specifieke key uit storage
       *
       * @param {string} key - De key om te verwijderen
       * @param {Function} callback - Optionele functie die wordt aangeroepen na verwijderen
       * @param {string} customKey - Optionele custom localStorage key
       *
       * @example
       * stqry.storage.remove('username', function() {
       *   console.log('Username verwijderd!');
       * });
       */
      remove: function(key, callback, customKey) {
        var storageKey = customKey || STORAGE_KEY;

        // In NoRuntime mode: verwijder direct uit localStorage
        if (window.stqryRuntime === 'NoRuntime') {
          var storedData = getStoredData(storageKey);
          delete storedData[key];
          setStoredData(storageKey, storedData);

          // Broadcast update naar andere tabs
          this.broadcastUpdate(storedData);

          if (callback) callback();
          return;
        }

        // In IFrame/ReactNative mode: stuur request naar parent
        callApp('storage.remove', {
          key: key,
          storageKey: storageKey
        }, callback);
      },

      /**
       * Wis alle storage data
       *
       * @param {Function} callback - Optionele functie die wordt aangeroepen na wissen
       * @param {string} customKey - Optionele custom localStorage key
       *
       * @example
       * stqry.storage.clear(function() {
       *   console.log('Alle data gewist!');
       * });
       */
      clear: function(callback, customKey) {
        var storageKey = customKey || STORAGE_KEY;

        // In NoRuntime mode: wis direct in localStorage
        if (window.stqryRuntime === 'NoRuntime') {
          setStoredData(storageKey, {});
          this.broadcastUpdate({});
          if (callback) callback();
          return;
        }

        // In IFrame/ReactNative mode: stuur request naar parent
        callApp('storage.clear', {
          storageKey: storageKey
        }, callback);
      },

      /**
       * Broadcast storage updates naar andere windows/tabs
       * Gebruikt een speciaal localStorage event mechanisme voor cross-tab communicatie
       *
       * @param {Object} data - De nieuwe data state om te broadcas ten
       * @private
       */
      broadcastUpdate: function(data) {
        // Schrijf naar een speciale event key in localStorage
        // Het storage event wordt gefired in alle andere tabs/windows
        localStorage.setItem('stqryStorageEvent', JSON.stringify({
          timestamp: Date.now(), // Timestamp zorgt dat de waarde altijd verandert
          data: data
        }));
      }
    },

    /**
     * User API - Gebruikers informatie
     * In NoRuntime mode gebruikt het een fallback user object
     */
    user: {
      /**
       * Haal gebruikers informatie op
       *
       * @param {Function} callback - Functie die wordt aangeroepen met user object
       *
       * @example
       * stqry.user.get(function(user) {
       *   console.log('User:', user.name);
       *   console.log('Email:', user.email);
       * });
       */
      get: function(callback) {
        // Helper functie om lokale user data op te halen
        var getLocalUser = function() {
          var storedUser = localStorage.getItem('stqryUser');
          return storedUser ? JSON.parse(storedUser) : {
            id: 'demo-user',
            name: 'Demo User',
            email: 'demo@example.com',
            isGuest: true
          };
        };

        if (window.stqryRuntime === 'NoRuntime') {
          var user = getLocalUser();
          if (callback) callback(user);
          return user;
        }

        // In IFrame/ReactNative mode: probeer parent, fallback naar localStorage
        callApp('user.get', {}, callback, function() {
          // Fallback: gebruik lokale data
          if (callback) callback(getLocalUser());
        });
      },

      /**
       * Sla user informatie op (alleen NoRuntime mode)
       *
       * @param {Object} user - User object om op te slaan
       * @param {Function} callback - Optionele callback
       */
      set: function(user, callback) {
        if (window.stqryRuntime === 'NoRuntime') {
          localStorage.setItem('stqryUser', JSON.stringify(user));
          if (callback) callback();
          return;
        }

        // In andere modes wordt user beheerd door de parent
        console.warn('user.set() is alleen beschikbaar in NoRuntime mode');
        if (callback) callback();
      }
    },

    /**
     * Device API - Device informatie
     */
    device: {
      /**
       * Haal device informatie op
       *
       * @param {Function} callback - Functie die wordt aangeroepen met device info
       *
       * @example
       * stqry.device.get(function(device) {
       *   console.log('Platform:', device.platform);
       *   console.log('OS:', device.os);
       * });
       */
      get: function(callback) {
        // Helper functie om lokale device info te detecteren
        var getLocalDevice = function() {
          return {
            platform: navigator.platform,
            userAgent: navigator.userAgent,
            language: navigator.language,
            online: navigator.onLine,
            screenWidth: window.screen.width,
            screenHeight: window.screen.height,
            windowWidth: window.innerWidth,
            windowHeight: window.innerHeight,
            devicePixelRatio: window.devicePixelRatio || 1,
            touchSupport: 'ontouchstart' in window,
            // Detecteer OS
            os: (function() {
              var ua = navigator.userAgent;
              if (ua.indexOf('Win') !== -1) return 'Windows';
              if (ua.indexOf('Mac') !== -1) return 'MacOS';
              if (ua.indexOf('Linux') !== -1) return 'Linux';
              if (ua.indexOf('Android') !== -1) return 'Android';
              if (ua.indexOf('iOS') !== -1 || ua.indexOf('iPhone') !== -1) return 'iOS';
              return 'Unknown';
            })(),
            // Detecteer browser
            browser: (function() {
              var ua = navigator.userAgent;
              if (ua.indexOf('Firefox') !== -1) return 'Firefox';
              if (ua.indexOf('Chrome') !== -1) return 'Chrome';
              if (ua.indexOf('Safari') !== -1) return 'Safari';
              if (ua.indexOf('Edge') !== -1) return 'Edge';
              return 'Unknown';
            })()
          };
        };

        if (window.stqryRuntime === 'NoRuntime') {
          var device = getLocalDevice();
          if (callback) callback(device);
          return device;
        }

        // In IFrame/ReactNative mode: probeer parent, fallback naar browser detection
        callApp('device.get', {}, callback, function() {
          // Fallback: gebruik browser APIs
          if (callback) callback(getLocalDevice());
        });
      }
    },

    /**
     * Language API - Taal voorkeuren
     */
    language: {
      /**
       * Haal huidige taal op
       *
       * @param {Function} callback - Functie die wordt aangeroepen met taal code
       *
       * @example
       * stqry.language.get(function(lang) {
       *   console.log('Language:', lang); // 'nl', 'en', etc.
       * });
       */
      get: function(callback) {
        // Helper functie om lokale taal op te halen
        var getLocalLanguage = function() {
          var storedLang = localStorage.getItem('stqryLanguage');
          return storedLang || navigator.language.split('-')[0]; // 'nl-NL' -> 'nl'
        };

        if (window.stqryRuntime === 'NoRuntime') {
          var lang = getLocalLanguage();
          if (callback) callback(lang);
          return lang;
        }

        // Probeer parent, fallback naar localStorage/browser
        callApp('language.get', {}, callback, function() {
          if (callback) callback(getLocalLanguage());
        });
      },

      /**
       * Zet de taal
       *
       * @param {string} lang - Taal code (bijv. 'nl', 'en')
       * @param {Function} callback - Optionele callback
       *
       * @example
       * stqry.language.set('en', function() {
       *   console.log('Language set to English');
       * });
       */
      set: function(lang, callback) {
        if (window.stqryRuntime === 'NoRuntime') {
          localStorage.setItem('stqryLanguage', lang);
          // Trigger event voor andere tabs
          var event = new CustomEvent('stqryLanguageChanged', {
            detail: { language: lang }
          });
          window.dispatchEvent(event);
          if (callback) callback();
          return;
        }

        callApp('language.set', { language: lang }, callback);
      }
    },

    /**
     * Location API - Navigatie en locatie
     */
    location: {
      /**
       * Navigeer naar een nieuwe URL of route
       *
       * @param {string} url - URL of route om naar toe te navigeren
       * @param {Function} callback - Optionele callback
       *
       * @example
       * stqry.location.set('/home', function() {
       *   console.log('Navigated to home');
       * });
       */
      set: function(url, callback) {
        if (window.stqryRuntime === 'NoRuntime') {
          // In browser: gewoon navigeren
          window.location.href = url;
          if (callback) callback();
          return;
        }

        // In IFrame/ReactNative: vraag parent om te navigeren
        callApp('location.set', { url: url }, callback);
      },

      /**
       * Ga terug naar vorige pagina
       *
       * @param {Function} callback - Optionele callback
       *
       * @example
       * stqry.location.back();
       */
      back: function(callback) {
        if (window.stqryRuntime === 'NoRuntime') {
          window.history.back();
          if (callback) callback();
          return;
        }

        callApp('location.back', {}, callback);
      },

      /**
       * Sluit de huidige view/webview
       *
       * @param {Function} callback - Optionele callback
       *
       * @example
       * stqry.location.close();
       */
      close: function(callback) {
        if (window.stqryRuntime === 'NoRuntime') {
          // In browser: probeer window te sluiten of ga terug
          window.close();
          // Fallback als window.close() niet werkt
          if (!window.closed) {
            window.history.back();
          }
          if (callback) callback();
          return;
        }

        callApp('location.close', {}, callback);
      },

      /**
       * Haal huidige locatie/route op
       *
       * @param {Function} callback - Functie die wordt aangeroepen met locatie info
       */
      get: function(callback) {
        // Helper functie om lokale location info op te halen
        var getLocalLocation = function() {
          return {
            href: window.location.href,
            pathname: window.location.pathname,
            search: window.location.search,
            hash: window.location.hash,
            host: window.location.host
          };
        };

        if (window.stqryRuntime === 'NoRuntime') {
          var location = getLocalLocation();
          if (callback) callback(location);
          return location;
        }

        // Probeer parent, fallback naar window.location
        callApp('location.get', {}, callback, function() {
          if (callback) callback(getLocalLocation());
        });
      }
    },

    /**
     * Utility functies
     */
    utils: {
      /**
       * Check welke runtime mode actief is
       *
       * @returns {string} 'NoRuntime', 'IFrame', of 'ReactNative'
       */
      getRuntime: function() {
        return window.stqryRuntime;
      },

      /**
       * Check of we in een standalone browser zijn
       *
       * @returns {boolean}
       */
      isStandalone: function() {
        return window.stqryRuntime === 'NoRuntime';
      },

      /**
       * Check of we in een iframe zitten
       *
       * @returns {boolean}
       */
      isIFrame: function() {
        return window.stqryRuntime === 'IFrame';
      },

      /**
       * Check of we in React Native zitten
       *
       * @returns {boolean}
       */
      isReactNative: function() {
        return window.stqryRuntime === 'ReactNative';
      }
    }
  };

  /**
   * Luister naar localStorage events van andere tabs
   * Dit is hoe cross-tab synchronisatie werkt in NoRuntime mode
   *
   * Wanneer een andere tab localStorage.setItem() aanroept, fired dit event
   * in alle andere tabs (maar niet in de tab die de wijziging maakte)
   */
  window.addEventListener('storage', function(e) {
    // Filter op onze speciale event key
    if (e.key === 'stqryStorageEvent' && e.newValue) {
      try {
        var eventData = JSON.parse(e.newValue);
        // Trigger een custom DOM event met de nieuwe data
        // Dit event kan opgevangen worden door applicatie code
        var event = new CustomEvent('stqryStorageUpdated', {
          detail: eventData.data
        });
        window.dispatchEvent(event);
      } catch (err) {
        console.error('Fout bij verwerken storage event:', err);
      }
    }
  });

  // Log runtime mode bij laden voor debugging
  console.log('STQRY Bridge geladen. Runtime:', window.stqryRuntime);

})(window);
