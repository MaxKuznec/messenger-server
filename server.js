            // --- 1. ЗАПРОС КОДА ПОДТВЕРЖДЕНИЯ ---
            if (data.type === 'request_code') {
                const email = data.email?.trim().toLowerCase();
                
                if (!email) {
                    return ws.send(JSON.stringify({ type: 'auth_error', error: 'Укажите E-mail!' }));
                }
                if (!isValidEmail(email)) {
                    return ws.send(JSON.stringify({ type: 'auth_error', error: 'Некорректный формат почты!' }));
                }
                if (users[email]) {
                    return ws.send(JSON.stringify({ type: 'auth_error', error: 'Этот E-mail уже зарегистрирован!' }));
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
