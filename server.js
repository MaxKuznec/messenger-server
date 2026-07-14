const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });
const clients = new Set();

console.log(`🚀 Глобальный сервер запущен на порту ${PORT}`);

wss.on('connection', (ws) => {
    clients.add(ws);

    ws.on('message', (messageBuffer) => {
        try {
            const data = JSON.parse(messageBuffer.toString());
            
            // Если это обычное сообщение, добавляем красивое время отправки
            let responseData = { ...data };
            if (data.type === 'message') {
                responseData.timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            }
            
            const broadcastData = JSON.stringify(responseData);

            // Рассылаем событие всем подключенным пользователям
            for (const client of clients) {
                if (client.readyState === 1) {
                    client.send(broadcastData);
                }
            }
        } catch (e) { 
            console.error('Ошибка обработки сообщения:', e.message); 
        }
    });

    ws.on('close', () => clients.delete(ws));
});
