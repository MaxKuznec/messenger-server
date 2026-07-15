const { WebSocketServer } = require('ws');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });
const clients = new Set();

const DB_PATH = path.join(__dirname, 'users.json');

console.log(`🚀 Сервер с верификацией кодов запущен на порту ${PORT}`);

// Временное хранилище кодов (email -> { code, expires })
const verificationCodes = new Map();

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

function saveUsers(users) {
    fs.writeFileSync(DB_PATH, JSON.stringify(users, null, 2));
}

// Хэширование пароля в SHA-256
function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

function isValidEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

wss.on('connection', (ws) => {
    clients.add(ws);
    ws.isAuthenticated = false;
    ws.username = null;
    ws.email = null;

    ws.on('message', (messageBuffer) => {
        try {
            const data = JSON.parse(messageBuffer.toString());
            const users = loadUsers();

            // --- 1. ЗАПРОС КОДА ПОДТВЕРЖДЕНИЯ (Общий для регистрации и сброса) ---
            if (data.type === 'request_code') {
                const email = data.email?.trim().toLowerCase();
                
                if (!email) {
                    return ws.send(JSON.stringify({ type: 'auth_error', error: 'Укажите E-mail!' }));
                }
                if (!isValidEmail(email)) {
                    return ws.send(JSON.stringify({ type: 'auth_error', error: 'Некорректный формат почты!' }));
                }

                const code = Math.floor(1000 + Math.random() * 9000).toString();
                verificationCodes.set(email, {
                    code: code,
                    expires: Date.now() + 5 * 60 * 1000
                });

                console.log(`[CODE GEN] Код для ${email}: ${code}`);

                return ws.send(JSON.stringify({ 
                    type: 'code_generated', 
                    email: email, 
                    code: code 
                }));
            }

            // --- 2. ПОДТВЕРЖДЕНИЕ И РЕГИСТРАЦИЯ ---
            if (data.type === 'register_verify') {
                const email = data.email?.trim().toLowerCase();
                const username = data.username?.trim();
                const password = data.password;
                const userCode = data.code?.trim();

                if (!email || !username || !password || !userCode) {
                    return ws.send(JSON.stringify({ type: 'auth_error', error: 'Все поля и код обязательны!' }));
                }
                if (users[email]) {
                    return ws.send(JSON.stringify({ type: 'auth_error', error: 'Этот E-mail уже зарегистрирован!' }));
                }

                const savedCodeData = verificationCodes.get(email);
                if (!savedCodeData || savedCodeData.code !== userCode || Date.now() > savedCodeData.expires) {
                    return ws.send(JSON.stringify({ type: 'auth_error', error: 'Неверный или устаревший код!' }));
                }

                verificationCodes.delete(email);

                users[email] = {
                    email: email,
                    username: username,
                    passwordHash: hashPassword(password),
                    status: data.status || "Новенький 🚀"
                };
                saveUsers(users);

                ws.isAuthenticated = true;
                ws.username = username;
                ws.email = email;
                return ws.send(JSON.stringify({ type: 'auth_success', username: username, status: users[email].status }));
            }

            // --- 3. СБРОС И ИЗМЕНЕНИЕ ПАРОЛЯ ---
            if (data.type === 'reset_password') {
                const email = data.email?.trim().toLowerCase();
                const newPassword = data.newPassword;
                const userCode = data.code?.trim();

                if (!email || !newPassword || !userCode) {
                    return ws.send(JSON.stringify({ type: 'auth_error', error: 'Заполните все поля!' }));
                }
                if (!users[email]) {
                    return ws.send(JSON.stringify({ type: 'auth_error', error: 'Пользователь с такой почтой не найден!' }));
                }

                const savedCodeData = verificationCodes.get(email);
                if (!savedCodeData || savedCodeData.code !== userCode || Date.now() > savedCodeData.expires) {
                    return ws.send(JSON.stringify({ type: 'auth_error', error: 'Неверный или просроченный код!' }));
                }

                verificationCodes.delete(email);

                // Перезаписываем хэш нового пароля
                users[email].passwordHash = hashPassword(newPassword);
                saveUsers(users);

                console.log(`[PASSWORD RESET] Успешный сброс для ${email}`);

                ws.isAuthenticated = true;
                ws.username = users[email].username;
                ws.email = email;
                return ws.send(JSON.stringify({ type: 'auth_success', username: users[email].username, status: users[email].status }));
            }

            // --- 4. ВХОД ---
            if (data.type === 'login') {
                const email = data.email?.trim().toLowerCase();
                const password = data.password;

                if (!email || !password) {
                    return ws.send(JSON.stringify({ type: 'auth_error', error: 'Заполните все поля!' }));
                }

                const user = users[email];
                if (!user || user.passwordHash !== hashPassword(password)) {
                    return ws.send(JSON.stringify({ type: 'auth_error', error: 'Неверная почта или пароль!' }));
                }

                ws.isAuthenticated = true;
                ws.username = user.username;
                ws.email = email;
                return ws.send(JSON.stringify({ type: 'auth_success', username: user.username, status: user.status }));
            }

            // --- 5. ОБЫЧНЫЕ СООБЩЕНИЯ ---
            if (data.type === 'message') {
                if (!ws.isAuthenticated) {
                    return ws.send(JSON.stringify({ type: 'sys_err', text: 'Пожалуйста, сначала авторизуйтесь.' }));
                }

                let responseData = { ...data };
                responseData.timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                const broadcastData = JSON.stringify(responseData);

                for (const client of clients) {
                    if (client.readyState === 1 && client.isAuthenticated) {
                        client.send(broadcastData);
                    }
                }
                return;
            }

            // --- 6. СТАТУС ПЕЧАТИ ---
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
