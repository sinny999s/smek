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
    const x = Math.floor(Math.random() * gridSize) - halfGrid;
    const z = Math.floor(Math.random() * gridSize) - halfGrid;
    return { x, y: 0, z };
}

function placeFood() {
    food = getRandomPosition();
}

function resetPlayer(player) {
    player.snake = [getRandomPosition()];
    player.score = 0;
    player.isDead = false;
}

wss.on('connection', (ws) => {
    console.log('Client connected');
    const clientId = Date.now() + Math.random();

    players[clientId] = {
        id: clientId,
        snake: [getRandomPosition()],
        direction: { x: 1, y: 0, z: 0 },
        color: `hsl(${Math.random() * 360}, 100%, 70%)`,
        sequence: 0,
        score: 0,
        isSprinting: false,
        isDead: false,
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
                if (newDirection.x !== -currentDirection.x || newDirection.z !== -currentDirection.z) {
                    player.direction = newDirection;
                    player.sequence = data.sequence;
                }
            } else if (data.type === 'sprint_change') {
                player.isSprinting = data.isSprinting;
            } else if (data.type === 'restart_game') {
                resetPlayer(player);
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
    for (const id in players) {
        const player = players[id];
        if (player.isDead) continue;

        const moveInterval = player.isSprinting ? 75 : 150; // Sprint is twice as fast
        if (Date.now() - (player.lastMoveTime || 0) < moveInterval) {
            continue;
        }
        player.lastMoveTime = Date.now();

        const head = { ...player.snake[0] };
        head.x += player.direction.x;
        head.z += player.direction.z;

        // Wall collision
        if (head.x >= halfGrid || head.x < -halfGrid || head.z >= halfGrid || head.z < -halfGrid) {
            player.isDead = true;
            continue;
        }
        
        // Self collision
        for(let i = 1; i < player.snake.length; i++) {
            if(head.x === player.snake[i].x && head.z === player.snake[i].z) {
                player.isDead = true;
                break;
            }
        }
        if(player.isDead) continue;

        player.snake.unshift(head);

        if (head.x === food.x && head.z === food.z) {
            player.score++;
            placeFood();
        } else {
            // Shrink snake while sprinting
            if (player.isSprinting && player.snake.length > 2 && sprintTick % 4 === 0) {
                player.snake.pop(); // Shrink twice
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
setInterval(gameLoop, 25); // Run loop more frequently for smoother sprint checks

server.listen(PORT, () => {
    console.log(`HTTP and WebSocket server started on port ${PORT}`);
