const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({
    apiKey: process.env.CLAUDE_API_KEY,
});

// Системный промпт для продаж
const SYSTEM_PROMPT = `Ты - профессиональный консультант по продажам автомобилей Chery.
Твоя цель - помочь клиенту выбрать подходящий автомобиль и довести его до заявки на тест-драйв или покупку.

ЭТАПЫ ПРОДАЖИ:
1. Приветствие и установление контакта
2. Выявление потребностей (семья, работа, бюджет)
3. Презентация подходящих моделей
4. Работа с возражениями
5. Закрытие на тест-драйв или встречу

МОДЕЛИ CHERY 2025:
- Tiggo 4 Pro (от 1 260 000 ₽) - компактный городской SUV
- Tiggo 7 Pro Max (от 1 999 000 ₽) - среднеразмерный SUV
- Tiggo 8 Pro Max (от 2 699 000 ₽) - 7-местный семейный SUV
- Arrizo 8 (от 1 810 000 ₽) - премиальный седан
- Tiggo 9 (от 4 150 000 ₽) - флагманский SUV

ПРАВИЛА:
- Обращайся к клиенту по имени
- Будь дружелюбным и профессиональным
- Фокусируйся на выгодах, а не характеристиках
- Используй социальное доказательство
- Всегда предлагай тест-драйв
- Отвечай кратко и по существу
- Используй эмодзи для дружелюбности`;

async function getChatResponse(userMessage, history, session) {
    try {
        const messages = [
            { role: 'system', content: SYSTEM_PROMPT },
            ...history.slice(-10), // Последние 10 сообщений
            { role: 'user', content: userMessage }
        ];
        
        const response = await anthropic.messages.create({
            model: 'claude-3-opus-20240229',
            max_tokens: 500,
            temperature: 0.7,
            messages: messages
        });
        
        return response.content[0].text;
    } catch (error) {
        console.error('Claude API Error:', error);
        throw error;
    }
}

module.exports = { getChatResponse };
