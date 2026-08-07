(function attachEasyTier(global) {
  "use strict";

  if (!global) {
    throw new Error("EasyTier.js requires a browser-like global object.");
  }

  var MAGIC = 0xd1e1a5e1;
  var VERSION = 1;
  var HEADER_SIZE = 16;
  var MASK_64 = 0xffffffffffffffffn;
  var events = new Map();
  var scanRequests = new Map();
  var observedPeers = new Map();
  var socket = null;
  var connectPromise = null;
  var connectResolve = null;
  var connectReject = null;
  var connectTimer = null;
  var keepaliveTimer = null;
  var server = null;
  var remotePeerId = null;
  var localPeerId = null;
  var state = "idle";

  var PacketType = Object.freeze({
    DATA: 1,
    HANDSHAKE: 2,
    PING: 4,
    PONG: 5,
    RPC_REQUEST: 8,
    RPC_RESPONSE: 9
  });
  var PacketFlags = Object.freeze({
    ENCRYPTED: 1,
    LATENCY_FIRST: 2,
    EXIT_NODE: 4,
    NO_PROXY: 8,
    COMPRESSED: 16,
    NOT_SEND_TO_TUN: 64
  });

  function emit(name, detail) {
    var listeners = events.get(name);
    if (!listeners) return;
    listeners.forEach(function (listener) {
      try {
        listener(detail);
      } catch (error) {
        setTimeout(function () {
          throw error;
        }, 0);
      }
    });
  }

  function setState(next, error) {
    state = next;
    emit("state", { state: state, error: error || null, server: currentServer() });
  }

  function toBytes(value) {
    if (value == null) return new Uint8Array(0);
    if (typeof value === "string") return new TextEncoder().encode(value);
    if (value instanceof Uint8Array) return value;
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (ArrayBuffer.isView(value)) {
      return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    }
    throw new TypeError("Payload must be a string, ArrayBuffer, or typed array.");
  }

  function concatBytes(parts) {
    var size = parts.reduce(function (total, part) {
      return total + part.length;
    }, 0);
    var output = new Uint8Array(size);
    var offset = 0;
    parts.forEach(function (part) {
      output.set(part, offset);
      offset += part.length;
    });
    return output;
  }

  function encodeVarint(value) {
    var number = typeof value === "bigint" ? value : BigInt(value >>> 0);
    var result = [];
    do {
      var byte = Number(number & 0x7fn);
      number >>= 7n;
      result.push(number ? byte | 0x80 : byte);
    } while (number);
    return new Uint8Array(result);
  }

  function decodeVarint(bytes, offset) {
    var value = 0n;
    var shift = 0n;
    for (var index = offset; index < bytes.length; index += 1) {
      var byte = bytes[index];
      value |= BigInt(byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) {
        return { value: value, offset: index + 1 };
      }
      shift += 7n;
      if (shift > 63n) throw new Error("Invalid protobuf varint.");
    }
    throw new Error("Truncated protobuf varint.");
  }

  function protobufVarint(field, value) {
    return concatBytes([encodeVarint((field << 3) | 0), encodeVarint(value)]);
  }

  function protobufBytes(field, value) {
    var bytes = toBytes(value);
    return concatBytes([
      encodeVarint((field << 3) | 2),
      encodeVarint(bytes.length),
      bytes
    ]);
  }

  function encodeHandshake(peerId, networkName, secretDigest) {
    return concatBytes([
      protobufVarint(1, MAGIC),
      protobufVarint(2, peerId),
      protobufVarint(3, VERSION),
      protobufBytes(5, networkName),
      protobufBytes(6, secretDigest)
    ]);
  }

  function decodeHandshake(bytes) {
    var result = {
      magic: 0,
      peerId: 0,
      version: 0,
      networkName: "",
      secretDigest: new Uint8Array(0)
    };
    var offset = 0;
    while (offset < bytes.length) {
      var key = decodeVarint(bytes, offset);
      offset = key.offset;
      var field = Number(key.value >> 3n);
      var wireType = Number(key.value & 7n);
      if (wireType === 0) {
        var scalar = decodeVarint(bytes, offset);
        offset = scalar.offset;
        if (field === 1) result.magic = Number(scalar.value);
        if (field === 2) result.peerId = Number(scalar.value);
        if (field === 3) result.version = Number(scalar.value);
      } else if (wireType === 2) {
        var length = decodeVarint(bytes, offset);
        offset = length.offset;
        var end = offset + Number(length.value);
        if (end > bytes.length) throw new Error("Truncated protobuf bytes field.");
        var value = bytes.slice(offset, end);
        offset = end;
        if (field === 5) result.networkName = new TextDecoder().decode(value);
        if (field === 6) result.secretDigest = value;
      } else {
        throw new Error("Unsupported protobuf wire type " + wireType + ".");
      }
    }
    return result;
  }

  function rotl(value, bits) {
    return ((value << bits) | (value >> (64n - bits))) & MASK_64;
  }

  function sipRound(stateValue) {
    stateValue.v0 = (stateValue.v0 + stateValue.v1) & MASK_64;
    stateValue.v1 = rotl(stateValue.v1, 13n) ^ stateValue.v0;
    stateValue.v0 = rotl(stateValue.v0, 32n);
    stateValue.v2 = (stateValue.v2 + stateValue.v3) & MASK_64;
    stateValue.v3 = rotl(stateValue.v3, 16n) ^ stateValue.v2;
    stateValue.v0 = (stateValue.v0 + stateValue.v3) & MASK_64;
    stateValue.v3 = rotl(stateValue.v3, 21n) ^ stateValue.v0;
    stateValue.v2 = (stateValue.v2 + stateValue.v1) & MASK_64;
    stateValue.v1 = rotl(stateValue.v1, 17n) ^ stateValue.v2;
    stateValue.v2 = rotl(stateValue.v2, 32n);
  }

  function readLittleEndian64(bytes, offset) {
    var result = 0n;
    for (var index = 0; index < 8; index += 1) {
      result |= BigInt(bytes[offset + index]) << BigInt(index * 8);
    }
    return result;
  }

  // Rust's DefaultHasher is SipHash 1-3 with fixed keys when constructed with new().
  function sipHash13(bytes) {
    var stateValue = {
      v0: 0x736f6d6570736575n,
      v1: 0x646f72616e646f6dn,
      v2: 0x6c7967656e657261n,
      v3: 0x7465646279746573n
    };
    var fullLength = bytes.length - (bytes.length % 8);
    for (var offset = 0; offset < fullLength; offset += 8) {
      var message = readLittleEndian64(bytes, offset);
      stateValue.v3 ^= message;
      sipRound(stateValue);
      stateValue.v0 ^= message;
    }
    var last = BigInt(bytes.length) << 56n;
    for (var tail = 0; tail < bytes.length - fullLength; tail += 1) {
      last |= BigInt(bytes[fullLength + tail]) << BigInt(tail * 8);
    }
    stateValue.v3 ^= last;
    sipRound(stateValue);
    stateValue.v0 ^= last;
    stateValue.v2 ^= 0xffn;
    sipRound(stateValue);
    sipRound(stateValue);
    sipRound(stateValue);
    return (stateValue.v0 ^ stateValue.v1 ^ stateValue.v2 ^ stateValue.v3) & MASK_64;
  }

  function writeBigEndian64(value) {
    var output = new Uint8Array(8);
    for (var index = 7; index >= 0; index -= 1) {
      output[index] = Number(value & 0xffn);
      value >>= 8n;
    }
    return output;
  }

  function networkSecretDigest(networkName, networkPassword) {
    var data = concatBytes([toBytes(networkName), toBytes(networkPassword)]);
    var digest = new Uint8Array(32);
    for (var index = 0; index < 4; index += 1) {
      var block = writeBigEndian64(sipHash13(data));
      digest.set(block, index * 8);
      data = concatBytes([data, digest.slice(0, (index + 1) * 8)]);
    }
    return digest;
  }

  function equalBytes(left, right) {
    if (left.length !== right.length) return false;
    var difference = 0;
    for (var index = 0; index < left.length; index += 1) {
      difference |= left[index] ^ right[index];
    }
    return difference === 0;
  }

  function bytesToHex(bytes) {
    var output = "";
    for (var index = 0; index < bytes.length; index += 1) {
      output += bytes[index].toString(16).padStart(2, "0");
    }
    return output;
  }

  function safeJsonPayload(packet) {
    if (packet.encrypted) return null;
    if (packet.type !== PacketType.RPC_REQUEST && packet.type !== PacketType.RPC_RESPONSE) return null;
    try {
      return JSON.parse(new TextDecoder().decode(packet.payload));
    } catch (_) {
      return null;
    }
  }

  function observePeer(peerId, source, packet) {
    peerId = Number(peerId);
    if (!Number.isInteger(peerId) || peerId <= 0 || peerId > 0xffffffff || peerId === localPeerId) return;
    var now = new Date().toISOString();
    var existing = observedPeers.get(peerId);
    var peer = existing || {
      peerId: peerId,
      firstSeenAt: now,
      lastSeenAt: now,
      packetCount: 0,
      sources: []
    };
    peer.lastSeenAt = now;
    peer.packetCount += 1;
    if (peer.sources.indexOf(source) === -1) peer.sources.push(source);
    observedPeers.set(peerId, peer);
    emit("peer-observed", {
      id: peer.peerId,
      lastseen: peer.lastSeenAt,
      packetType: packet ? packet.type : null
    });
  }

  function observePacketPeers(packet) {
    observePeer(packet.fromPeerId, "packet.fromPeerId", packet);
    observePeer(packet.toPeerId, "packet.toPeerId", packet);
  }

  function makePacket(fromPeerId, toPeerId, packetType, payload) {
    var body = toBytes(payload);
    var packet = new Uint8Array(HEADER_SIZE + body.length);
    var view = new DataView(packet.buffer);
    view.setUint32(0, fromPeerId >>> 0, true);
    view.setUint32(4, toPeerId >>> 0, true);
    packet[8] = packetType;
    packet[9] = 0;
    packet[10] = 1;
    packet[11] = 0;
    view.setUint32(12, body.length, true);
    packet.set(body, HEADER_SIZE);
    return packet;
  }

  function parsePacket(frame) {
    var bytes = toBytes(frame);
    if (bytes.length < HEADER_SIZE) throw new Error("EasyTier packet is shorter than its header.");
    var view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    var payloadLength = view.getUint32(12, true);
    var framePayloadLength = bytes.length - HEADER_SIZE;
    var flags = bytes[9];
    var encrypted = (flags & PacketFlags.ENCRYPTED) !== 0;
    if (payloadLength > framePayloadLength) {
      throw new Error("EasyTier packet length does not match its header.");
    }
    if (!encrypted && payloadLength !== framePayloadLength) {
      throw new Error("EasyTier packet length does not match its header.");
    }
    return {
      fromPeerId: view.getUint32(0, true),
      toPeerId: view.getUint32(4, true),
      type: bytes[8],
      flags: flags,
      encrypted: encrypted,
      compressed: (flags & PacketFlags.COMPRESSED) !== 0,
      forwardCounter: bytes[10],
      payloadLength: payloadLength,
      framePayloadLength: framePayloadLength,
      payload: bytes.slice(HEADER_SIZE, HEADER_SIZE + payloadLength),
      rawPayload: bytes.slice(HEADER_SIZE)
    };
  }

  function createPeerId() {
    var random = new Uint32Array(1);
    global.crypto.getRandomValues(random);
    return random[0] || 1;
  }

  function normalizeProtocol(protocol) {
    if (protocol === "ws/wss") {
      return global.location && global.location.protocol === "https:" ? "wss" : "ws";
    }
    if (protocol !== "ws" && protocol !== "wss") {
      throw new TypeError('Protocol must be "ws", "wss", or "ws/wss".');
    }
    return protocol;
  }

  function formatHost(host) {
    return host.indexOf(":") !== -1 && host[0] !== "[" ? "[" + host + "]" : host;
  }

  function rejectConnection(error) {
    if (connectTimer) clearTimeout(connectTimer);
    connectTimer = null;
    stopKeepalive();
    var reject = connectReject;
    connectResolve = null;
    connectReject = null;
    connectPromise = null;
    if (reject) reject(error);
  }

  function resolveConnection(value) {
    if (connectTimer) clearTimeout(connectTimer);
    connectTimer = null;
    var resolve = connectResolve;
    connectResolve = null;
    connectReject = null;
    connectPromise = null;
    if (resolve) resolve(value);
  }

  function resetConnection() {
    stopKeepalive();
    socket = null;
    remotePeerId = null;
    localPeerId = null;
    server = null;
  }

  function sendPacket(packetType, payload, toPeerId) {
    if (!socket || socket.readyState !== WebSocket.OPEN || remotePeerId === null || localPeerId === null) {
      throw new Error("EasyTier is not connected.");
    }
    var destination = toPeerId == null ? remotePeerId : Number(toPeerId);
    if (!Number.isInteger(destination) || destination < 0 || destination > 0xffffffff) {
      throw new TypeError("toPeerId must be an unsigned 32-bit integer.");
    }
    socket.send(makePacket(localPeerId, destination, Number(packetType), payload));
  }

  function broadcast(packetType, payload, peerIds) {
    if (!Array.isArray(peerIds)) throw new TypeError("peerIds must be an array.");
    peerIds.forEach(function (peerId) {
      sendPacket(packetType, payload, peerId);
    });
  }

  function startKeepalive(intervalMs) {
    stopKeepalive();
    if (!intervalMs) return;
    keepaliveTimer = setInterval(function () {
      if (state !== "connected") return;
      try {
        ping();
      } catch (error) {
        emit("error", error);
      }
    }, intervalMs);
  }

  function stopKeepalive() {
    if (keepaliveTimer) clearInterval(keepaliveTimer);
    keepaliveTimer = null;
  }

  function receivePacket(frame) {
    var packet;
    try {
      packet = parsePacket(frame);
      if (state === "handshaking") {
        if (packet.type !== PacketType.HANDSHAKE) {
          throw new Error("Expected an EasyTier handshake packet.");
        }
        var handshake = decodeHandshake(packet.payload);
        var expectedDigest = networkSecretDigest(server.networkName, server.networkPassword);
        if (handshake.magic !== MAGIC || handshake.version !== VERSION) {
          throw new Error("EasyTier server returned an unsupported handshake.");
        }
        if (handshake.secretDigest.length !== 32) {
          throw new Error("EasyTier server returned an invalid network digest.");
        }
        if (!handshake.peerId || handshake.peerId !== packet.fromPeerId) {
          throw new Error("EasyTier server returned an invalid peer ID.");
        }
        var networkMatch = handshake.networkName === server.networkName
          && equalBytes(handshake.secretDigest, expectedDigest);
        remotePeerId = handshake.peerId;
        server.peerId = remotePeerId;
        server.remoteNetworkName = handshake.networkName;
        server.remoteNetworkSecretDigest = bytesToHex(handshake.secretDigest);
        server.networkMatch = networkMatch;
        server.foreignNetwork = !networkMatch;
        server.connectedAt = new Date().toISOString();
        setState("connected");
        startKeepalive(server.keepaliveMs);
        emit("connected", currentServer());
        if (!networkMatch) emit("foreign-network", currentServer());
        resolveConnection(currentServer());
        return;
      }
      if (packet.encrypted) {
        observePacketPeers(packet);
        emit("encrypted-packet", packet);
        emit("packet", packet);
        emit("packet:" + packet.type, packet);
        return;
      }
      if (packet.type === PacketType.PING) {
        sendPacket(PacketType.PONG, packet.payload, packet.fromPeerId);
      }
      observePacketPeers(packet);
      handleEasyTierControl(packet);
      emit("packet", packet);
      emit("packet:" + packet.type, packet);
    } catch (error) {
      emit("error", error);
      if (state === "handshaking") {
        setState("error", error.message);
        rejectConnection(error);
        if (socket) socket.close(1002, "EasyTier handshake failed");
      }
    }
  }

  function handleEasyTierControl(packet) {
    var message = safeJsonPayload(packet);
    if (!message) return;
    if (message.easytierJsPeerScan === 1 && message.kind === "probe") {
      sendPacket(PacketType.RPC_RESPONSE, JSON.stringify({
        easytierJsPeerScan: 1,
        kind: "reply",
        scanId: message.scanId,
        localPeerId: localPeerId,
        server: currentServer(),
        userAgent: global.navigator ? global.navigator.userAgent : ""
      }), packet.fromPeerId);
      return;
    }
    if (message.easytierJsPeerScan === 1 && message.kind === "reply") {
      var scan = scanRequests.get(message.scanId);
      if (!scan) return;
      var peer = {
        peerId: packet.fromPeerId,
        localPeerId: message.localPeerId || packet.fromPeerId,
        server: message.server || null,
        userAgent: message.userAgent || ""
      };
      scan.results.set(peer.peerId, peer);
      observePeer(peer.peerId, "scan.reply", packet);
      scan.onPeer(peer);
      emit("scan-peer", peer);
    }
  }

  function connect(protocol, host, port, networkName, networkPassword, options) {
    if (connectPromise) return connectPromise;
    if (socket && socket.readyState === WebSocket.OPEN) {
      return Promise.reject(new Error("EasyTier is already connected."));
    }
    if (!global.crypto || !global.crypto.getRandomValues) {
      return Promise.reject(new Error("EasyTier.js requires Web Crypto getRandomValues()."));
    }
    var scheme;
    try {
      scheme = normalizeProtocol(protocol);
    } catch (error) {
      return Promise.reject(error);
    }
    var parsedPort = Number(port);
    if (typeof host !== "string" || !host || !Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
      return Promise.reject(new TypeError("host and port must identify a valid WebSocket listener."));
    }
    if (typeof networkName !== "string" || typeof networkPassword !== "string") {
      return Promise.reject(new TypeError("networkName and networkPassword must be strings."));
    }
    options = options || {};
    var timeoutMs = options.timeoutMs == null ? 10000 : Number(options.timeoutMs);
    var keepaliveMs = options.keepaliveMs == null ? 0 : Number(options.keepaliveMs);
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      return Promise.reject(new TypeError("options.timeoutMs must be a positive number."));
    }
    if (!Number.isFinite(keepaliveMs) || keepaliveMs < 0) {
      return Promise.reject(new TypeError("options.keepaliveMs must be zero or a positive number."));
    }

    server = {
      protocol: scheme,
      host: host,
      port: parsedPort,
      url: scheme + "://" + formatHost(host) + ":" + parsedPort + "/",
      networkName: networkName,
      networkPassword: networkPassword,
      keepaliveMs: keepaliveMs,
      peerId: null,
      remoteNetworkName: null,
      remoteNetworkSecretDigest: null,
      networkMatch: null,
      foreignNetwork: null,
      connectedAt: null
    };
    localPeerId = createPeerId();
    setState("connecting");

    connectPromise = new Promise(function (resolve, reject) {
      connectResolve = resolve;
      connectReject = reject;
      socket = new WebSocket(server.url);
      socket.binaryType = "arraybuffer";

      socket.onopen = function () {
        try {
          setState("handshaking");
          socket.send(makePacket(
            localPeerId,
            0,
            PacketType.HANDSHAKE,
            encodeHandshake(localPeerId, networkName, networkSecretDigest(networkName, networkPassword))
          ));
        } catch (error) {
          setState("error", error.message);
          rejectConnection(error);
          socket.close(1011, "EasyTier client error");
        }
      };

      socket.onmessage = function (event) {
        if (event.data instanceof Blob) {
          event.data.arrayBuffer().then(receivePacket).catch(function (error) {
            emit("error", error);
          });
        } else {
          receivePacket(event.data);
        }
      };

      socket.onerror = function () {
        emit("error", new Error("WebSocket transport error."));
      };

      socket.onclose = function (event) {
        var wasConnecting = state === "connecting" || state === "handshaking";
        var error = wasConnecting
          ? new Error("WebSocket closed before EasyTier connected (code " + event.code + ").")
          : null;
        var closedServer = currentServer();
        resetConnection();
        if (wasConnecting) {
          setState("error", error.message);
          rejectConnection(error);
        } else {
          setState("closed");
        }
        emit("disconnected", {
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean,
          server: closedServer
        });
      };

      connectTimer = setTimeout(function () {
        var error = new Error("Timed out waiting for the EasyTier handshake.");
        setState("error", error.message);
        rejectConnection(error);
        if (socket) socket.close(1002, "EasyTier handshake timeout");
      }, timeoutMs);
    });
    return connectPromise;
  }

  function disconnect(code, reason) {
    if (!socket) return;
    socket.close(code == null ? 1000 : code, reason == null ? "Disconnected by client" : String(reason));
  }

  function currentServer() {
    if (!server) return null;
    return {
      protocol: server.protocol,
      host: server.host,
      port: server.port,
      url: server.url,
      networkName: server.networkName,
      networkPassword: server.networkPassword,
      keepaliveMs: server.keepaliveMs,
      peerId: server.peerId,
      remoteNetworkName: server.remoteNetworkName,
      remoteNetworkSecretDigest: server.remoteNetworkSecretDigest,
      networkMatch: server.networkMatch,
      foreignNetwork: server.foreignNetwork,
      connectedAt: server.connectedAt,
      localPeerId: localPeerId,
      state: state
    };
  }

  function status() {
    return {
      state: state,
      connected: state === "connected",
      localPeerId: localPeerId,
      remotePeerId: remotePeerId,
      observedPeers: listPeers(),
      server: currentServer()
    };
  }

  function listPeers() {
    return Array.from(observedPeers.values()).map(function (peer) {
      return {
        id: peer.peerId,
        lastseen: peer.lastSeenAt
      };
    }).sort(function (a, b) {
      return b.lastseen.localeCompare(a.lastseen);
    });
  }

  function ping() {
    var sequence = new Uint8Array(4);
    new DataView(sequence.buffer).setUint32(0, Math.floor(Math.random() * 0x100000000), true);
    sendPacket(PacketType.PING, sequence);
  }

  function scanPeerIds(options) {
    if (state !== "connected") {
      return Promise.reject(new Error("EasyTier is not connected."));
    }
    options = options || {};
    var ids = [];
    if (Array.isArray(options.ids)) {
      ids = options.ids.map(Number);
    } else {
      var start = Number(options.start);
      var end = Number(options.end);
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end > 0xffffffff || end < start) {
        return Promise.reject(new TypeError("scanPeerIds requires ids, or a valid start/end range."));
      }
      var maxCount = options.maxCount == null ? 4096 : Number(options.maxCount);
      if (end - start + 1 > maxCount) {
        return Promise.reject(new RangeError("scanPeerIds range is too large; pass ids or raise maxCount intentionally."));
      }
      for (var id = start; id <= end; id += 1) ids.push(id);
    }
    ids = ids.filter(function (id) {
      return Number.isInteger(id) && id > 0 && id <= 0xffffffff && id !== localPeerId;
    });
    var timeoutMs = options.timeoutMs == null ? 2000 : Number(options.timeoutMs);
    var scanId = "scan-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
    var results = new Map();
    var onPeer = typeof options.onPeer === "function" ? options.onPeer : function () {};
    scanRequests.set(scanId, { results: results, onPeer: onPeer });
    ids.forEach(function (id) {
      try {
        sendPacket(PacketType.RPC_REQUEST, JSON.stringify({
          easytierJsPeerScan: 1,
          kind: "probe",
          scanId: scanId,
          localPeerId: localPeerId
        }), id);
      } catch (error) {
        emit("error", error);
      }
    });
    return new Promise(function (resolve) {
      setTimeout(function () {
        scanRequests.delete(scanId);
        resolve(Array.from(results.values()));
      }, timeoutMs);
    });
  }

  var api = Object.freeze({
    PacketType: PacketType,
    PacketFlags: PacketFlags,
    connect: connect,
    disconnect: disconnect,
    currentServer: currentServer,
    status: status,
    listPeers: listPeers,
    send: sendPacket,
    broadcast: broadcast,
    scanPeerIds: scanPeerIds,
    ping: ping,
    on: function (name, listener) {
      if (typeof listener !== "function") throw new TypeError("listener must be a function.");
      if (!events.has(name)) events.set(name, new Set());
      events.get(name).add(listener);
      return function () {
        api.off(name, listener);
      };
    },
    off: function (name, listener) {
      var listeners = events.get(name);
      if (listeners) listeners.delete(listener);
    }
  });

  global.easytier = api;
  global.easytierWebRTC = createWebRtcApi(global, api);

  function createWebRtcApi(globalObject, signaling) {
    var rtcEvents = new Map();
    var peers = new Map();
    var sessions = new Map();
    var apiOptions = { iceServers: null, autoDisconnectEasyTier: false };

    function emitRtc(name, detail) {
      var listeners = rtcEvents.get(name);
      if (!listeners) return;
      listeners.forEach(function (listener) {
        try {
          listener(detail);
        } catch (error) {
          setTimeout(function () { throw error; }, 0);
        }
      });
    }

    function newSessionId() {
      var bytes = new Uint8Array(12);
      globalObject.crypto.getRandomValues(bytes);
      return Array.from(bytes, function (byte) {
        return byte.toString(16).padStart(2, "0");
      }).join("");
    }

    function defaultIceServers(options) {
      return options.iceServers || apiOptions.iceServers || [{ urls: "stun:stun.l.google.com:19302" }];
    }

    function peerSummary(item) {
      return {
        peerId: item.peerId,
        sessionId: item.sessionId,
        ready: item.ready,
        peerConnectionState: item.peer ? item.peer.connectionState : "closed",
        dataChannelState: item.channel ? item.channel.readyState : "closed"
      };
    }

    function emitState(item) {
      emitRtc("state", peerSummary(item));
      emitRtc("peers", status());
    }

    function sendSignal(toPeerId, message) {
      signaling.send(signaling.PacketType.RPC_REQUEST, JSON.stringify({
        easytierJsWebRtc: 1,
        sessionId: message.sessionId,
        kind: message.kind,
        description: message.description,
        candidate: message.candidate
      }), toPeerId);
      emitRtc("signal-sent", { toPeerId: toPeerId, kind: message.kind, sessionId: message.sessionId });
    }

    function parseSignal(packet) {
      if (packet.encrypted || packet.type !== signaling.PacketType.RPC_REQUEST) return null;
      try {
        var message = JSON.parse(new TextDecoder().decode(packet.payload));
        if (message && message.easytierJsWebRtc === 1 && typeof message.kind === "string") return message;
      } catch (_) {
      }
      return null;
    }

    function getBySession(nextSessionId) {
      return sessions.get(nextSessionId) || null;
    }

    function closeItem(item) {
      if (!item) return;
      if (item.channel) item.channel.close();
      if (item.peer) item.peer.close();
      peers.delete(item.peerId);
      sessions.delete(item.sessionId);
      item.ready = false;
    }

    function bindChannel(item, nextChannel) {
      item.channel = nextChannel;
      item.channel.onopen = function () {
        item.ready = true;
        emitRtc("open", peerSummary(item));
        emitState(item);
        if (item.autoDisconnectEasyTier || apiOptions.autoDisconnectEasyTier) {
          signaling.disconnect(1000, "WebRTC connected");
        }
      };
      item.channel.onclose = function () {
        item.ready = false;
        emitRtc("close", peerSummary(item));
        emitState(item);
      };
      item.channel.onerror = function () {
        emitRtc("error", new Error("WebRTC DataChannel error."));
      };
      item.channel.onmessage = function (event) {
        emitRtc("message", { peerId: item.peerId, sessionId: item.sessionId, data: event.data });
      };
    }

    function createPeer(remotePeerId, nextSessionId, options) {
      close(remotePeerId);
      var item = {
        peerId: Number(remotePeerId),
        sessionId: nextSessionId,
        peer: new globalObject.RTCPeerConnection({ iceServers: defaultIceServers(options) }),
        channel: null,
        ready: false,
        pendingCandidates: [],
        autoDisconnectEasyTier: !!options.autoDisconnectEasyTier
      };
      peers.set(item.peerId, item);
      sessions.set(item.sessionId, item);
      item.peer.onicecandidate = function (event) {
        if (event.candidate) {
          sendSignal(item.peerId, {
            kind: "candidate",
            sessionId: item.sessionId,
            candidate: event.candidate.toJSON()
          });
        }
      };
      item.peer.onconnectionstatechange = function () {
        emitState(item);
        if (item.peer.connectionState === "failed" || item.peer.connectionState === "disconnected") {
          item.ready = false;
          emitState(item);
        }
      };
      item.peer.ondatachannel = function (event) {
        bindChannel(item, event.channel);
      };
      emitState(item);
      return item;
    }

    async function addQueuedCandidates(item) {
      while (item.pendingCandidates.length) {
        await item.peer.addIceCandidate(item.pendingCandidates.shift());
      }
    }

    async function connect(remotePeerId, options) {
      if (!globalObject.RTCPeerConnection) throw new Error("This browser does not support WebRTC.");
      options = options || {};
      options.autoDisconnectEasyTier = !!(options.autoDisconnectEasyTier || apiOptions.autoDisconnectEasyTier);
      var nextSessionId = options.sessionId || newSessionId();
      var item = createPeer(Number(remotePeerId), nextSessionId, options);
      bindChannel(item, item.peer.createDataChannel(options.label || "easytier-js"));
      var offer = await item.peer.createOffer();
      await item.peer.setLocalDescription(offer);
      sendSignal(item.peerId, { kind: "offer", sessionId: nextSessionId, description: item.peer.localDescription });
      return peerSummary(item);
    }

    async function connectMany(peerIds, options) {
      if (!Array.isArray(peerIds)) throw new TypeError("peerIds must be an array.");
      var results = [];
      for (var index = 0; index < peerIds.length; index += 1) {
        results.push(await connect(peerIds[index], options || {}));
      }
      return results;
    }

    async function handleSignal(packet, message) {
      var remotePeerId = packet.fromPeerId;
      if (!globalObject.RTCPeerConnection) {
        emitRtc("error", new Error("This browser does not support WebRTC."));
        return false;
      }
      if (message.kind === "offer") {
        var answerItem = createPeer(remotePeerId, message.sessionId, {
          iceServers: apiOptions.iceServers || undefined,
          autoDisconnectEasyTier: apiOptions.autoDisconnectEasyTier
        });
        await answerItem.peer.setRemoteDescription(message.description);
        var answer = await answerItem.peer.createAnswer();
        await answerItem.peer.setLocalDescription(answer);
        await addQueuedCandidates(answerItem);
        sendSignal(remotePeerId, { kind: "answer", sessionId: message.sessionId, description: answerItem.peer.localDescription });
        return true;
      }
      var item = getBySession(message.sessionId);
      if (!item) return false;
      if (message.kind === "answer") {
        await item.peer.setRemoteDescription(message.description);
        await addQueuedCandidates(item);
        return true;
      }
      if (message.kind === "candidate" && message.candidate) {
        var candidate = new globalObject.RTCIceCandidate(message.candidate);
        if (item.peer.remoteDescription) {
          await item.peer.addIceCandidate(candidate);
        } else {
          item.pendingCandidates.push(candidate);
        }
        return true;
      }
      return false;
    }

    signaling.on("packet", function (packet) {
      var message = parseSignal(packet);
      if (!message) return;
      handleSignal(packet, message).catch(function (error) {
        emitRtc("error", error);
      });
    });

    function send(data, peerId) {
      if (peerId == null) return broadcast(data);
      var item = peers.get(Number(peerId));
      if (!item || !item.channel || item.channel.readyState !== "open") {
        throw new Error("WebRTC DataChannel is not open for peer " + peerId + ".");
      }
      item.channel.send(data);
    }

    function broadcast(data) {
      var sent = [];
      peers.forEach(function (item) {
        if (item.channel && item.channel.readyState === "open") {
          item.channel.send(data);
          sent.push(item.peerId);
        }
      });
      if (!sent.length) throw new Error("No open WebRTC DataChannels.");
      return sent;
    }

    function close(peerId) {
      if (peerId != null) {
        closeItem(peers.get(Number(peerId)));
        return;
      }
      Array.from(peers.values()).forEach(closeItem);
    }

    function status() {
      var list = Array.from(peers.values()).map(peerSummary);
      return {
        ready: list.some(function (item) { return item.ready; }),
        peers: list,
        openPeerIds: list.filter(function (item) { return item.ready; }).map(function (item) { return item.peerId; }),
        targetPeerId: list.length === 1 ? list[0].peerId : null
      };
    }

    return Object.freeze({
      connect: connect,
      connectMany: connectMany,
      send: send,
      broadcast: broadcast,
      close: close,
      status: status,
      configure: function (options) {
        apiOptions.iceServers = options && options.iceServers ? options.iceServers : null;
        apiOptions.autoDisconnectEasyTier = !!(options && options.autoDisconnectEasyTier);
      },
      on: function (name, listener) {
        if (typeof listener !== "function") throw new TypeError("listener must be a function.");
        if (!rtcEvents.has(name)) rtcEvents.set(name, new Set());
        rtcEvents.get(name).add(listener);
        return function () {
          var listeners = rtcEvents.get(name);
          if (listeners) listeners.delete(listener);
        };
      }
    });
  }
})(typeof window !== "undefined" ? window : null);
