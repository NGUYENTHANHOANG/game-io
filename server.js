const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);

app.use(express.static('public'));

let players = {};
let foods = [];
const MAP_SIZE = 2000; // Độ rộng bản đồ
const MAX_BOTS = 12;

for (let i = 0; i < 400; i++) { spawnFood(); }

function spawnFood() {
    foods.push({
        x: Math.random() * MAP_SIZE - MAP_SIZE/2,
        y: Math.random() * MAP_SIZE - MAP_SIZE/2,
        color: `hsl(${Math.random() * 360}, 100%, 50%)`
    });
}

io.on('connection', (socket) => {
    socket.on('initPlayer', (data) => {
        players[socket.id] = {
            x: Math.random() * 400 - 200,
            y: Math.random() * 400 - 200,
            r: 20,
            color: `hsl(${Math.random() * 360}, 100%, 50%)`,
            isBot: false,
            name: data.name || "Vô danh"
        };
        socket.emit('currentPlayers', players);
        socket.emit('currentFoods', foods);
        io.emit('newPlayer', { id: socket.id, player: players[socket.id] });
    });

    socket.on('playerMovement', (data) => {
        if (players[socket.id]) {
            // CHẶN DI CHUYỂN XUYÊN BIÊN GIỚI
            players[socket.id].x = Math.max(-MAP_SIZE/2, Math.min(MAP_SIZE/2, data.x));
            players[socket.id].y = Math.max(-MAP_SIZE/2, Math.min(MAP_SIZE/2, data.y));
            
            socket.broadcast.emit('playerMoved', { id: socket.id, x: players[socket.id].x, y: players[socket.id].y });
            checkEatFood(socket.id);
        }
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
        io.emit('playerDisconnected', socket.id);
    });
});

setInterval(() => {
    // Tạo Bot
    if (Object.keys(players).length < MAX_BOTS) {
        let botId = 'bot_' + Math.random().toString(36).substr(2, 5);
        players[botId] = { 
            x: Math.random() * MAP_SIZE - MAP_SIZE/2, 
            y: Math.random() * MAP_SIZE - MAP_SIZE/2, 
            r: 18, color: '#666', isBot: true, name: "Sát Thủ Bot" 
        };
        io.emit('newPlayer', { id: botId, player: players[botId] });
    }

    for (let id in players) {
        if (players[id].isBot) {
            let bot = players[id];
            let target = null;
            let minDist = 500;

            // Bot tìm người chơi nhỏ hơn để đuổi theo
            for (let pid in players) {
                if (pid !== id && players[pid].r < bot.r * 0.9) {
                    let d = Math.hypot(bot.x - players[pid].x, bot.y - players[pid].y);
                    if (d < minDist) { minDist = d; target = players[pid]; }
                }
            }

            // Nếu không có người để đuổi, đi tìm hạt thức ăn
            if (!target) {
                foods.forEach(f => {
                    let d = Math.hypot(bot.x - f.x, bot.y - f.y);
                    if (d < 300 && d < minDist) { minDist = d; target = f; }
                });
            }

            if (target) {
                let angle = Math.atan2(target.y - bot.y, target.x - bot.x);
                bot.x += Math.cos(angle) * 3;
                bot.y += Math.sin(angle) * 3;
            }

            bot.x = Math.max(-MAP_SIZE/2, Math.min(MAP_SIZE/2, bot.x));
            bot.y = Math.max(-MAP_SIZE/2, Math.min(MAP_SIZE/2, bot.y));
            io.emit('playerMoved', { id: id, x: bot.x, y: bot.y });
            checkEatFood(id);
        }
    }
    checkPlayerEating();
}, 1000 / 30);

function checkEatFood(pid) {
    let p = players[pid]; if(!p) return;
    for (let i = foods.length - 1; i >= 0; i--) {
        if (Math.hypot(p.x - foods[i].x, p.y - foods[i].y) < p.r) {
            p.r += 0.4; foods.splice(i, 1); spawnFood();
            io.emit('foodEaten', { foodIndex: i, newFood: foods[foods.length-1], playerId: pid, newRadius: p.r });
        }
    }
}

function checkPlayerEating() {
    let ids = Object.keys(players);
    for (let i of ids) {
        for (let j of ids) {
            if (i === j) continue;
            let p1 = players[i], p2 = players[j];
            if (!p1 || !p2) continue;
            let dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
            if (dist < p1.r && p1.r > p2.r * 1.1) {
                p1.r += p2.r * 0.5;
                p2.x = Math.random() * MAP_SIZE - MAP_SIZE/2; p2.y = Math.random() * MAP_SIZE - MAP_SIZE/2; p2.r = 20;
                io.emit('playerEaten', { winnerId: i, loserId: j, newWinnerRadius: p1.r, newLoserX: p2.x, newLoserY: p2.y });
            }
        }
    }
}
server.listen(3000, () => console.log('Game chay tai http://localhost:3000'));