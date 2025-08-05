require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const crypto = require('crypto');

const { getChatResponse } = require('./services/claude');
const { sendLeadEmail } = require('./services/email');
const { cheryModels } = require('./data/models');

const bot = new Telegraf(process.env.BOT_TOKEN);
const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Хранилище сессий
const sessions = new Map();

// Команда /start
bot.command('start', async (ctx) => {
    const userId = ctx.from.id;
    const userName = ctx.from.first_name || 'Гость';
    
    sessions.set(userId, {
        userName,
        stage: 'greeting',
        messages: [],
        selectedModel: null,
        contactInfo: {}
    });
    
    const webAppUrl = process.env.WEBAPP_URL;
    
    await ctx.reply(
        `🚗 Здравствуйте, ${userName}!\n\n` +
        `Я ваш персональный консультант по автомобилям Chery.\n` +
        `Помогу подобрать идеальный автомобиль для вас и вашей семьи.\n\n` +
        `📱 Чем могу помочь?`,
        Markup.inlineKeyboard([
            [Markup.button.webApp('🚗 Открыть каталог', webAppUrl)],
            [Markup.button.callback('💬 Подобрать автомобиль', 'start_selection')],
            [Markup.button.callback('📞 Заказать звонок', 'request_call')]
        ])
    );
});

// Начало подбора
bot.action('start_selection', async (ctx) => {
    await ctx.answerCbQuery();
    const userId = ctx.from.id;
    const session = sessions.get(userId) || {};
    
    await ctx.reply(
        '🤔 Давайте подберем для вас идеальный автомобиль!\n\n' +
        'Для какой цели вам нужен автомобиль?',
        Markup.inlineKeyboard([
            [Markup.button.callback('👨‍👩‍👧‍👦 Для семьи', 'purpose_family')],
            [Markup.button.callback('💼 Для работы', 'purpose_work')],
            [Markup.button.callback('🏞️ Для путешествий', 'purpose_travel')],
            [Markup.button.callback('🏙️ Для города', 'purpose_city')]
        ])
    );
    
    session.stage = 'purpose';
    sessions.set(userId, session);
});

// Обработка целей использования
['family', 'work', 'travel', 'city'].forEach(purpose => {
    bot.action(`purpose_${purpose}`, async (ctx) => {
        await ctx.answerCbQuery();
        const userId = ctx.from.id;
        const session = sessions.get(userId) || {};
        
        session.purpose = purpose;
        session.stage = 'budget';
        
        const purposeText = {
            family: 'семейных поездок',
            work: 'работы',
            travel: 'путешествий',
            city: 'городской езды'
        }[purpose];
        
        await ctx.reply(
            `Отлично! Автомобиль для ${purposeText}.\n\n` +
            '💰 Какой бюджет вы рассматриваете?',
            Markup.inlineKeyboard([
                [Markup.button.callback('1.2 - 1.5 млн ₽', 'budget_1')],
                [Markup.button.callback('1.5 - 2 млн ₽', 'budget_2')],
                [Markup.button.callback('2 - 3 млн ₽', 'budget_3')],
                [Markup.button.callback('3+ млн ₽', 'budget_4')]
            ])
        );
        
        sessions.set(userId, session);
    });
});

// Обработка бюджета и рекомендации
['1', '2', '3', '4'].forEach(level => {
    bot.action(`budget_${level}`, async (ctx) => {
        await ctx.answerCbQuery();
        const userId = ctx.from.id;
        const session = sessions.get(userId) || {};
        
        const budgetRanges = {
            '1': { min: 1200000, max: 1500000 },
            '2': { min: 1500000, max: 2000000 },
            '3': { min: 2000000, max: 3000000 },
            '4': { min: 3000000, max: 10000000 }
        };
        
        session.budget = budgetRanges[level];
        
        // Подбор моделей по критериям
        const recommendations = getRecommendations(session.purpose, session.budget);
        
        let message = '🎯 Вот что я могу предложить:\n\n';
        
        recommendations.forEach((model, index) => {
            message += `${index + 1}. **${model.name}**\n`;
            message += `   💰 от ${model.price.toLocaleString('ru-RU')} ₽\n`;
            message += `   ✨ ${model.highlight}\n\n`;
        });
        
        const buttons = recommendations.map(model => 
            [Markup.button.callback(`📋 ${model.name}`, `model_${model.id}`)]
        );
        buttons.push([Markup.button.callback('💬 Обсудить с консультантом', 'start_chat')]);
        
        await ctx.reply(message, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard(buttons)
        });
        
        session.recommendations = recommendations;
        sessions.set(userId, session);
    });
});

