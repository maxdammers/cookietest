/**
 * STQRY Storage Bridge
 * Gebaseerd op: https://github.com/mytours/stqry-api-bridge
 *
 * Implementeert cross-context data synchronisatie via postMessage API
 * in plaats van cookies voor betere betrouwbaarheid en flexibiliteit.
 */

(function(window) {
  'use strict';

  var STORAGE_KEY = 'stqryStorage';
  var appCallbacks = {};
  var lastAppCallbackId = 0;

  /**
   * Detecteer de runtime omgeving
   */
  function detectRuntime() {
    // Check voor React Native WebView
    if (window.ReactNativeWebView) {
      return 'ReactNative';
    }
    // Check of we in een iframe zitten met parent toegang
    if (window.parent && window.parent !== window) {
      try {
        // Test of we toegang hebben tot parent
        if (window.parent.postMessage) {
          return 'IFrame';
        }
      } catch (e) {
        // Cross-origin, gebruik postMessage
        return 'IFrame';
      }
    }
    // Fallback naar localStorage
    return 'NoRuntime';
  }

  window.stqryRuntime = detectRuntime();

  /**
   * Haal opgeslagen data op uit localStorage
   */
  function getStoredData(storageKey) {
    try {
      var stored = localStorage.getItem(storageKey);
      return stored ? JSON.parse(stored) : {};
    } catch (e) {
      console.error('Fout bij ophalen data:', e);
      return {};
    }
  }

  /**
   * Sla data op in localStorage
   */
  function setStoredData(storageKey, value) {
    try {
      localStorage.setItem(storageKey, JSON.stringify(value));
    } catch (e) {
      console.error('Fout bij opslaan data:', e);
    }
  }

  /**
   * Verstuur bericht naar parent/app context
   */
  function callApp(action, data, callback) {
    var message = {
      action: action,
      version: 'v1',
      data: data
    };

    if (callback) {
      lastAppCallbackId++;
      var callbackId = lastAppCallbackId;
      message.callbackId = callbackId;
      appCallbacks[callbackId] = callback;
    }

    if (window.stqryRuntime === 'ReactNative') {
      window.ReactNativeWebView.postMessage(JSON.stringify(message));
    } else if (window.stqryRuntime === 'IFrame') {
      window.parent.postMessage(JSON.stringify(message), '*');
    }
  }

  /**
   * Verwerk inkomende berichten
   */
  function onMessage(e) {
    var message;

    try {
      message = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
    } catch (err) {
      return; // Niet een geldig bericht
    }

    if (!message || !message.action) {
      return;
    }

    // Verwerk callback responses
    if (message.action === 'callback' && message.callbackId) {
      var callback = appCallbacks[message.callbackId];
      if (callback) {
        callback.apply(null, message.args || []);
        delete appCallbacks[message.callbackId];
      }
    }

    // Verwerk storage update broadcasts
    if (message.action === 'storage.updated' && message.data) {
      // Trigger custom event voor andere delen van de app
      var event = new CustomEvent('stqryStorageUpdated', {
        detail: message.data
      });
      window.dispatchEvent(event);
    }
  }

  // Luister naar berichten van parent/app
  window.addEventListener('message', onMessage);
  document.addEventListener('message', onMessage);

  /**
   * STQRY Storage API
   */
  window.stqry = {
    storage: {
      /**
       * Haal een waarde op uit storage
       */
      get: function(key, callback, customKey) {
        var storageKey = customKey || STORAGE_KEY;

        if (window.stqryRuntime === 'NoRuntime') {
          var storedData = getStoredData(storageKey);
          var value = key ? storedData[key] : storedData;
          if (callback) callback(value);
          return value;
        }

        callApp('storage.get', {
          key: key,
          storageKey: storageKey
        }, callback);
      },

      /**
       * Sla waarde(s) op in storage
       */
      set: function(changeset, callback, customKey) {
        var storageKey = customKey || STORAGE_KEY;

        if (window.stqryRuntime === 'NoRuntime') {
          var storedData = getStoredData(storageKey);
          var value = Object.assign(storedData, changeset);
          setStoredData(storageKey, value);

          // Broadcast update naar andere windows/tabs
          this.broadcastUpdate(value);

          if (callback) callback();
          return;
        }

        callApp('storage.set', {
          changeset: changeset,
          storageKey: storageKey
        }, callback);
      },

      /**
       * Verwijder een key uit storage
       */
      remove: function(key, callback, customKey) {
        var storageKey = customKey || STORAGE_KEY;

        if (window.stqryRuntime === 'NoRuntime') {
          var storedData = getStoredData(storageKey);
          delete storedData[key];
          setStoredData(storageKey, storedData);

          // Broadcast update
          this.broadcastUpdate(storedData);

          if (callback) callback();
          return;
        }

        callApp('storage.remove', {
          key: key,
          storageKey: storageKey
        }, callback);
      },

      /**
       * Wis alle storage
       */
      clear: function(callback, customKey) {
        var storageKey = customKey || STORAGE_KEY;

        if (window.stqryRuntime === 'NoRuntime') {
          setStoredData(storageKey, {});
          this.broadcastUpdate({});
          if (callback) callback();
          return;
        }

        callApp('storage.clear', {
          storageKey: storageKey
        }, callback);
      },

      /**
       * Broadcast storage updates naar andere windows/tabs
       */
      broadcastUpdate: function(data) {
        // Gebruik localStorage event voor cross-tab communicatie
        localStorage.setItem('stqryStorageEvent', JSON.stringify({
          timestamp: Date.now(),
          data: data
        }));
      }
    }
  };

  /**
   * Luister naar localStorage events van andere tabs
   */
  window.addEventListener('storage', function(e) {
    if (e.key === 'stqryStorageEvent' && e.newValue) {
      try {
        var eventData = JSON.parse(e.newValue);
        var event = new CustomEvent('stqryStorageUpdated', {
          detail: eventData.data
        });
        window.dispatchEvent(event);
      } catch (err) {
        console.error('Fout bij verwerken storage event:', err);
      }
    }
  });

  console.log('STQRY Bridge geladen. Runtime:', window.stqryRuntime);

})(window);
