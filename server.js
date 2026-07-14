const { WebSocketServer } = require('ws');

// Запускаем WebSocket-сервер на порту 8080
const PORT = 8080;
const wss = new WebSocketServer({ port: PORT });

// Список всех активных подключений
const clients = new Set();

console.log(`🚀 Сервер мессенджера успешно запущен на порту ${PORT}...`);

wss.on('connection', (ws) => {
    // Добавляем новое устройство в список подключенных
    clients.add(ws);
    console.log(`📡 Новое подключение! Всего активных пользователей: ${clients.size}`);

    // Отправляем приветственное системное сообщение только что подключившемуся
    const welcomeMessage = JSON.stringify({
        sender: "Система",
        text: "Вы успешно подключились к серверу!",
        timestamp: new Date().toLocaleTimeString()
    });
    ws.send(welcomeMessage);

    // Обработка входящих сообщений от устройств
    ws.on('message', (messageBuffer) => {
        try {
            // Переводим входящий буфер в строку
            const messageString = messageBuffer.toString();
            console.log(`📩 Получено сырое сообщение: ${messageString}`);
            
            // Парсим JSON, который прислал клиент
            const parsedMessage = JSON.parse(messageString);
            
            // Формируем чистый объект сообщения для рассылки
            const broadcastData = JSON.stringify({
                sender: parsedMessage.sender || "Аноним",
                text: parsedMessage.text || "",
                timestamp: new Date().toLocaleTimeString()
            });

            // Рассылаем это сообщение абсолютно всем активным клиентам
            for (const client of clients) {
                if (client.readyState === 1) { // 1 означает, что соединение открыто (OPEN)
                    client.send(broadcastData);
                }
            }
        } catch (error) {
            console.error('⚠️ Ошибка при обработке сообщения:', error.message);
        }
    });

    // Обработка отключения пользователя
    ws.on('close', () => {
        clients.delete(ws);
        console.log(`🔌 Пользователь отключился. Осталось активных: ${clients.size}`);
    });

    // Обработка непредвиденных ошибок сокета
    ws.on('error', (error) => {
        console.error('❌ Ошибка сокета:', error.message);
        clients.delete(ws);
    });
});
