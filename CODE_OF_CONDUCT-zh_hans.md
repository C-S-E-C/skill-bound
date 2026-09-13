# 行为准则与开发者指南

- [English](CODE_OF_CONDUCT.md)

## 目录

- [行为准则与开发者指南](#行为准则与开发者指南)
  - [目录](#目录)
  - [行为准则](#行为准则)
    - [建议行为](#建议行为)
    - [不可接受的行为](#不可接受的行为)
    - [问题报告](#问题报告)
  - [开发者指南](#开发者指南)
    - [项目目标](#项目目标)
    - [版本命名](#版本命名)
    - [当前架构](#当前架构)
    - [开发流程](#开发流程)
    - [EasyTier 协议](#easytier-协议)
      - [连接](#连接)
      - [数据包格式](#数据包格式)
      - [战斗切换](#战斗切换)
    - [WebRTC 协议](#webrtc-协议)
    - [EasyTier 到 WebRTC 的交接](#easytier-到-webrtc-的交接)
    - [调试与验证](#调试与验证)

## 行为准则

本项目希望成为一个协作、尊重并重视安全的软件项目。所有贡献者、维护者、审查者和使用者都应以善意参与项目。

### 建议行为

- 尊重他人，以建设性、准确的方式讨论代码和设计。
- 默认相信对方的善意，同时直接指出技术和安全问题。
- 在条件允许时说明修改建议背后的原因。
- 代码审查应关注实现和影响，不针对个人。
- 保护用户隐私，不提交凭据、令牌、私钥或个人数据。
- 优先提供可复现的错误报告、测试和文档，而不是无依据的推测。
- 遵守项目范围、许可证要求以及被测试系统的授权边界。

### 不可接受的行为

以下行为不可接受：

- 骚扰、歧视、威胁、人身攻击或故意恐吓。
- 未经许可公开他人私人信息。
- 凭据窃取、钓鱼、恶意软件、未授权访问，或攻击不属于自己或没有测试授权的系统。
- 故意绕过身份验证、审核、访问控制、配额或安全限制。
- 提交恶意代码、隐藏后门或故意欺骗性的修改。
- 通过垃圾信息、恶意重复报告或明知虚假的信息破坏项目。

### 问题报告

请私下向项目维护者报告行为或安全问题，不要公开发布敏感细节。报告应包含足够的上下文以复现或理解问题，但不要包含密码、令牌、私钥或其他秘密信息。

维护者可以移除、编辑或拒绝违反本政策的贡献。处理措施应与行为严重程度相称，并保持一致。

## 开发者指南

本章节记录当前实现约定和网络模型，是面向贡献者的实践指南，不能替代源代码或协议实现本身。

### 项目目标

本项目是一个基于浏览器的 Skill Bound 应用，包含配对、Dashboard、2D 战斗页面、离线资源缓存以及点对点战斗通信。实现目标包括：

- 保证应用可以在浏览器以及基于 iframe 的外层 Shell 中运行；
- 保证多人配对和战斗开始信令可靠；
- 在玩家发现和协商连接期间使用 EasyTier；
- WebRTC DataChannel 就绪后，将战斗数据切换到 WebRTC；
- 通过 `flist.json` 对资源进行版本管理和完整性校验。

### 版本命名

版本使用以下格式：

```text
v{大版本}[.{子版本}][b{beta版本号}][p{patch版本号}]
```

方括号表示可选部分。例如：

```text
v3
v3.0
v3.0b2
v3.0b2p3
v3.1p1
```

各部分含义如下：

- `大版本`：不兼容变更或主要产品变更；
- `子版本`：同一大版本中的兼容功能更新；
- `bN`：第 `N` 个 Beta 版本；
- `pN`：第 `N` 个补丁或维护版本。

例如 `v3.0b2p3` 表示大版本 3、子版本 0、Beta 2、补丁 3。没有实际含义的部分不要添加。版本字符串应在发布说明、Git 标签和用户可见更新信息中保持一致。

缓存清单会另外保存一个数字发布序列：

```json
{
    "this": { "name": "Release description", "id": 3 },
    "lastRequiredUpdate": 1
}
```

其中：

- `this.id`：当前可用的最新发布序列；
- `lastRequiredUpdate`：允许继续运行的最低发布序列。

如果客户端版本低于 `lastRequiredUpdate`，必须更新；如果客户端版本低于 `this.id` 但不低于最低版本，则提示可选更新。

`flist.py` 用于生成新清单并递增 `this.id`。选择 `Force update?` 后，会把 `lastRequiredUpdate` 设置为新的版本 ID。`checkflist.py` 只负责修复 MD5、删除不存在的文件、重新计算 `requiredBytes` 并校验版本元数据，不应静默创建新版本。

### 当前架构

当前应用主要由以下层组成：

1. **根 Shell**
   - `index.html` 是外层 Shell。
   - 它加载 `crypto.min.js`、`easytier.js` 和 `shell.js`。
   - 它下载并校验 `flist.json` 中列出的资源。
   - 它注册 Service Worker，并将 `/app_files/index.html` 加载到 `#app-frame`。

2. **应用页面**
   - `app_files/index.html` 是应用入口页。
   - `login.html`、`signup.html`、`lang.html` 和 `dashboard.html` 负责登录、注册、语言和导航流程。
   - `pair.html` 与 `app_files/js/pair.js` 负责节点发现、房间、队伍和战斗开始投票。
   - `battle.html` 是战斗场景页面。
   - `app_files/js/battle.js` 负责战斗状态、移动、消息和游戏循环。
   - `app_files/js/battle-render.js` 负责地图、相机、精灵和玩家渲染。

3. **共享运行时**
   - `app_files/js/runtime.js` 将外层窗口的共享服务暴露给 iframe 页面。
   - 普通脚本有意共享全局变量。除非同步调整加载顺序和全局访问方式，否则不要随意改成 ES Module。

4. **资源与本地化层**
   - `app_files/css` 下的 CSS 提供全局和页面专用样式。
   - 翻译资源以及翻译 class 提供可见文本的本地化。
   - `flist.json` 是缓存与更新清单，包含 URL、source、MD5 和资源总字节数。

5. **传输层**
   - EasyTier 负责节点发现、配对消息和临时 WebRTC 信令。
   - WebRTC DataChannel 在协商完成后承载战斗消息。

### 开发流程

1. 修改前先读取相关 HTML、JavaScript 和 CSS。
2. 除非明确涉及根 Shell 或共享传输层，页面修改应放在 `app_files` 内。
3. 除非需求明确要求，否则保留现有 `<title>`。
4. 保持普通脚本的加载顺序。`battle.html` 必须在 `battle.js` 前加载 `battle-render.js`。
5. 在所有需要的战斗 peer 完成 WebRTC 交接前，不要断开 EasyTier。
6. 缓存资源发生变化时更新 `flist.json`，并验证所有 MD5 与 `requiredBytes`。
7. 提交前执行语法和空白检查：

```text
node --check <changed-javascript-file>
python -m py_compile flist.py checkflist.py
python checkflist.py
git diff --check
```

8. 至少测试受影响页面、新缓存、已有缓存、单人场景；网络修改还应测试多人场景。

### EasyTier 协议

项目使用 `js/easytier.js` 中的 EasyTier JavaScript 客户端。

#### 连接

客户端连接配置的 EasyTier WebSocket 服务端，并使用项目网络名 `skillbound`。连接成功后会得到本地数字 `peerId`。多次调用 `connect()` 必须串行化，或先通过 `status().connected` 判断；如果连接已经健康存在，不应因为 `EasyTier is already connected` 而拆除连接。

#### 数据包格式

EasyTier 使用内部二进制数据包封装和数据包类型，包括 data、handshake、ping、pong、RPC request 和 RPC response。应用层配对消息是通过 EasyTier RPC 数据包传输的 JSON，并使用以下协议标识：

```text
skillbound.pairing.v2
```

配对数据包类型包括 `RequestPair`、`AcceptPair`、`UpdatePair`、`StartBattle` 和 `TeamChange`。房间快照包含房间 ID、peer 列表、玩家列表、地图和队伍状态。

配对消息属于应用层消息。处理前必须校验协议名、发送方身份以及当前房间状态。

#### 战斗切换

所有必要玩家投票开始后，房主通过 EasyTier 向每个 peer 发送 `StartBattle` 快照，然后本地跳转。接收方保存相同的 `battlePeers`、`battlePlayers`、房间/会话 ID 和地图到 `sessionStorage`，然后跳转到 `battle.html`。

在跳转过程中 EasyTier 保持连接，由战斗页继续使用它进行 WebRTC 信令。

### WebRTC 协议

WebRTC 通过 `js/easytier.js` 中的 `easytierWebRTC` 暴露。它的信令通过 EasyTier 传输，信令类型包括：

- `offer`
- `answer`
- `candidate`

每个 WebRTC 会话都有生成的 `sessionId` 和数字远端 `peerId`。发起方调用 `connect(peerId, options)` 创建 offer；接收方创建 answer。ICE candidate 通过 EasyTier 交换，直到 RTCPeerConnection 和 DataChannel 建立。

`connectMany(peerIds, options)` 会顺序建立多个出站连接。战斗代码明确使用：

```js
{ autoDisconnectEasyTier: false, sessionId }
```

WebRTC 状态对象包含：

```json
{
    "ready": true,
    "peers": [],
    "openPeerIds": [2159518483],
    "targetPeerId": 2159518483
}
```

战斗消息通过 JSON DataChannel envelope 传输：

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

接收方会校验 battle 协议和 session ID，处理 payload，并可以把新 envelope 转发给其他已打开的 peer。消息 ID 用于避免重复转发。

### EasyTier 到 WebRTC 的交接

预期交接流程如下：

1. 配对阶段通过 EasyTier 完成。
2. 房主向所有参与者发送 `StartBattle`。
3. 所有参与者在 EasyTier 保持连接的情况下跳转到 `battle.html`。
4. 房主使用 `connectMany()` 连接所有其他战斗 peer。
5. 非房主等待房主的 WebRTC offer。
6. 每个 DataChannel 打开后，向直接连接的 peer 发送战斗层 `webrtc_ready` payload。
7. 页面必须同时等待：
   - 所有必要 DataChannel 出现在 `openPeerIds` 中；
   - 从每个必要 peer 收到 `webrtc_ready` 确认。
8. 只有两个条件都满足后，才允许调用：

```js
easytier.disconnect(1000, "WebRTC handoff complete");
```

多人战斗交接时不要启用 `autoDisconnectEasyTier`。多人房间中，第一个 `open` 事件不代表全部连接完成。连接失败或超时时应保留信令连接以便诊断，不要提前断开。

单人战斗没有必要的远端 WebRTC peer，因此可以继续保留 EasyTier；此时不存在需要完成的点对点交接。

### 调试与验证

有用的状态字段包括：

- EasyTier 连接状态和本地 peer ID；
- WebRTC 的 `ready`、`peerConnectionState` 和 `dataChannelState`；
- `openPeerIds` 与期望的 peer ID；
- 信令事件（`offer`、`answer`、`candidate`）；
- battle envelope 的协议和 session ID。

一次成功的连接通常会显示 answer、至少一次 candidate 交换、`dataChannelState: "open"`、`peerConnectionState: "connected"` 和 battle `message`。如果只有一端记录 WebRTC 状态，首先检查双方是否加载了相同缓存版本的 `battle.js`、`battlePeers` 是否保存了 EasyTier 数字 peer ID，以及 EasyTier 是否在信令完成前被断开。
