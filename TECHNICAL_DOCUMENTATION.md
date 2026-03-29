# Limbus Company Draft Hub — Agent Reference

Real-time multiplayer drafting app for Limbus Company tournaments.  
**Stack**: Node.js + Express + `ws` (CommonJS) / Vanilla JS ES Modules (no bundler) / HTML+CSS.  
**Entry points**: `server.js` (backend) → `client/js/handlers/main.js` (frontend via `<script type="module">`).

---

## File Map

### Root
| File | Lines | Purpose |
|------|-------|---------|
| `server.js` | 29 | Entry point — mounts Express + WebSocket, delegates to `router.js` |
| `data.js` | 383 | ES module — exports `koreanEgoNames`, `koreanSinnerNames`, `idCsvData`, `egoData` |
| `index.html` | ~390 | Static shell — no inline JS/CSS; all scripts via `<script type="module">` |

### Server (`server/`) — CommonJS
| File | Lines | Exports |
|------|-------|---------|
| `config/draftLogic.js` | 75 | `TIMERS`, `DRAFT_LOGIC` |
| `utils/logger.js` | 20 | `logInfo(category, msg, data?)`, `logError(category, msg, err?)` |
| `utils/sanitize.js` | 28 | `sanitize(text)`, `sanitizePlayerName(name)` |
| `utils/rateLimit.js` | 8 | `rateLimit(ip)`, rate limit constants |
| `utils/idData.js` | 203 | `allIds` (string[]), `createSlug(name)` |
| `store.js` | 9 | `lobbies` (Map), `lobbyTimers` (Map), `VALID_ROLES` |
| `lobby/validation.js` | 62 | `validateLobbyExists`, `validatePlayerRole`, `validatePlayerAccess`, `validatePlayerNotReady`, `validateRefereeAccess`, `validateRoster(roster, size)` |
| `lobby/manager.js` | 109 | `init(wss, WebSocket)`, `broadcastState(lobbyCode, lobbyData)`, `getParticipantByWs(ws)` |
| `handlers/draftHandlers.js` | 301 | `handleTimer`, `advancePhase`, `computeBanPools`, `handleDraftConfirm`, `setTimerForLobby` |
| `handlers/router.js` | 340 | `init(wss, crypto)`, `startCleanupJob()` — all WebSocket message routing |

### Client JS (`client/js/`) — ES Modules
| File | Lines | Exports |
|------|-------|---------|
| `config.js` | 55 | `SINNER_ORDER`, `zayinBanExceptions`, `TIMING`, `GAME_CONFIG`, `loadKoreanModeFromStorage()`, `saveKoreanModeToStorage(val)` |
| `state.js` | 73 | `state` (mutable singleton), `elements` (mutable DOM cache object) |
| `utils/core.js` | 73 | `showNotification(text, isError?)`, `showSideChangeNotification(old, new)`, `createSlug(name)`, `getReserveTimeElement(role)`, `getSliderElements(sinner)`, `getTooltipElement()`, `clearDynamicElementCache()` |
| `utils/keepAlive.js` | 39 | `init(sendMessage)`, `startKeepAlive()`, `stopKeepAlive()`, `shouldSendKeepAlive()` |
| `utils/validation.js` | 46 | `validateAndTrimInput(val, fieldName)`, `validateRosterSize(roster, size, action)`, `validateRosterCodeSize(code, size)`, `validateUserPermission(userRole, targetPlayer)` |
| `utils/debounce.js` | 10 | `createDebounceFunction(fn, delay)` |
| `utils/storage.js` | 48 | `generateRosterCode()`, `loadRosterFromCode(code)` |
| `rendering/navigation.js` | 132 | `switchView(viewName)`, `refreshInterfaceBasedOnGameState()`, `updateRosterPhaseReadyButtonState()` |
| `rendering/idElements.js` | 218 | `parseIDCSV(csv)`, `parseEGOData(raw)`, `createIdElement(id, opts)`, `renderIDList(container, ids, opts)`, `renderGroupedView(container, ids, opts)`, `filterIDs(ids, filters, opts?)`, `sortIdsByMasterList(ids)` |
| `rendering/egoElements.js` | 73 | `getEgoDisplayName(egoData)`, `createEgoElement(egoData, opts)`, `renderBannedEgosDisplay()` |
| `rendering/sound.js` | 101 | `playCountdownSound()`, `playTurnNotificationSound()`, `playBeep(freq, dur)`, `playTurnBeep()` |
| `rendering/rosterPhase.js` | 192 | `init(sendMessage)`, `filterAndRenderRosterSelection()`, `renderEgoBanPhase()`, `showRoleSelectionModal(lobby)`, `createFilterBarHTML(opts?)` |
| `rendering/draftPhase.js` | 267 | `init(sendMessage)`, `updateDraftUI()`, `updateDraftInstructions()`, `displayCoinFlipResultAndChoices(data)`, `updateTimerUI(timer, draft)` |
| `rendering/rosterBuilder.js` | 190 | `init(toggleBuilderIdSelection)`, `renderRosterBuilder()`, `setupAdvancedRandomUI()`, `generateAdvancedRandomRoster()` |
| `rendering/completedView.js` | 144 | `renderCompletedView()`, `renderTimelineView()` |
| `handlers/actions.js` | 47 | `init(sendMessage)`, `toggleIDSelection(player, id)`, `setPlayerRoster(player, roster)`, `hoverEgoToBan(egoId)`, `hoverDraftID(id)`, `confirmDraftAction(type)`, `toggleBuilderIdSelection(id)` |
| `handlers/stateHandlers.js` | 152 | `connectWebSocket()`, `sendMessage(msg)`, `handleServerMessage(msg)`, `handleLobbyCreated(msg)`, `handleLobbyJoined(msg)`, `handleStateUpdate(msg)`, `rejoinTimeout` (let) |
| `handlers/eventHandlers.js` | 621 | `cacheDOMElements()`, `setupFilterBar(barId, filterStateObj)`, `setupEventListeners()` + re-exports `setupAdvancedRandomUI`, `generateAdvancedRandomRoster`, `createFilterBarHTML` |
| `handlers/main.js` | 73 | App entry — `DOMContentLoaded` handler; calls all `init()` injections then boots app |

