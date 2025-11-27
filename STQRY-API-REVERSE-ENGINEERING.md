# STQRY WebView API - Reverse Engineering Bevindingen

## Overzicht

Dit document beschrijft de bevindingen van het reverse-engineeren van de STQRY WebView postMessage API.

## Architectuur

```
┌─────────────────────────────────────┐
│     STQRY App (React Native)        │
│  ┌─────────────────────────────┐    │
│  │   WebView Component         │    │
│  │  ┌───────────────────────┐  │    │
│  │  │  Jouw HTML pagina     │  │    │
│  │  │  (page1.html, etc.)   │  │    │
│  │  └───────────────────────┘  │    │
│  └─────────────────────────────┘    │
└─────────────────────────────────────┘
```

**Communicatie:** Via `postMessage` API
- WebView → App: `window.ReactNativeWebView.postMessage(JSON.stringify(message))`
- App → WebView: `window.parent.postMessage(...)` (IFrame mode)

## Runtime Detectie

```javascript
// window.stqryRuntime kan zijn:
- "ReactNative"  // In native app
- "IFrame"       // In iframe/preview
- "MobileWeb"    // Mobile web versie
- "NoRuntime"    // Standalone browser
```

## Message Format

Alle messages volgen dit formaat:

```javascript
{
    action: "namespace.action",
    version: "v1",
    data: { ... },
    callbackId: 123  // optioneel, voor responses
}
```

---

## Werkende Acties

### 1. `navigation.back` ✅

Terug navigeren naar vorige pagina/tour.

```javascript
{
    action: "navigation.back",
    version: "v1",
    data: {}
}
```

**Implementatie:**
```javascript
function goBack() {
    var message = {
        action: 'navigation.back',
        version: 'v1',
        data: {}
    };
    if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify(message));
    } else {
        window.history.back();
    }
}
```

---

### 2. `linking.openExternal` ✅

Open een externe URL in de browser.

```javascript
{
    action: "linking.openExternal",
    version: "v1",
    data: {
        link: "https://example.com"
    }
}
```

**Handler in STQRY code:**
```javascript
if (te === "v1" && H === "linking.openExternal") {
    const {link: _e} = oe;
    d6l(_e) && window.open(_e)  // URL validatie + window.open
}
```

---

### 3. `linking.openInternal` ✅ (Deels werkend)

Open interne STQRY content. **Opent als overlay/modal, niet als navigatie.**

```javascript
{
    action: "linking.openInternal",
    version: "v1",
    data: {
        params: {
            subtype: "tour",  // type content
            id: 57959         // numerieke ID
        }
    }
}
```

**Handler in STQRY code:**
```javascript
if (te === "v1" && H === "linking.openInternal") {
    const {params: _e} = oe;
    db(_e.subtype, Number(_e.id), void 0, () => l(_e))
}
```

**Geteste subtypes:**
| Subtype | Werkt? | Opmerkingen |
|---------|--------|-------------|
| `tour` | ✅ Ja | Opent als overlay/modal, toont tour start scherm |
| `map` | ❌ Nee | Geen reactie |
| `list` | ❓ | Niet getest |
| `story` | ❌ Nee | Geen reactie (voor items) |
| `web` | ❌ Nee | Geen reactie (voor items) |
| `menu` | ❓ | Niet getest |
| `collection` | ❓ | Niet getest |

**Conclusie:** Alleen `subtype: 'tour'` lijkt te werken. Items en kaarten kunnen niet via deze API worden geopend.

**Beperking:** Tours openen altijd als overlay, niet als navigatie. Er is geen manier gevonden om direct naar de kaart of een specifiek item te navigeren.

---

### 4. `storage.set` ✅

Data opslaan in app storage.

```javascript
{
    action: "storage.set",
    version: "v1",
    data: {
        storageKey: "mijn-key",
        changeset: { key1: "value1", key2: "value2" }
    },
    callbackId: 1
}
```

---

### 5. `storage.get` ✅

Data ophalen uit app storage.

```javascript
{
    action: "storage.get",
    version: "v1",
    data: {
        storageKey: "mijn-key",
        keys: ["key1", "key2"]  // optioneel, filter specifieke keys
    },
    callbackId: 2
}
```

---

### 6. `storage.remove` ✅

Data verwijderen uit app storage.

```javascript
{
    action: "storage.remove",
    version: "v1",
    data: {
        storageKey: "mijn-key",
        keys: ["key1"]  // optioneel, specifieke keys of hele storage
    },
    callbackId: 3
}
```

---

## Niet-werkende / Onbekende Acties

### `showScanner` ❌
Interne functie, niet via postMessage aan te roepen.

### `parsePath` ❌
Interne functie voor URL parsing, niet via postMessage.

### `location.set`, `location.back`, `location.close` ❓
Mogelijk custom acties in stqry-bridge.js, niet in officiële API.

---

## Bekende IDs (Test Tour)

Uit `parsePath` console output:

```javascript
{
    collectionAccountId: 17706,
    collectionId: 57959,
    collectionVersion: 1764170288,
    itemId: 395298
}
```

**URL structuur:**
```
/tour/57959/item/395298?demo=true
```

---

## Broncode Locaties

De message handler is gevonden in de geminificeerde STQRY code:

```javascript
// receiveMessage handler
console.log("receiveMessage", V);
const {action: H, version: te, data: oe, callbackId: X} = G;

if (te === "v1" && H === "linking.openInternal") { ... }
else if (te === "v1" && H === "linking.openExternal") { ... }
else if (te === "v1" && H === "storage.set") { ... }
else if (te === "v1" && H === "storage.get") { ... }
else if (te === "v1" && H === "storage.remove") { ... }
else if (te === "v1" && H === "navigation.back") { pn.goBack() }
```

---

## Officiële Bronnen

- GitHub: https://github.com/mytours/react-navigation-core
- Geen publieke documentatie beschikbaar
- Support: https://support.stqry.com

---

## Open Vragen / Verder Onderzoek

1. **Hoe navigeren zonder overlay?** - `linking.openInternal` opent content als modal/overlay. Is er een manier om direct te navigeren?

2. **Wat doet de `version` parameter?** - `collectionVersion: 1764170288` - invloed op caching?

3. **Demo mode parameters** - `?demo=true` en `?show-detail-modal=true` - wat doen deze exact?

4. **Callback responses** - Hoe responses ontvangen van storage acties?

5. **Andere acties?** - Zijn er meer acties die we nog niet gevonden hebben?

---

## Test Pagina

Gebruik `page2.html` om de API te testen:
- https://maxdammers.github.io/cookietest/page2.html

Of in STQRY preview:
- https://25717.preview-us.stqry.es/tour/57959/item/395298?demo=true

---

*Laatst bijgewerkt: 26 november 2025*
