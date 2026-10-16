import { WebSocketServer, WebSocket } from 'ws';

const port = Number(process.env.PORT) || 8080;
const wss = new WebSocketServer({ port });

console.log(`[LegacyX Server] WebSocket signaling server listening on port ${port}`);

wss.on('connection', (ws: WebSocket) => {
  console.log('[LegacyX Server] New client connected');

  ws.send(JSON.stringify({ type: 'welcome', message: 'LegacyX WebSocket Server Connected' }));

  ws.on('message', (message: string) => {
    console.log(`[LegacyX Server] Received: ${message}`);
  });

  ws.on('close', () => {
    console.log('[LegacyX Server] Client disconnected');
  });
});
