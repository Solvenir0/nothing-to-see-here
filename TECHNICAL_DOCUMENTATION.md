# Limbus Company Draft Hub - Technical Documentation

## Overview

This is a real-time multiplayer drafting application for Limbus Company tournaments. It supports multiple draft formats, timer management, EGO/ID banning and picking phases, and includes comprehensive roster management features.

**Key Technologies:**
- **Backend**: Node.js with Express and WebSocket (ws library)
- **Frontend**: Vanilla JavaScript with HTML/CSS
- **Data Storage**: In-memory (no database)
- **Real-time Communication**: WebSocket connections

---

## Architecture Overview

### File Structure
```
├── server.js          # Main backend server with WebSocket handling
├── script.js          # Frontend JavaScript logic
├── index.html         # Main HTML structure
├── style.css          # Styling
├── data.js            # ID and EGO data definitions
├── package.json       # Node.js dependencies
└── uploads/           # Image assets for IDs
```

### Core Components

1. **Server (server.js)**: WebSocket server handling lobbies, draft logic, and timer management
2. **Client (script.js)**: Frontend state management and UI interactions
3. **Data Layer (data.js)**: CSV-based ID and EGO definitions
4. **Assets (uploads/)**: Character portraits for visual representation

---

## Data Models

### Lobby State Structure
```javascript
{
  hostName: string,                    // Lobby creator's name
  createdAt: string,                   // ISO timestamp
  lastActivity: string,                // ISO timestamp for cleanup
  participants: {
    p1: { name, status, ready, rejoinToken, reserveTime },
    p2: { name, status, ready, rejoinToken, reserveTime },
    ref: { name, status, rejoinToken }
  },
  roster: { p1: [], p2: [] },         // Selected IDs for each player
  draft: {
    phase: string,                     // Current draft phase
    step: number,                      // Step within current phase
    currentPlayer: string,             // "p1", "p2", or ""
    action: string,                    // Current action type
    actionCount: number,               // Remaining actions for current player
    available: { p1: [], p2: [] },     // Available IDs for picking
    idBans: { p1: [], p2: [] },        // Banned IDs
    egoBans: { p1: [], p2: [] },       // Banned EGOs
    picks: { p1: [], p2: [] },         // Phase 1 picks
    picks_s2: { p1: [], p2: [] },      // Phase 2 picks (for multi-section)
    hovered: { p1: null, p2: null },   // Currently hovered selections
    banPools: { p1: [], p2: [] },      // Computed bannable IDs
    draftLogic: string,                // "1-2-2" or "2-3-2"
    matchType: string,                 // "section1" or "allSections"
    rosterSize: number,                // 42 for section1, 72 for allSections
    coinFlipWinner: string,            // Result of coin flip
    timer: {
      enabled: boolean,
      running: boolean,
      paused: boolean,
      endTime: number,                 // Unix timestamp
      pauseTime: number,               // Remaining time when paused
      isReserve: boolean,              // Using reserve time?
      reserveStartTime: number         // When reserve time started
    }
  }
}
```

### ID Data Structure
```javascript
{
  id: string,              // Slug version of name for file references
  name: string,            // Full display name
  keywords: string[],      // Gameplay keywords (Bleed, Burn, etc.)
  sinAffinities: string[], // Sin types (Pride, Wrath, etc.)
  rarity: string,          // "00" or "000"
  imageFile: string,       // Filename in uploads/ directory
  sinner: string           // Character name
}
```

---

## Draft Logic System

### Draft Formats

The application supports two main draft formats with variations:

#### 1-2-2 Format (Standard)
```javascript
{
  ban1Steps: 8,           // Initial ID ban phase (4 bans each, alternating)
  pick1: [                // First pick phase (6 IDs each)
    { p: 'p1', c: 1 }, { p: 'p2', c: 2 }, { p: 'p1', c: 2 }, 
    { p: 'p2', c: 2 }, { p: 'p1', c: 2 }, { p: 'p2', c: 2 }, 
    { p: 'p1', c: 1 }
  ],
  midBanSteps: 6,         // Mid-draft ban phase (3 bans each, alternating)
  pick2: [                // Second pick phase (6 IDs each, p2 starts)
    { p: 'p2', c: 1 }, { p: 'p1', c: 2 }, { p: 'p2', c: 2 }, 
    { p: 'p1', c: 2 }, { p: 'p2', c: 2 }, { p: 'p1', c: 2 }, 
    { p: 'p2', c: 1 }
  ]
}
```

