(function reuseTopRuntime(global) {
    "use strict";

    var topWindow = global.top && global.top !== global ? global.top : global;
    ["easytier", "easytierWebRTC", "CryptoJS", "TOTP", "generateRandomBase32Secret", "SimpleAES", "RSA_TOOL", "shell"].forEach(function (name) {
        if (topWindow[name] && !global[name]) global[name] = topWindow[name];
    });

    if (topWindow.RTCPeerConnection && !global.RTCPeerConnection) {
        global.RTCPeerConnection = topWindow.RTCPeerConnection;
    }
})(window);
