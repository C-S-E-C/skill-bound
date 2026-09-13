# Code of Conduct and Developer Guide

- [简体中文](CODE_OF_CONDUCT-zh_hans.md)

## Table of Contents

- [Code of Conduct and Developer Guide](#code-of-conduct-and-developer-guide)
  - [Table of Contents](#table-of-contents)
  - [Code of Conduct](#code-of-conduct)
    - [Expected Behavior](#expected-behavior)
    - [Unacceptable Behavior](#unacceptable-behavior)
    - [Reporting Issues](#reporting-issues)
  - [Developer Guide](#developer-guide)
    - [Project Goals](#project-goals)
    - [Version Naming](#version-naming)
    - [Current Architecture](#current-architecture)
    - [Development Workflow](#development-workflow)
    - [EasyTier Protocol](#easytier-protocol)
      - [Connection](#connection)
      - [Packet format](#packet-format)
      - [Battle transition](#battle-transition)
    - [WebRTC Protocol](#webrtc-protocol)
    - [EasyTier-to-WebRTC Handoff](#easytier-to-webrtc-handoff)
    - [Debugging and Validation](#debugging-and-validation)

## Code of Conduct

This project is intended to be a collaborative, respectful, and safety-conscious software project. All contributors, maintainers, reviewers, and users are expected to participate in good faith.

### Expected Behavior

- Be respectful, constructive, and precise when discussing code or design.
- Assume good intent, while still addressing technical and security issues directly.
- Explain the reasoning behind proposed changes when practical.
- Keep reviews focused on the implementation and its effect, not on individuals.
- Protect user privacy and do not commit credentials, tokens, private keys, or personal data.
- Prefer reproducible bug reports, tests, and documentation over speculation.
- Respect project scope, licensing requirements, and the permissions of systems being tested.

### Unacceptable Behavior

The following behavior is not acceptable:

- Harassment, discrimination, threats, personal attacks, or deliberate intimidation.
- Publishing private information without permission.
- Credential theft, phishing, malware, unauthorized access, or attacks against systems that you do not own or have permission to test.
- Deliberately bypassing authentication, moderation, access controls, quotas, or safety restrictions.
- Submitting malicious code, hidden backdoors, or intentionally deceptive changes.
- Disrupting the project through spam, repeated bad-faith reports, or knowingly false information.

### Reporting Issues

Report conduct or security concerns privately to the project maintainers rather than posting sensitive details publicly. Include enough context to reproduce or understand the issue, but do not include passwords, tokens, private keys, or other secrets.

Maintainers may remove, edit, or reject contributions that violate this policy. Actions should be proportionate to the behavior and applied consistently.

## Developer Guide

This section documents the current implementation conventions and network model. It is a practical guide for contributors; it does not replace the source code or protocol implementation.

### Project Goals

The project is a browser-based Skill Bound application with pairing, a dashboard, a 2D battle page, offline asset caching, and peer-to-peer battle communication. The implementation aims to:

- keep the application usable in a browser and in the iframe-based shell;
- keep pairing and battle signaling reliable across multiple players;
- use EasyTier while peers are discovering and negotiating connections;
- move battle traffic to WebRTC DataChannels after the connection is ready; and
- keep assets versioned and verifiable through `flist.json`.

### Version Naming

Versions use the following format:

```text
v{major}[.{minor}][b{beta}][p{patch}]
```

Square brackets mean optional parts. Examples:

```text
v3
v3.0
v3.0b2
v3.0b2p3
v3.1p1
```

The intended meaning is:

- `major`: an incompatible or major product change;
- `minor`: a compatible feature release within the major version;
- `bN`: beta release number `N`;
- `pN`: patch or maintenance release number `N`.

The compact form `v3.0b2p3` means major version 3, minor version 0, beta 2, patch 3. Do not add a component that has no meaning for the release. Version strings should be written consistently in release notes, tags, and user-visible update metadata.

The cache manifest stores the numeric release sequence separately:

```json
{
    "this": { "name": "v3.0b2p3", "id": 3 },
    "lastRequiredUpdate": 1
}
```

`this.id` is the latest available release sequence. `lastRequiredUpdate` is the minimum release sequence that may continue to run. A client below `lastRequiredUpdate` must update; a client below `this.id` may receive an optional update prompt.

`flist.py` creates a new manifest release and increments `this.id`. Selecting `Force update?` sets `lastRequiredUpdate` to the new release ID. `checkflist.py` repairs hashes, removes missing files, recalculates `requiredBytes`, and validates version metadata; it must not silently create a new release.

### Current Architecture

The current application has these main layers:

1. **Root shell**
   - `index.html` is the outer shell.
   - It loads `crypto.min.js`, `easytier.js`, and `shell.js`.
   - It downloads and verifies assets listed in `flist.json`.
   - It registers the service worker and loads `/app_files/index.html` into `#app-frame`.

2. **Application pages**
   - `app_files/index.html` is the application landing page.
   - `login.html`, `signup.html`, `lang.html`, and `dashboard.html` handle account, language, and navigation flows.
   - `pair.html` and `app_files/js/pair.js` manage peer discovery, rooms, teams, and battle start voting.
   - `battle.html` contains the battle scene.
   - `app_files/js/battle.js` contains battle state, movement, messaging, and game-loop logic.
   - `app_files/js/battle-render.js` contains map, camera, sprite, and player rendering.

3. **Shared runtime**
   - `app_files/js/runtime.js` exposes shared top-window services to iframe pages.
   - The ordinary scripts intentionally share globals; do not convert one part to modules without updating load order and global access.

4. **Asset and localization layer**
   - CSS files under `app_files/css` provide shared and page-specific UI styles.
   - Translation resources and translation classes provide visible localized text.
   - `flist.json` is the cache/update manifest and includes URL, source, MD5, and total byte metadata.

5. **Transport layer**
   - EasyTier provides discovery, pairing packets, and temporary WebRTC signaling.
   - WebRTC DataChannels carry battle envelopes after negotiation.

### Development Workflow

1. Read the affected HTML, JavaScript, and CSS before editing.
2. Keep page-specific changes under `app_files` unless the root shell or shared transport is intentionally affected.
3. Preserve existing `<title>` values unless a title change is part of the request.
4. Keep ordinary script load order intact. Rendering code loaded by `battle.html` must be loaded before `battle.js`.
5. Do not disconnect EasyTier before all required battle peers have completed the WebRTC handoff.
6. Update `flist.json` when a cached asset changes. Verify each listed MD5 and `requiredBytes`.
7. Run syntax and whitespace checks before committing:

```text
node --check <changed-javascript-file>
python -m py_compile flist.py checkflist.py
python checkflist.py
 git diff --check
```

8. Test at least the affected page, a fresh cache, an existing cache, a single-player case, and a multi-player case when networking is changed.

### EasyTier Protocol

The project uses the EasyTier JavaScript client in `js/easytier.js`.

#### Connection

The client connects to the configured EasyTier WebSocket endpoint with the project network name (`skillbound`). A connection exposes a local numeric `peerId`. Repeated calls to `connect()` must be serialized or guarded by `status().connected`; an `EasyTier is already connected` rejection is not a reason to tear down a healthy connection.

#### Packet format

EasyTier uses its internal binary packet framing and packet types, including data, handshake, ping, pong, RPC request, and RPC response. Application pairing messages are JSON payloads carried through EasyTier RPC packets and identified by:

```text
skillbound.pairing.v2
```

Pairing packets include a packet type such as `RequestPair`, `AcceptPair`, `UpdatePair`, `StartBattle`, or `TeamChange`. The room snapshot contains the room ID, peer list, player list, selected battlefield, and team state.

Pairing messages are application-level messages. They must be validated for protocol name, peer identity, and expected room state before changing local state.

#### Battle transition

When all required players vote to start, the leader sends a `StartBattle` snapshot to every peer and navigates locally. Each recipient stores the same `battlePeers`, `battlePlayers`, room/session ID, and battlefield in `sessionStorage`, then navigates to `battle.html`.

EasyTier remains connected during this navigation and is reused by the battle page for WebRTC signaling.

### WebRTC Protocol

WebRTC is exposed through `easytierWebRTC` in `js/easytier.js`. Its signaling messages are transported over EasyTier and contain a signaling kind such as:

- `offer`
- `answer`
- `candidate`

Each WebRTC session has a generated `sessionId` and a numeric remote `peerId`. `connect(peerId, options)` creates an offer on the initiating side. The receiving side creates an answer. ICE candidates are exchanged through EasyTier until the RTCPeerConnection and its DataChannel are established.

`connectMany(peerIds, options)` performs sequential outgoing connections. Battle code explicitly uses:

```js
{ autoDisconnectEasyTier: false, sessionId }
```

The WebRTC status object contains information such as:

```json
{
    "ready": true,
    "peers": [],
    "openPeerIds": [2159518483],
    "targetPeerId": 2159518483
}
```

Battle messages are sent as JSON DataChannel envelopes:

```json
{
    "protocol": "skillbound.battle.v1",
    "sessionId": "ROOM_ID",
    "senderId": "PLAYER_ID",
    "messageId": "PLAYER_ID-UNIQUE_ID",
    "payload": {
        "type": "match_joined"
    }
}
```

The receiver validates the battle protocol and session ID, handles the payload, and may relay a new envelope to other open peers. Message IDs are used to avoid duplicate relay processing.

### EasyTier-to-WebRTC Handoff

The intended handoff is:

1. Pairing completes over EasyTier.
2. The leader sends `StartBattle` to all participants.
3. All participants navigate to `battle.html` while EasyTier stays connected.
4. The leader connects to every other battle peer with `connectMany()`.
5. Non-leaders wait for the leader's WebRTC offer.
6. Every opened DataChannel sends a battle-level `webrtc_ready` payload to its directly connected peer.
7. The local page waits for both:
   - all required DataChannels to appear in `openPeerIds`; and
   - a `webrtc_ready` confirmation from every required peer.
8. Only after both conditions are true may the page call:

```js
easytier.disconnect(1000, "WebRTC handoff complete");
```

Do not enable `autoDisconnectEasyTier` for the multi-peer battle handoff. The first `open` event is not sufficient when a room contains multiple players. A failure or timeout should leave signaling available for diagnosis rather than disconnecting prematurely.

For a solo battle there are no required remote WebRTC peers. The page may keep EasyTier available because there is no peer-to-peer handoff to complete.

### Debugging and Validation

Useful status fields include:

- EasyTier connection state and local peer ID;
- WebRTC `ready`, `peerConnectionState`, and `dataChannelState`;
- `openPeerIds` and the expected peer IDs;
- signaling events (`offer`, `answer`, `candidate`);
- battle envelope protocol and session ID.

A successful peer connection normally shows an answer, at least one candidate exchange, `dataChannelState: "open"`, `peerConnectionState: "connected"`, and a battle `message`. If only one side logs a WebRTC state, first verify that both sides loaded the same cached `battle.js`, that `battlePeers` contains EasyTier numeric peer IDs, and that EasyTier was not disconnected before signaling completed.