#### 2-3-2 Format (Alternative)
```javascript
{
  ban1Steps: 8,           // Same initial ban phase
  pick1: [                // Different pick pattern (5 picks each)
    { p: 'p1', c: 2 }, { p: 'p2', c: 3 }, { p: 'p1', c: 2 }, 
    { p: 'p2', c: 3 }, { p: 'p1', c: 2 }
  ],
  midBanSteps: 6,         // Same mid-ban phase
  pick2: [                // Second pick phase (5 picks each)
    { p: 'p2', c: 2 }, { p: 'p1', c: 3 }, { p: 'p2', c: 2 }, 
    { p: 'p1', c: 3 }, { p: 'p2', c: 2 }
  ]
}
```

#### Extended Formats (All Sections)
For "All Sections" matches, both formats have `-extended` variants with:
- Increased `midBanSteps` to 8 (4 bans each instead of 3)
- Extended `pick2` phase with 12 additional picks each (totaling 18 per player)

### Draft Phase Flow

1. **Roster Selection**: Players build rosters of 42 or 72 IDs
2. **Coin Flip**: Determines turn order
3. **EGO Ban Phase**: Each player bans 5 EGOs (90s timer each)
4. **ID Ban Phase**: Alternating bans following `ban1Steps` pattern
5. **Pick Phase 1**: First set of ID picks following `pick1` pattern
6. **Mid-Ban Phase**: Additional bans following `midBanSteps` pattern
7. **Pick Phase 2**: Final ID picks following `pick2` pattern
8. **Complete**: Draft finished

### Phase Advancement Logic

The `advancePhase()` function handles transitions:

```javascript
function advancePhase(lobbyData) {
  const { draft } = lobbyData;
  const logicKey = draft.matchType === 'allSections' 
    ? `${draft.draftLogic}-extended` 
    : draft.draftLogic;
  const logic = DRAFT_LOGIC[logicKey];

  switch (draft.phase) {
    case "egoBan":
      // Switch between p1 and p2, then move to ban phase
    case "ban":
      // Follow ban1Steps pattern, then move to pick1
    case "pick":
      // Follow pick1 pattern, then move to midBan
    case "midBan":
      // Follow midBanSteps pattern, then move to pick2
    case "pick2":
      // Follow pick2 pattern, then complete
  }
}
```

---

## Timer System

### Timer Types

1. **Roster Timer**: 90 seconds for roster building
2. **EGO Ban Timer**: 90 seconds per player for EGO bans
3. **Draft Timer**: 15 seconds per action count during picks/bans

### Reserve Time System

Each player starts with 120 seconds of reserve time:
- When main timer expires, reserve time activates automatically
- Reserve time countdown is precise to the second
- Once reserve time is exhausted, turns are auto-skipped
- Reserve time is consumed only when actually used

### Timer Implementation

```javascript
function handleTimer(lobbyCode) {
  // Check if reserve time should activate
  if (participant.reserveTime > 0 && !draft.timer.isReserve) {
    draft.timer.isReserve = true;
    draft.timer.reserveStartTime = Date.now();
    // Set new timeout for reserve duration
  }
  
  // If timer fully expires
  if (hovered[currentPlayer]) {
    // Auto-confirm hovered selection
    handleDraftConfirm(lobbyCode, lobbyData, null);
  } else {
    // Skip turn by advancing phase
    advancePhase(lobbyData);
  }
}
```

### Timer Control (Referee Only)

Referees can pause/unpause timers:
- Pausing saves remaining time
- Unpausing restores saved time and resumes countdown
- Pause state is synchronized across all clients

---

## WebSocket Communication

### Message Types

#### Client → Server
```javascript
// Lobby Management
{ type: 'createLobby', options: { draftLogic, timerEnabled, matchType, rosterSize } }
{ type: 'joinLobby', lobbyCode, role, name }
{ type: 'rejoinLobby', lobbyCode, role, rejoinToken }

// Roster Management
{ type: 'rosterSelect', lobbyCode, player, id }
{ type: 'rosterSet', lobbyCode, player, roster }
{ type: 'rosterRandomize', lobbyCode, player }
{ type: 'updateReady', lobbyCode, player }

// Draft Actions
{ type: 'startCoinFlip', lobbyCode }
{ type: 'setTurnOrder', lobbyCode, choice }
{ type: 'draftHover', lobbyCode, payload: { id } }
{ type: 'draftConfirm', lobbyCode }

// Referee Controls
{ type: 'draftControl', lobbyCode, action, payload }
{ type: 'timerControl', lobbyCode }

// Keep-Alive (prevents hosting service sleep)
{ type: 'keepAlive', lobbyCode }
```

