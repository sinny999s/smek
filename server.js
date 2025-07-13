const WebSocket = require('ws');
const http = require('http');

const PORT = process.env.PORT || 8080;

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Server is alive and running.');
});

const wss = new WebSocket.Server({ server });

const gridSize = 20;
const halfGrid = gridSize / 2;
const players = {};
let food = {};

function getRandomPosition() {
    const x = Math.floor(Math.random() * gridSize) - halfGrid + 0.5;
    const z = Math.floor(Math.random() * gridSize) - halfGrid + 0.5;
    return { x, y: 0, z };
}

function placeFood() {
    food = getRandomPosition();
}

function resetPlayer(player) {
    player.snake = [getRandomPosition()];
    player.score = 0;
    player.isDead = false;
    player.direction = { x: 1, y: 0, z: 0 };
    player.lastMoveTime = 0;
}

wss.on('connection', (ws) => {
    console.log('Client connected');
    const clientId = Date.now() + Math.random(); 

    players[clientId] = {
        id: clientId,
        name: `Player ${Math.floor(clientId % 1000)}`,
        snake: [getRandomPosition()],
        direction: { x: 1, y: 0, z: 0 },
        color: `hsl(${Math.random() * 360}, 100%, 70%)`,
        score: 0,
        isSprinting: false,
        isDead: false,
        lastMoveTime: 0
    };

    ws.send(JSON.stringify({ type: 'assign_id', id: clientId }));

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            const player = players[clientId];
            if (!player) return;

            if (data.type === 'direction_change') {
                const newDirection = data.direction;
                const currentDirection = player.direction;
                // Simplified and corrected 180-degree turn prevention
                if (newDirection.x !== -currentDirection.x || newDirection.z !== -currentDirection.z) {
                    player.direction = newDirection;
                }
            } else if (data.type === 'sprint_change') {
                player.isSprinting = data.isSprinting;
            } else if (data.type === 'restart_game') {
                if(player.isDead) {
                   resetPlayer(player);
                }
            }
        } catch (e) {
            console.error("Failed to parse message:", e);
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected');
        delete players[clientId];
    });
});

let sprintTick = 0;
function gameLoop() {
    sprintTick++;
    const allPlayerPositions = new Map();
    for (const id in players) {
        players[id].snake.forEach(seg => {
            const key = `${seg.x},${seg.z}`;
            if (!allPlayerPositions.has(key)) {
                allPlayerPositions.set(key, []);
            }
            allPlayerPositions.get(key).push(id);
        });
    }

    for (const id in players) {
        const player = players[id];
        if (player.isDead) continue;

        const moveInterval = player.isSprinting ? 75 : 150; 
        if (Date.now() - player.lastMoveTime < moveInterval) {
            continue;
        }
        player.lastMoveTime = Date.now();

        const head = { ...player.snake[0] };
        head.x += player.direction.x;
        head.z += player.direction.z;

        // Wall collision
        if (head.x >= halfGrid || head.x <= -halfGrid || head.z >= halfGrid || head.z <= -halfGrid) {
            player.isDead = true;
            continue;
        }
        
        // Self and other player collision
        const posKey = `${head.x},${head.z}`;
        if (allPlayerPositions.has(posKey)) {
            player.isDead = true;
            continue;
        }

        player.snake.unshift(head);

        if (Math.abs(head.x - food.x) < 0.5 && Math.abs(head.z - food.z) < 0.5) {
            player.score++;
            placeFood();
        } else {
            if (player.isSprinting && player.snake.length > 3 && sprintTick % 3 === 0) {
                player.snake.pop(); 
            }
            player.snake.pop();
        }
    }

    const gameState = { type: 'game_update', players, food };
    const stateString = JSON.stringify(gameState);

    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(stateString);
        }
    });
}

placeFood();
setInterval(gameLoop, 30); 

server.listen(PORT, () => {
    console.log(`HTTP and WebSocket server started on port ${PORT}`);
});
