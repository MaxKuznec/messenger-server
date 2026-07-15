const { WebSocketServer } = require('ws');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });
const clients = new Set();

// Путь к файлу-базе данных пользователей
const DB_PATH = path.join(__dirname, 'users.json');

console.log(`🚀 Глобальный защищенный сервер запущен на порту ${PORT}`);

// Функция чтения пользователей из файла
function loadUsers() {
    if (!fs.existsSync(DB_PATH)) {
        fs.writeFileSync(DB_PATH, JSON.stringify({}));
    }
    try {
        const data = fs.readFileSync(DB_PATH, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        return {};
    }
}

// Функция записи пользователей в файл
function saveUsers(users) {
    fs.writeFileSync(DB_PATH, JSON.stringify(users, null, 2));
}

// Безопасное хэширование пароля
function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

wss.on('connection', (ws) => {
    clients.add(ws);
    ws.isAuthenticated = false; // По умолчанию клиент не авторизован
    ws.username = null;

    ws.on('message', (messageBuffer) => {
        try {
            const data = JSON.parse(messageBuffer.toString());
            const users = loadUsers();

            // --- ОБРАБОТКА РЕГИСТРАЦИИ ---
            if (data.type === 'register') {
                const username = data.username?.trim();
                const password = data.password;

                if (!username || !password) {
                    return ws.send(JSON.stringify({ type: 'auth_error', error: 'Заполните все поля!' }));
                }

                if (users[username.toLowerCase()]) {
                    return ws.send(JSON.stringify({ type: 'auth_error', error: 'Этот никнейм уже занят!' }));
                }

                // Сохраняем нового пользователя
                users[username.toLowerCase()] = {
                    originalName: username,
                    passwordHash: hashPassword(password),
                    status: data.status || "Новенький 🚀"
                };
                saveUsers(users);

                ws.isAuthenticated = true;
                ws.username = username;
                return ws.send(JSON.stringify({ type: 'auth_success', username: username }));
            }

            // --- ОБРАБОТКА ВХОДА ---
            if (data.type === 'login') {
                const username = data.username?.trim();
                const password = data.password;

                if (!username || !password) {
                    return ws.send(JSON.stringify({ type: 'auth_error', error: 'Заполните все поля!' }));
                }

                const user = users[username.toLowerCase()];
                if (!user || user.passwordHash !== hashPassword(password)) {
                    return ws.send(JSON.stringify({ type: 'auth_error', error: 'Неверный никнейм или пароль!' }));
                }

                ws.isAuthenticated = true;
                ws.username = user.originalName;
                return ws.send(JSON.stringify({ 
                    type: 'auth_success', 
                    username: user.originalName, 
                    status: user.status 
                }));
            }

            // --- ОБРАБОТКА ОБЫЧНЫХ СООБЩЕНИЙ ---
            if (data.type === 'message') {
                // Блокируем сообщения от неавторизованных сессий
                if (!ws.isAuthenticated) {
                    return ws.send(JSON.stringify({ type: 'sys_err', text: 'Пожалуйста, сначала авторизуйтесь.' }));
                }

                let responseData = { ...data };
                responseData.timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                const broadcastData = JSON.stringify(responseData);

                // Рассылаем всем авторизованным пользователям
                for (const client of clients) {
                    if (client.readyState === 1 && client.isAuthenticated) {
                        client.send(broadcastData);
                    }
                }
                return;
            }

            // --- ОБРАБОТКА СТАТУСА ПЕЧАТИ ---
            if (data.type === 'typing') {
                if (!ws.isAuthenticated) return;
                
                const broadcastData = JSON.stringify(data);
                for (const client of clients) {
                    if (client.readyState === 1 && client.isAuthenticated) {
                        client.send(broadcastData);
                    }
                }
            }

        } catch (e) { 
            console.error('Ошибка обработки сообщения:', e.message); 
        }
    });

    ws.on('close', () => clients.delete(ws));
});