### Client CSS (`client/css/`)
`variables.css` · `base.css` · `buttons.css` · `forms.css` · `connection.css` · `main-page.css` · `roster-phase.css` · `id-items.css` · `ego-ban.css` · `draft-phase.css` · `roster-builder.css` · `completed-view.css` · `modals.css` · `responsive.css`

---

## Key Patterns

### `init()` Dependency Injection
Used to break circular imports. Modules that need `sendMessage` or callbacks expose `init(fn)` and store it internally:
```js
// e.g. actions.js, rosterPhase.js, draftPhase.js, keepAlive.js
let _sendMessage = null;
export function init(sendMessage) { _sendMessage = sendMessage; }
```
All `init()` calls happen in `main.js` before any events fire:
```js
initKeepAlive(sendMessage);
initActions(sendMessage);
initRosterPhase(sendMessage);
initDraftPhase(sendMessage);
initRosterBuilder(toggleBuilderIdSelection); // rosterBuilder needs this callback
```

### State + Elements Singletons
`state` and `elements` are exported mutable objects from `state.js`. Every module mutates them directly — no setters. `cacheDOMElements()` in `eventHandlers.js` populates `elements` by assigning `document.getElementById(...)` results.

### Module System
- **Server**: CommonJS only — `require()` / `module.exports`
- **Client**: Native ES Modules — no build step. Express serves `.js` with correct MIME type automatically.

---

## Data Shapes

### Lobby (server `lobbies` Map value)
```js
{
  hostName: string,
  createdAt: string,         // ISO
  lastActivity: string,      // ISO — updated on every message; used for TTL cleanup
  participants: {
    p1: { name, status, ready, rejoinToken, reserveTime },
    p2: { name, status, ready, rejoinToken, reserveTime },
    ref: { name, status, rejoinToken }
  },
  roster: { p1: string[], p2: string[] },   // ID slugs
  draft: {
    phase: 'roster'|'coinFlip'|'egoBan'|'ban'|'pick'|'midBan'|'pick2'|'complete',
    step: number,
    currentPlayer: 'p1'|'p2'|'',
    action: string,
    actionCount: number,
    available: { p1: string[], p2: string[] },
    idBans:  { p1: string[], p2: string[] },
    egoBans: { p1: string[], p2: string[] },
    picks:   { p1: string[], p2: string[] },
    picks_s2:{ p1: string[], p2: string[] },
    hovered: { p1: string|null, p2: string|null },
    banPools:{ p1: string[], p2: string[] },
    draftLogic: '1-2-2'|'2-3-2'|'2-3-2-less-bans',
    matchType: 'section1'|'allSections',
    rosterSize: 42|52|72,
    egoBanSteps: number,
    coinFlipWinner: string|null,
    turnOrderDecided: boolean,
    timer: { enabled, running, paused, endTime, pauseTime, isReserve, reserveStartTime }
  }
}
```