// Обработка текстовых сообщений (AI чат)
bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    const session = sessions.get(userId) || { messages: [] };
    const userMessage = ctx.message.text;
    
    // Показываем индикатор набора
    await ctx.sendChatAction('typing');
    
    try {
        // Получаем ответ от Claude
        const aiResponse = await getChatResponse(
            userMessage,
            session.messages,
            session
        );
        
        // Сохраняем историю
        session.messages.push(
            { role: 'user', content: userMessage },
            { role: 'assistant', content: aiResponse }
        );
        
        // Отправляем ответ
        await ctx.reply(aiResponse, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('📞 Оставить заявку', 'leave_request')],
                [Markup.button.webApp('🚗 Каталог', process.env.WEBAPP_URL)]
            ])
        });
        
        sessions.set(userId, session);
    } catch (error) {
        console.error('AI Error:', error);
        await ctx.reply(
            'Извините, произошла ошибка. Попробуйте еще раз или оставьте заявку для связи с менеджером.',
            Markup.inlineKeyboard([
                [Markup.button.callback('📞 Оставить заявку', 'leave_request')]
            ])
        );
    }
});

// Обработка заявок
bot.action('leave_request', async (ctx) => {
    await ctx.answerCbQuery();
    const userId = ctx.from.id;
    
    await ctx.reply(
        '📝 Оставьте ваш номер телефона и мы свяжемся с вами в течение 15 минут!\n\n' +
        'Нажмите кнопку ниже для отправки номера:',
        Markup.keyboard([
            [Markup.button.contactRequest('📱 Отправить номер телефона')]
        ]).resize()
    );
});

// Обработка контакта
bot.on('contact', async (ctx) => {
    const userId = ctx.from.id;
    const session = sessions.get(userId) || {};
    const contact = ctx.message.contact;
    
    // Сохраняем контакт
    session.contactInfo = {
        phone: contact.phone_number,
        firstName: contact.first_name,
        lastName: contact.last_name,
        userId: contact.user_id
    };
    
    // Отправляем email администратору
    await sendLeadEmail({
        ...session.contactInfo,
        purpose: session.purpose,
        budget: session.budget,
        recommendations: session.recommendations,
        chatHistory: session.messages
    });
    
    await ctx.reply(
        '✅ Спасибо! Ваша заявка принята.\n\n' +
        '📞 Наш менеджер свяжется с вами в течение 15 минут.\n' +
        '⏰ Рабочее время: Пн-Вс с 9:00 до 21:00',
        Markup.removeKeyboard()
    );
    
    sessions.set(userId, session);
});

// Функция подбора рекомендаций
function getRecommendations(purpose, budget) {
    const models = cheryModels.filter(model => 
        model.price >= budget.min && model.price <= budget.max
    );
    
    // Сортировка по соответствию цели
    const sorted = models.sort((a, b) => {
        const scoreA = getModelScore(a, purpose);
        const scoreB = getModelScore(b, purpose);
        return scoreB - scoreA;
    });
    
    return sorted.slice(0, 3);
}

function getModelScore(model, purpose) {
    const scores = {
        family: {
            'tiggo8promax': 10,
            'tiggo7promax': 8,
            'tiggo4pro': 6,
            'arrizo8': 7,
            'tiggo9': 9
        },
        work: {
            'arrizo8': 9,
            'tiggo7promax': 8,
            'tiggo4pro': 7,
            'tiggo8promax': 6,
            'tiggo9': 8
        },
        travel: {
            'tiggo8promax': 10,
            'tiggo9': 10,
            'tiggo7promax': 8,
            'tiggo4pro': 5,
            'arrizo8': 6
        },
        city: {
            'tiggo4pro': 10,
            'arrizo8': 9,
            'tiggo7promax': 7,
            'tiggo8promax': 5,
            'tiggo9': 4
        }
    };
    
    return scores[purpose]?.[model.id] || 5;
}

// API endpoints
app.post('/api/lead', async (req, res) => {
    try {
        const leadData = req.body;
        await sendLeadEmail(leadData);
        res.json({ success: true });
    } catch (error) {
        console.error('Lead API Error:', error);
        res.status(500).json({ error: 'Failed to process lead' });
    }
});

app.get('/api/models', (req, res) => {
    res.json(cheryModels);
});

app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date() });
});

// Запуск бота и сервера
const PORT = process.env.PORT || 3000;

bot.launch();
app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`✅ Bot started successfully`);
});

// Graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