#### Server → Client
```javascript
// State Updates
{ type: 'stateUpdate', state: lobbyData, newRole?: string }

// Responses
{ type: 'lobbyCreated', code, role, rejoinToken, state }
{ type: 'lobbyJoined', lobbyCode, role, rejoinToken, state }
{ type: 'error', message }

// Keep-Alive Acknowledgment
{ type: 'keepAliveAck' }
```

### Connection Management

- **Rejoin Tokens**: UUIDs for session persistence
- **Connection Status**: Tracked per participant
- **Role Swapping**: Handled during coin flip resolution
- **Cleanup**: Automatic lobby cleanup after 2 hours of inactivity

---

## Security & Hardening

### Input Sanitization
```javascript
function sanitize(text) {
  return text.toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
```

### Rate Limiting
- 10 lobby creations per minute per IP
- Sliding window implementation
- Memory-based tracking

### Authorization Checks
```javascript
function isAuthorized(ws, targetRole) {
  return ws && (ws.userRole === 'ref' || ws.userRole === targetRole);
}
```

### Data Validation
- Roster size validation
- ID existence validation
- Action count verification
- Phase-appropriate action validation

---

## Frontend State Management

### Global State Object
```javascript
const state = {
  currentView: string,        // UI view state
  lobbyCode: string,          // Current lobby
  userId: string,             // Generated client ID
  userRole: string,           // "p1", "p2", or "ref"
  rejoinToken: string,        // Session persistence
  participants: object,       // Participant info
  roster: object,             // Roster data
  draft: object,              // Draft state mirror
  filters: object,            // UI filter states
  socket: WebSocket           // Connection
}
```

### View Management
- **Main Page**: Lobby creation/joining
- **Builder**: Roster construction tool
- **Lobby**: Pre-draft lobby view
- **Draft**: Active draft interface
- **Summary**: Post-draft results

### UI Updates
- Real-time state synchronization via WebSocket
- Optimistic updates for user actions
- Error handling and rollback capabilities

---

## Roster System

### Roster Builder
- CSV-based ID database with ~170 identities
- Filter by Sinner, Sin Affinity, Keywords
- Visual grid with character portraits
- Drag-and-drop roster management
- Import/export via base64-encoded roster codes

### Roster Validation
```javascript
function validateRoster(roster, rosterSize) {
  const sizeOk = roster.length === rosterSize;
  const uniqueOk = new Set(roster).size === roster.length;
  const idsOk = roster.every(id => allIds.includes(id));
  return sizeOk && uniqueOk && idsOk;
}
```

### Dynamic Roster Management
- Real-time roster updates
- Ready state tracking
- Random roster generation
- Clear/reset functionality

---

## Ban Pool System

### Dynamic Ban Pool Computation
```javascript
function computeBanPools(lobbyData) {
  const banned = new Set([...draft.idBans.p1, ...draft.idBans.p2]);
  const pools = { p1: [], p2: [] };
  
  ['p1','p2'].forEach(player => {
    const opponent = player === 'p1' ? 'p2' : 'p1';
    const blocked = new Set([
      ...banned,                    // Already banned IDs
      ...draft.picks[opponent],     // Opponent's picks
      ...draft.picks_s2[opponent]   // Opponent's section 2 picks
    ]);
    pools[player] = (roster[opponent] || [])
      .filter(id => !blocked.has(id));
  });
  
  draft.banPools = pools;
}
```

### Ban Validation
- Bans target opponent's roster only
- Can't ban already-picked IDs
- Can't ban already-banned IDs
- Real-time pool updates after each action

---

## Error Handling & Edge Cases

### Connection Issues
- Automatic reconnection attempts
- Session restoration via rejoin tokens
- Graceful degradation during disconnects
- Connection status indicators

### Timer Edge Cases
- Timer expiration during network issues
- Reserve time precision handling
- Pause/unpause synchronization
- Background process cleanup

### Draft Validation
- Phase-appropriate actions only
- Turn order enforcement
- Action count validation
- ID availability checking

### Data Integrity
- Roster size enforcement
- Unique ID validation
- State consistency checks
- Rollback capabilities

---

## Performance Considerations

### Memory Management
- In-memory lobby storage with TTL cleanup
- Periodic inactive lobby removal (30-minute intervals)
- WebSocket connection pooling
- Timer cleanup on lobby destruction

### Network Optimization
- Minimal message payloads
- State diff broadcasting
- Connection keep-alive
- Efficient JSON serialization
- **Keep-alive system**: Prevents hosting service sleep during active drafts

### Client-Side Optimization
- Virtual scrolling for large ID lists
- Debounced filter updates
- Lazy image loading
- DOM reuse patterns

---

## Keep-Alive System

