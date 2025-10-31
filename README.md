# STQRY API Bridge - Complete Implementation

Dit project demonstreert een complete implementatie van de **STQRY API Bridge**, gebaseerd op [mytours/stqry-api-bridge](https://github.com/mytours/stqry-api-bridge).

## 🎯 Features

- ✅ **Storage API** - Data persistentie en synchronisatie
- ✅ **User API** - Gebruikers informatie management
- ✅ **Device API** - Device detectie en informatie
- ✅ **Language API** - Meertaligheid ondersteuning
- ✅ **Location API** - Navigatie en locatie management
- ✅ **Utils API** - Utility functies en runtime detectie

## Waarom geen cookies?

Dit project gebruikt **geen cookies** maar een robuustere oplossing gebaseerd op:
- **localStorage** voor data persistentie
- **postMessage API** voor cross-context communicatie (iframes, WebViews)
- **Storage events** voor real-time synchronisatie tussen tabs

## Hoe werkt het?

### 1. STQRY Bridge Library ([stqry-bridge.js](stqry-bridge.js))

De bridge detecteert automatisch de runtime omgeving:
- **NoRuntime**: Standalone browser - gebruikt localStorage + storage events
- **IFrame**: Binnen iframe - gebruikt postMessage naar parent
- **ReactNative**: In React Native WebView - gebruikt ReactNativeWebView.postMessage

### 2. Pagina 1 - Data Opslaan ([page1.html](page1.html))

```javascript
// Sla data op
window.stqry.storage.set({
  testData: "Mijn waarde",
  timestamp: new Date().toISOString()
}, function() {
  console.log('Data opgeslagen!');
});
```

### 3. Pagina 2 - Data Lezen ([page2.html](page2.html))

```javascript
// Lees specifieke key
window.stqry.storage.get('testData', function(value) {
  console.log('Waarde:', value);
});

// Lees alle data
window.stqry.storage.get(null, function(allData) {
  console.log('Alle data:', allData);
});
```

## 📖 Complete API Referentie

### Storage API

#### `stqry.storage.set(changeset, callback, customKey)`

Sla één of meerdere key-value pairs op.

**Parameters:**
- `changeset` (Object): Key-value pairs om op te slaan
- `callback` (Function): Wordt aangeroepen na opslaan
- `customKey` (String, optioneel): Custom storage key (default: 'stqryStorage')

**Voorbeeld:**
```javascript
window.stqry.storage.set({
  username: 'max',
  theme: 'dark'
}, function() {
  console.log('Opgeslagen!');
});
```

### `stqry.storage.get(key, callback, customKey)`

Haal data op uit storage.

**Parameters:**
- `key` (String|null): Specifieke key of `null` voor alle data
- `callback` (Function): Ontvangt de waarde
- `customKey` (String, optioneel): Custom storage key

**Voorbeeld:**
```javascript
// Specifieke key
window.stqry.storage.get('username', function(value) {
  console.log('Username:', value);
});

// Alle data
window.stqry.storage.get(null, function(allData) {
  console.log('Alle data:', allData);
});
```

### `stqry.storage.remove(key, callback, customKey)`

Verwijder een specifieke key.

**Voorbeeld:**
```javascript
window.stqry.storage.remove('username', function() {
  console.log('Verwijderd!');
});
```

### `stqry.storage.clear(callback, customKey)`

Wis alle storage data.

**Voorbeeld:**
```javascript
window.stqry.storage.clear(function() {
  console.log('Alles gewist!');
});
```

## Real-time Synchronisatie

De bridge broadcast automatisch updates naar andere tabs/windows:

```javascript
// Luister naar updates van andere tabs
window.addEventListener('stqryStorageUpdated', function(e) {
  console.log('Data updated:', e.detail);
  // Refresh je UI hier
});
```

## Gebruik

1. Open [page1.html](page1.html) in je browser
2. Voer een waarde in en klik "Data Opslaan"
3. Open [page2.html](page2.html) in dezelfde of een nieuwe tab
4. De data is automatisch beschikbaar en wordt real-time gesynchroniseerd

## Test Real-time Sync

1. Open [page1.html](page1.html) in tab 1
2. Open [page2.html](page2.html) in tab 2
3. Wijzig data in tab 1
4. Zie de update direct verschijnen in tab 2 (binnen 2 seconden)

## Voordelen vs Cookies

✅ **Meer opslag capaciteit** (5-10MB vs 4KB voor cookies)
✅ **Geen HTTP overhead** (cookies worden bij elke request meegestuurd)
✅ **Real-time sync** tussen tabs via storage events
✅ **Betere API** met callbacks en error handling
✅ **Cross-context support** via postMessage (iframes, WebViews)
✅ **Geen expiration complexity** (blijft tot expliciet verwijderd)

---

### User API

#### `stqry.user.get(callback)`

Haal gebruikers informatie op.

```javascript
window.stqry.user.get(function(user) {
  console.log('User:', user.name, user.email);
});
```

#### `stqry.user.set(user, callback)`

Sla user info op (alleen NoRuntime mode).

---

### Device API

#### `stqry.device.get(callback)`

Haal device informatie op (OS, browser, screen size, etc).

```javascript
window.stqry.device.get(function(device) {
  console.log('Device:', device.platform, device.os, device.browser);
});
```

---

### Language API

#### `stqry.language.get(callback)` / `stqry.language.set(lang, callback)`

Beheer taal instellingen.

```javascript
window.stqry.language.set('en', function() {
  console.log('Language changed');
});
```

---

### Location API

#### `stqry.location.get(callback)` / `stqry.location.set(url, callback)`

Beheer navigatie en locatie.

---

### Utils API

Helper functies: `getRuntime()`, `isStandalone()`, `isIFrame()`, `isReactNative()`

## 🎮 Demo Pagina

Bekijk [demo.html](demo.html) voor een complete demonstratie van alle APIs.

## Runtime Detection

De bridge detecteert automatisch de omgeving:

```javascript
console.log(window.stqryRuntime);
// Mogelijke waardes:
// - 'NoRuntime': Standalone browser
// - 'IFrame': Binnen iframe
// - 'ReactNative': React Native WebView
```

## Technische Details

### Cross-Tab Communicatie

In NoRuntime mode gebruikt de bridge:
1. **localStorage** voor data persistentie
2. **storage events** voor cross-tab notificaties
3. **Custom events** voor in-page updates

### PostMessage Protocol

Voor iframe/WebView communicatie:

```javascript
{
  action: 'storage.set',
  version: 'v1',
  data: { changeset: {...}, storageKey: '...' },
  callbackId: 123
}
```

Callback response:
```javascript
{
  action: 'callback',
  callbackId: 123,
  args: [result]
}
```

## Browser Compatibility

- ✅ Chrome/Edge (modern)
- ✅ Firefox (modern)
- ✅ Safari (modern)
- ✅ React Native WebView
- ⚠️ IE11 (requires polyfills)

## Licentie

Gebaseerd op [stqry-api-bridge](https://github.com/mytours/stqry-api-bridge) van MyTours
