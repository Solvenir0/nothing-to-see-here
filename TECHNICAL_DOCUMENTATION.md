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

---

## Feature Roadmap

### 1. CSS Design System ✅
- `client/css/design-system.css` — annotated reference: all tokens, component classes, naming rules, do/don't guide
- `styleguide.html` — dev-only rendered preview of every component; open at `http://localhost:8080/styleguide.html`
- Naming convention: flat utility base + modifier (`.btn`, `.btn-primary`); new tool pages prefix classes (`.calc-`, `.team-`, `.skill-`, `.enemy-`, `.turn-`)

---

### 2. Slug Generation Robustness ✅
- Both `createSlug()` copies (server + client) are **in sync** — identical transformations, verified.
- Fixed CSV typo in `data.js` and `server/utils/idData.js`: missing opening `"` on Pinky Apprentice Sinclair's rarity field, which caused that row to be skipped during parsing.
- `scripts/audit-slugs.js` — run `npm run audit:slugs`; exits 0 if all 157 IDs match an image in `uploads/`. Reports MISSING (slug has no image), ORPHANED (image has no ID), and COLLISION (duplicate slugs).
- Single source of truth: both CSV copies must be kept manually in sync; no bundler in this project, so a shared module is not viable without one. When adding new IDs, update **both** `data.js` (client) and `server/utils/idData.js` (server), then re-run `npm run audit:slugs`.

---

### 3. Robust Identity Database
Expanded ID data model to include skill descriptions, status effects, and level/uptie scaling. **Data to be provided by user.**
- Design the schema first — extend the existing CSV or move to JSON:
  ```js
  {
    id: string,          // slug
    name: string,
    sinner: string,
    rarity: '00'|'000',
    skills: [
      { name, type, basePower, coinCount, coinPower, effects: string[] }
    ],
    passives: [{ name, activation, description }],
    uptieScaling: { 1: {...}, 2: {...}, 3: {...}, 4: {...} }
  }
  ```
- Build a parser/loader that merges the existing CSV (for draft compatibility) with the new JSON data
- Keep the draft system reading from the lean CSV; richer data only loaded in tools that need it
- New file target: `data/ids.json` (or `data/ids/[sinner].json` if per-sinner split is cleaner)

---

### 4. Robust EGO Database + Images
Expanded EGO data model with images and full metadata. **Data to be provided by user.**
- Extend current `egoData` (plain text) to structured JSON:
  ```js
  {
    id: string,
    name: string,
    sinner: string,
    rarity: 'ZAYIN'|'TETH'|'HE'|'WAW'|'ALEPH',
    sinCost: { [sinType]: number },
    skill: { name, basePower, coinCount, coinPower, effects: string[] },
    passive: { name, activation, description },
    imageFile: string    // in uploads/ego/
  }
  ```
- Add `uploads/ego/` directory for EGO portraits
- Update `parseEGOData()` in `rendering/idElements.js` to consume JSON instead of the raw text format
- Update `createEgoElement()` in `egoElements.js` to render images if available

---

### 5. Damage Formula Script
Full implementation of the Limbus Company damage formula. **Reference sheet to be provided by user.**
- New module: `client/js/tools/damageCalc.js`
- Inputs (based on known formula structure):
  - Skill base power, coin count, coin power, heads/tails outcome
  - Attack level vs defense level differential
  - Offense/defense level modifiers
  - Relevant status effects (Burn, Rupture, Bleed stacks etc.)
  - Clash outcome modifier (if applicable)
- Output: final damage value with breakdown by component
- No UI at this stage — pure calculation function, tested independently before wiring to a UI

---

### 6. Enemy Database
Structured database of enemy units for use in the damage calculator and team builder.
- New file: `data/enemies.json`
- Schema:
  ```js
  {
    id: string,
    name: string,
    chapter: string,
    baseDefense: number,
    defenseLevel: number,
    resistances: { [sinType]: 'normal'|'fatal'|'endure'|'ineffective'|'immune' },
    statusImmunities: string[],
    skills: [{ name, basePower, coinCount, effects: string[] }]
  }
  ```
- New module: `client/js/tools/enemyData.js` — loads and indexes enemy data
- UI later: searchable enemy list with filter by chapter/type

---

### 7. Turn Damage Calculator
UI tool that combines the damage formula, ID database, and enemy database to calculate single-turn damage output.
- New page: `tools/damage-calculator.html` (or a new view within the existing SPA)
- Inputs:
  - Select attacking ID + skill slot
  - Select target enemy
  - Set coin results (heads/tails per coin)
  - Set active status effects on attacker and target
  - Set passive activations (see #10)
- Output: damage number with formula breakdown
- **Prerequisite**: items 3, 5, 6 must be complete

---

### 8. Skill Bag Counter
Each ID contributes a fixed number of skills to the cycle skill pool. This tool counts available skills for a selected team.
- Input: a roster of up to 4 IDs (team for a node)
- Output: total skill count per cycle, broken down by sin affinity and type (attack/defense/special)
- Data needed: skill counts per ID per uptie level (part of item 3's schema)
- New module: `client/js/tools/skillBag.js`
- Compact UI — likely a panel within the team builder (item 9)

---

### 9. Comprehensive Team Builder
Tool for constructing and evaluating a 4-ID team (node lineup) beyond roster selection.
- Builds on the existing Roster Builder page — add a "Team" mode
- Features:
  - Select 4 IDs from a roster or the full pool
  - Display aggregated sin affinity spread (for passive activation thresholds)
  - Display skill bag count (item 8)
  - Show support passives that activate given the team's affinity spread (item 10)
  - Show damage estimates against a selected enemy (item 7)
- New module: `client/js/tools/teamBuilder.js`
- New rendering: `client/js/rendering/teamBuilderView.js`

---

### 10. Support Passive Activation Boxes
Visual tool showing which support passives activate based on the sin affinities present in a team.
- Each ID has support passives with activation conditions (e.g. "3 Wrath skill slots in your team")
- Component: checklist/grid of all support passives for the IDs in the current team, each marked active/inactive based on the team's affinity counts
- Embedded within the team builder (item 9) as a collapsible panel
- Data needed: passive activation conditions from the ID database (item 3)
- New module: `client/js/tools/passiveActivation.js`

---

### 11. Turn State Screen
Extension of the turn damage calculator — a full turn state input panel that captures all active combat states before calculating damage.
- Inputs:
  - All attacker buffs: Poise, Charge, Burn, Bleed, Rupture, Tremor, Sinking, Discard stacks, etc.
  - All target debuffs and their stack counts
  - Clash context (clashing vs unopposed)
  - Coin probability modifier (e.g. Sanity level affecting heads chance)
  - Any on-hit triggered effects
- Output feeds directly into the damage formula (item 5) and displays per-hit and total damage
- **Prerequisite**: item 7 (turn damage calculator) must be wired first; this expands it

---

### Implementation Order (suggested)
1. **CSS design system** — no data dependency, unblocks all future UI work
2. **Slug audit script** — quick win, fixes existing broken images
3. **ID database schema + parser** — foundation for items 7–11
4. **EGO database** — parallel to #3, same pattern
5. **Damage formula** — pure logic, no UI needed yet
6. **Enemy database** — data entry, then skill bag + team builder can start
7. **Skill bag counter** — small, embeds in team builder
8. **Team builder** — wires #3, #8, #10 together
9. **Turn damage calculator** — wires #3, #5, #6
10. **Turn state screen** — expands #9



