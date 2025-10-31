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
   */
  function callApp(action, data, callback) {
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
   * STQRY Storage API - Public interface voor data opslag en ophalen
   * Beschikbaar via window.stqry.storage
   */
  window.stqry = {
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