### Purpose
Prevents hosting services (like Render's free tier) from going to sleep during active drafts by sending periodic activity signals.

### Implementation

**Client-Side (script.js)**:
```javascript
function startKeepAlive() {
  // Sends keep-alive every 4 minutes during active draft phases
  state.keepAliveInterval = setInterval(() => {
    if (shouldSendKeepAlive()) {
      sendMessage({ type: 'keepAlive', lobbyCode: state.lobbyCode });
    }
  }, 4 * 60 * 1000);
}

function shouldSendKeepAlive() {
  const activeDraftPhases = ['coinFlip', 'egoBan', 'ban', 'pick', 'midBan', 'pick2', 'pick_s2'];
  return activeDraftPhases.includes(state.draft.phase);
}
```

**Server-Side (server.js)**:
```javascript
case 'keepAlive': {
  if (!lobbyData) return;
  updateLobbyActivity(lobbyCode);
  ws.send(JSON.stringify({ type: 'keepAliveAck' }));
  break;
}
```

### Lifecycle
- **Started**: When joining a lobby (`handleLobbyJoined`)
- **Active**: Only during draft phases (not during roster building)
- **Stopped**: When leaving lobby, disconnecting, or connection lost
- **Frequency**: Every 4 minutes (well under typical 15-minute sleep thresholds)

### Message Flow
1. Client checks if in active draft phase
2. If active, sends `keepAlive` message with lobby code
3. Server updates lobby activity timestamp
4. Server responds with `keepAliveAck` confirmation
5. Process repeats every 4 minutes

---

## Deployment Notes

### Environment Requirements
- Node.js 18.x or 20.x
- WebSocket support
- Static file serving capability
- Process.env.PORT support for hosting platforms

### Configuration
```javascript
const TIMERS = {
  roster: 90,        // Roster selection timer
  egoBan: 90,        // EGO ban timer per player
  pick: 15           // Pick/ban timer per action
};

const EGO_BAN_COUNT = 5;           // EGOs banned per player
const LOBBY_TTL = 2 * 60 * 60 * 1000;  // 2 hours lobby cleanup
```

### Monitoring
- Console logging for major events
- Error tracking for failed operations
- Performance metrics for timer accuracy
- Connection status monitoring

---

## Future Maintenance

### Adding New IDs
1. Update the CSV data in `data.js` 
2. Add corresponding image files to `uploads/`
3. Ensure slug generation consistency
4. Update server-side validation list

### Modifying Draft Logic
1. Update `DRAFT_LOGIC` object in `server.js`
2. Test phase advancement logic
3. Verify timer integration
4. Update client-side display logic

### Adding New Features
1. Consider WebSocket message impact
2. Maintain backward compatibility
3. Test with multiple concurrent lobbies
4. Document new configuration options

---

## Troubleshooting Guide

### Common Issues

**Lobbies disappearing**: Check TTL settings and activity tracking
**Timer desync**: Verify system time accuracy and network latency
**Draft stuck**: Check phase advancement logic and action counts
**Memory leaks**: Monitor lobby cleanup and timer management
**Connection drops**: Review WebSocket reconnection logic

### Debug Information
- Server logs include lobby codes and player actions
- Client state is accessible via browser console
- WebSocket messages can be monitored in network tab
- Timer precision can be verified with console timestamps

---

## Recent Code Improvements (August 2025)

### Server-Side Enhancements

#### 1. Roster Validation Consolidation
- **Added**: `validateRoster(roster, rosterSize)` helper function
- **Improvement**: Eliminates duplicate roster validation logic across endpoints
- **Location**: Used in `rosterSet` handler
- **Benefit**: Single source of truth for roster validation rules

#### 2. Error Response Consistency
- **Added**: `sendError(ws, message)` helper function
- **Improvement**: Standardizes all WebSocket error responses to `{ type: 'error', message }`
- **Location**: Applied to all error cases in WebSocket handlers
- **Benefit**: Consistent error handling and reduced code duplication

#### 3. Enhanced Player Name Sanitization
- **Added**: `sanitizePlayerName(name)` function with advanced validation
- **Features**:
  - 16-character length limit (reduced from 50)
  - Control character removal (`[\x00-\x1F\x7F]`)
  - Whitespace normalization
  - HTML entity encoding for XSS prevention
- **Location**: Applied to lobby creation and player join
- **Benefit**: Better security and UI consistency

#### 4. Improved Logging System
- **Added**: `logInfo(category, message, data)` and `logError(category, message, error)` functions
- **Features**:
  - ISO timestamps on all log entries
  - Structured data logging with JSON objects
  - Categorized logs (TIMER, CONNECTION, DRAFT, CLEANUP, SERVER, WEBSOCKET)
  - Consistent formatting across all server operations
- **Benefit**: Better monitoring, debugging, and operational visibility

#### 5. Validation Helper Functions
- **Added**: Multiple validation helpers to reduce code duplication:
  - `validateLobbyExists(ws, lobbyData, sendErrorOnFail)` - Lobby existence check
  - `validatePlayerRole(player)` - Player role validation (p1/p2, not ref)
  - `validatePlayerAccess(ws, player, lobbyData)` - Combined player access validation
  - `validatePlayerNotReady(lobbyData, player)` - Ready state validation
  - `validateRefereeAccess(ws, lobbyData)` - Referee access validation
- **Improvement**: Consolidated 15+ repeated validation patterns
- **Benefit**: Easier maintenance, consistent validation logic, cleaner handler code

### Code Quality Improvements
- **Reduced**: Code duplication by ~30% in validation patterns
- **Improved**: Error handling consistency across all WebSocket endpoints
- **Enhanced**: Security through better input sanitization
- **Added**: Comprehensive logging for operational monitoring
- **Maintained**: All existing draft logic and business rules (no breaking changes)

### Testing Notes
All improvements preserve the existing meticulously crafted draft logic. The changes are focused on:
- Code organization and maintainability
- Error handling and logging
- Input validation and security
- Development and debugging experience

**No changes were made to:**
- Draft logic sequences or phase advancement
- Timer calculations or reserve time handling
- Ban pool computation or ID availability
- WebSocket message protocols or data structures

---

## Pending Code Improvements Checklist

### Client-Side (script.js) Improvements
- [x] **Extract magic numbers to constants** - Replace hardcoded values like `150` for max character count
- [x] **Consolidate duplicate DOM queries** - Cache frequently accessed DOM elements
- [ ] **Improve error handling in async functions** - Add proper try-catch blocks where missing
- [ ] **Extract repeated validation logic** - The character validation is repeated in multiple places
- [ ] **Improve function naming** - Some functions like `updateCharacterCount` could be more descriptive
- [ ] **Add debouncing to search functionality** - Prevent excessive API calls during typing

### Code Organization Improvements
- [ ] **Move validation functions to separate module** - Extract roster validation logic to a utility file
- [ ] **Create constants file** - Move all magic numbers and strings to a shared constants file
- [ ] **Improve comment documentation** - Add JSDoc comments to functions
- [ ] **Standardize variable naming** - Some variables use different naming conventions

### Security & Performance Improvements
- [ ] **Add rate limiting** - Prevent spam requests to endpoints
- [ ] **Improve file upload validation** - Add more robust file type and size validation
- [ ] **Add CORS configuration** - Properly configure CORS instead of allowing all origins
- [ ] **Optimize image serving** - Add proper cache headers for static files

### Error Handling Improvements
- [ ] **Standardize error response format** - All endpoints should return consistent error objects
- [ ] **Add global error handler** - Catch unhandled errors gracefully
- [ ] **Improve client-side error feedback** - Better user feedback for various error states

### Code Quality Improvements
- [ ] **Remove unused variables** - Clean up any unused declarations
- [ ] **Improve code formatting consistency** - Standardize indentation and spacing
- [ ] **Add input validation helpers** - Create reusable validation functions

### Implementation Priority
1. **High Priority**: Client-side improvements (magic numbers, DOM caching, error handling)
2. **Medium Priority**: Security & performance (rate limiting, CORS, file validation)
3. **Low Priority**: Code organization (constants file, JSDoc comments, formatting)

### Notes for Implementation
- Each improvement should be implemented and tested individually
- Preserve all existing functionality and user experience
- Focus on maintainability and developer experience
- Consider backward compatibility for any API changes
- Test thoroughly after each change to ensure no regressions

---

## Testing Scenarios

### Core Functionality
1. Complete draft with both formats (1-2-2, 2-3-2)
2. Extended format testing (All Sections)
3. Timer expiration handling (main and reserve)
4. Connection drop and rejoin scenarios
5. Multiple concurrent lobbies

### Edge Cases
1. Rapid clicking during picks/bans
2. Network interruption during critical phases
3. Browser refresh during active draft
4. Multiple referee actions simultaneously
5. Invalid roster configurations

### Performance Testing
1. Large number of concurrent connections
2. Extended session duration (approaching TTL)
3. Rapid lobby creation/destruction
4. Heavy filtering and search operations
5. Memory usage over time

This documentation should serve as a comprehensive reference for understanding, maintaining, and extending the Limbus Company Draft Hub application.
