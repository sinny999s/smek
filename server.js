const WebSocket = require('ws');

// Render provides the port via an environment variable.
// We fall back to 8080 for local testing.
const PORT = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: PORT });

// --- Game State (Managed by the Server) ---
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

// --- Server Connection Logic ---
wss.on('connection', (ws) => {
    console.log('Client connected');
    const clientId = Date.now() + Math.random(); // More robust unique ID

    // Create a new player
    players[clientId] = {
        id: clientId,
        snake: [ getRandomPosition() ],
        direction: { x: 1, y: 0, z: 0 },
        color: `hsl(${Math.random() * 360}, 100%, 50%)`
    };

    ws.send(JSON.stringify({ type: 'assign_id', id: clientId }));

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            if (data.type === 'direction_change' && players[clientId]) {
                const newDirection = data.direction;
                const currentDirection = players[clientId].direction;
                if (newDirection.x !== -currentDirection.x || newDirection.z !== -currentDirection.z) {
                    players[clientId].direction = newDirection;
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

// --- Main Game Loop ---
function gameLoop() {
    for (const id in players) {
        const player = players[id];
        const head = { ...player.snake[0] };

        head.x += player.direction.x;
        head.z += player.direction.z;

        if (head.x >= halfGrid || head.x < -halfGrid || head.z >= halfGrid || head.z < -halfGrid) {
            player.snake = [getRandomPosition()];
            continue;
        }

        player.snake.unshift(head);

        if (head.x === food.x && head.z === food.z) {
            placeFood();
        } else {
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
setInterval(gameLoop, 150);

console.log(`WebSocket server started on port ${PORT}`);
