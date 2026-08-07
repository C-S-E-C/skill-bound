# ET PACKETS
CurStat = {
    ETloading: 0,
    PrivateRoom: 1,
    OpenToPublic: 2,
}

packetTypes = {
    RequestPair: 0,
    RefusePair: 1,
    AcceptPair: 2,
    RedirectPair: 3,
    UpdatePair: 4,
}

modes = {
    1: "1vs1",
    2: "2vs2",
    3: "3vs3",
    4: "4vs4",
}
# Examples
## requestPair
{
    "type": 0,
    "data": {
        "mode": 1,
        "map": "map1",
        "players": {
            "teamA": [
                { "name": "player1", "id": 1234567890 },
            ],
            "teamB": [
                { "name": "player2", "id": 9876543210 },
            ]
        }
    }
}


#example packet

------------      -----------------
|    P1     |      |    P2     |
|PairRequest| =>   |AcceptPair|
|()
-------------     -----------------