### ID Object (parsed from `idCsvData`)
```js
{ id: string, name: string, keywords: string[], sinAffinities: string[], rarity: '00'|'000', imageFile: string, sinner: string }
```

### EGO Object (parsed from `egoData`)
```js
{ id: string, name: string, sinner: string, rarity: 'ZAYIN'|'TETH'|'HE'|'WAW'|'ALEPH', sinAffinity: string, cssColor: string }
```

---

## WebSocket Protocol

### Client → Server
```js
{ type: 'createLobby', options: { name, draftLogic, matchType, timerEnabled, rosterSize } }
{ type: 'joinLobby',   lobbyCode, role, name }
{ type: 'rejoinLobby', lobbyCode, role, rejoinToken }
{ type: 'getLobbyInfo',lobbyCode }
{ type: 'rosterSelect',lobbyCode, player, id }
{ type: 'rosterSet',   lobbyCode, player, roster }
{ type: 'rosterRandomize', lobbyCode, player }
{ type: 'updateReady', lobbyCode, player }
{ type: 'startCoinFlip',   lobbyCode }
{ type: 'setTurnOrder',    lobbyCode, choice: 'first'|'second' }
{ type: 'draftHover',  lobbyCode, payload: { id, type: 'id'|'ego' } }
{ type: 'draftConfirm',lobbyCode, payload: { type: 'id'|'ego' } }
{ type: 'draftControl',lobbyCode, action: 'confirmEgoBans'|'complete', payload? }
{ type: 'timerControl',lobbyCode, action: 'togglePause' }
{ type: 'keepAlive',   lobbyCode }
```

### Server → Client
```js
{ type: 'lobbyCreated', code, role, rejoinToken, state }
{ type: 'lobbyJoined',  lobbyCode, role, rejoinToken, state }
{ type: 'stateUpdate',  state: lobbyData, newRole?: string }
{ type: 'lobbyInfo',    lobby }
{ type: 'notification', text }
{ type: 'error',        message }
{ type: 'keepAliveAck' }
```

---

## Draft Logic

### Phase Order
`roster` → coin flip → `egoBan` (5 per player) → `ban` → `pick` → `midBan` → `pick2` → `complete`

For `allSections`: same order, `midBanSteps` = 8, `pick2` extended with 12 extra picks per player.

### Format Shapes (`DRAFT_LOGIC` in `server/config/draftLogic.js`)
```js
'1-2-2': { ban1Steps: 8, pick1: [{p, c}, ...], midBanSteps: 6, pick2: [{p, c}, ...] }
'2-3-2': { ban1Steps: 8, pick1: [{p, c}, ...], midBanSteps: 6, pick2: [{p, c}, ...] }
'2-3-2-less-bans': { ... }
// Extended variants: '1-2-2-extended', '2-3-2-extended'
```
`advancePhase(lobbyData)` in `draftHandlers.js` drives transitions; `computeBanPools(lobbyData)` recalculates ban eligibility after each action.

### Timers (`TIMERS` in `server/config/draftLogic.js`)
| Phase | Duration |
|-------|----------|
| Roster | 90 s |
| EGO ban | 90 s per player |
| Pick/ban | 15 s per `actionCount` |
| Reserve | 120 s per player (activates after main timer expires) |

Keep-alive: client sends `keepAlive` every 4 min while in active draft phases; server responds with `keepAliveAck` and bumps `lastActivity`.

---

## Security Notes
- Input sanitized via `sanitizePlayerName` (16-char limit, control-char strip, HTML entity encode)  
- Rate limited: 10 lobby creations / min / IP (sliding window, in-memory)  
- All draft actions authorization-checked before execution (`validatePlayerAccess`, `validateRefereeAccess`)
- Roster validated server-side: correct size, all IDs known, no duplicates

---

## Known TODOs
- **Image assets**: Some ID portraits in `uploads/` are missing or have slug mismatches — audit `allIds` against actual files
- **Shared ID data**: `idCsvData` exists in `data.js` (client) and is separately mirrored server-side in `idData.js`; long-term these should share a single `ids.csv`
- `client/js/handlers/eventHandlers.js` is 621 lines — only file above the 400-line target; candidate for splitting if it grows further


