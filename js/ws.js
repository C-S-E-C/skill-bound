sessionStorage.setItem(
    "WSServer",
    fetch("https://skill-bound.syntropica.top/dynamic.json").then((res) =>
        res.json(),
    )["WSSever"],
);
const socket = new WebSocket(sessionStorage.getItem("WSServer"));

socket.onopen = function () {
    if (sessionStorage.getItem("economy")) {
        socket.send(
            JSON.stringify({
                action: "verify_jwt",
                jwt: sessionStorage.getItem("economy"),
            }),
        );
    } else {
        socket.send(
            JSON.stringify({
                action: "init_coins",
                secret: localStorage.getItem("secret"),
            }),
        );
    }
};
socket.onmessage = function (event) {
    const data = JSON.parse(event.data);
    if (data["action"] == "verify_jwt") {
        if (data["code"] != 0) {
            socket.send(
                JSON.stringify({
                    action: "init_coins",
                    secret: localStorage.getItem("secret"),
                }),
            );
        }
    } else if (data["action"] == "init_coins") {
        if (data["code"] == 0) {
            sessionStorage.setItem("economy", data["jwt"]);
        }
    }
};
