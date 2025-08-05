// Инициализация Telegram Web App
const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

// Глобальные переменные
let currentUser = null;
let chatHistory = [];
let selectedModel = null;

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', () => {
    // Получаем данные пользователя
    currentUser = tg.initDataUnsafe?.user || {
        first_name: 'Гость',
        id: Date.now()
    };
    
    // Отображаем имя пользователя
    document.getElementById('userName').textContent = 
        `Привет, ${currentUser.first_name}!`;
    
    // Загружаем модели
    loadModels();
    
    // Настраиваем главную кнопку
    tg.MainButton.text = "Оставить заявку";
    tg.MainButton.onClick(() => showLeadForm());
    tg.MainButton.show();
});

// Загрузка моделей
async function loadModels() {
    try {
        const response = await fetch('/api/models');
        const models = await response.json();
        renderModels(models);
    } catch (error) {
        console.error('Error loading models:', error);
    }
}

// Отображение моделей
function renderModels(models) {
    const grid = document.getElementById('modelsGrid');
    grid.innerHTML = models.map(model => `
        <div class="model-card" onclick="selectModel('${model.id}')">
            <img src="${model.image}" alt="${model.name}">
            <div class="model-info">
                <h3>${model.name}</h3>
                <div class="model-price">от ${model.price.toLocaleString('ru-RU')} ₽</div>
                <p>${model.highlight}</p>
                <ul class="model-features">
                    ${model.features.slice(0, 3).map(f => `<li>${f}</li>`).join('')}
                </ul>
                <button class="btn-primary" style="width: 100%;">
                    Подробнее
                </button>
            </div>
        </div>
    `).join('');
}

// Выбор модели
function selectModel(modelId) {
    selectedModel = modelId;
    showLeadForm();
}

// Начало квиза
function startQuiz() {
    document.getElementById('mainScreen').classList.add('hidden');
    document.getElementById('chatScreen').classList.remove('hidden');
    
    // Изменяем кнопку
    tg.BackButton.show();
    tg.BackButton.onClick(() => backToMain());
}

// Возврат на главный экран
function backToMain() {
    document.getElementById('chatScreen').classList.add('hidden');
    document.getElementById('mainScreen').classList.remove('hidden');
    tg.BackButton.hide();
}

// Отправка сообщения в чат
async function sendMessage() {
    const input = document.getElementById('messageInput');
    const message = input.value.trim();
    
    if (!message) return;
    
    // Добавляем сообщение пользователя
    addMessage(message, 'user');
    input.value = '';
    
    // Показываем индикатор загрузки
    showTypingIndicator();
    
    try {
        // Отправляем на сервер
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message,
                userId: currentUser.id,
                history: chatHistory
            })
        });
        
        const data = await response.json();
        hideTypingIndicator();
        
        // Добавляем ответ бота
        addMessage(data.response, 'bot');
        
        // Сохраняем историю
        chatHistory.push(
            { role: 'user', content: message },
            { role: 'assistant', content: data.response }
        );
        
    } catch (error) {
        console.error('Chat error:', error);
        hideTypingIndicator();
        addMessage('Извините, произошла ошибка. Попробуйте еще раз.', 'bot');
    }
}

// Добавление сообщения в чат
function addMessage(text, sender) {
    const messagesDiv = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}`;
    
    messageDiv.innerHTML = `
        <div class="avatar">${sender === 'user' ? '👤' : '🤖'}</div>
        <div class="text">${text}</div>
    `;
    
    messagesDiv.appendChild(messageDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Индикатор набора текста
function showTypingIndicator() {
    const indicator = document.createElement('div');
    indicator.id = 'typingIndicator';
    indicator.className = 'message bot';
    indicator.innerHTML = `
        <div class="avatar">🤖</div>
        <div class="text">Печатает...</div>
    `;
    document.getElementById('chatMessages').appendChild(indicator);
}

function hideTypingIndicator() {
    const indicator = document.getElementById('typingIndicator');
    if (indicator) indicator.remove();
}

// Показ формы заявки
function showLeadForm() {
    document.getElementById('leadForm').classList.remove('hidden');
}

// Закрытие модального окна
function closeModal() {
    document.getElementById('leadForm').classList.add('hidden');
}

// Отправка заявки
async function submitLead(event) {
    event.preventDefault();
    
    const formData = new FormData(event.target);
    const data = Object.fromEntries(formData);
    
    // Добавляем данные пользователя
    data.userId = currentUser.id;
    data.userName = currentUser.first_name;
    data.chatHistory = chatHistory;
    
    try {
        const response = await fetch('/api/lead', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        
        if (response.ok) {
            // Показываем уведомление
            tg.showAlert('✅ Спасибо! Мы свяжемся с вами в течение 15 минут.');
            closeModal();
            
            // Отправляем данные в Telegram
            tg.sendData(JSON.stringify({
                type: 'lead',
                data: data
            }));
        } else {
            throw new Error('Failed to submit lead');
        }
    } catch (error) {
        console.error('Lead submission error:', error);
        tg.showAlert('Произошла ошибка. Попробуйте еще раз.');
    }
}

// Кредитный калькулятор
function calculateCredit() {
    const price = parseInt(document.getElementById('carPrice').value);
    const downPaymentPercent = parseInt(document.getElementById('downPayment').value);
    const termYears = parseInt(document.getElementById('creditTerm').value);
    
    // Обновляем отображение значений
    document.getElementById('downPaymentValue').textContent = `${downPaymentPercent}%`;
    document.getElementById('creditTermValue').textContent = `${termYears} лет`;
    
    // Расчет
    const downPayment = price * (downPaymentPercent / 100);
    const creditAmount = price - downPayment;
    const monthlyRate = 0.12 / 12; // 12% годовых
    const months = termYears * 12;
    
    const monthlyPayment = creditAmount * 
        (monthlyRate * Math.pow(1 + monthlyRate, months)) / 
        (Math.pow(1 + monthlyRate, months) - 1);
    
    // Отображение результата
    document.getElementById('monthlyPayment').textContent = 
        `${Math.round(monthlyPayment).toLocaleString('ru-RU')} ₽`;
}

// Обработка Enter в поле ввода
document.getElementById('messageInput')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage();
    }
});
