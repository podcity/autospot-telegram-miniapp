const nodemailer = require('nodemailer');

// Настройка транспорта
const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    secure: false,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

async function sendLeadEmail(leadData) {
    const {
        phone,
        firstName,
        lastName,
        purpose,
        budget,
        recommendations,
        chatHistory
    } = leadData;
    
    // Форматирование данных
    const purposeText = {
        family: 'Семейный автомобиль',
        work: 'Для работы',
        travel: 'Для путешествий',
        city: 'Городской автомобиль'
    }[purpose] || 'Не указано';
    
    const budgetText = budget 
        ? `${(budget.min / 1000000).toFixed(1)} - ${(budget.max / 1000000).toFixed(1)} млн ₽`
        : 'Не указан';
    
    const recommendationsText = recommendations
        ? recommendations.map(r => `- ${r.name} (от ${r.price.toLocaleString('ru-RU')} ₽)`).join('\n')
        : 'Нет рекомендаций';
    
    // HTML письмо
    const html = `
        <h2>🚗 Новая заявка с Telegram бота</h2>
        
        <h3>Контактная информация:</h3>
        <ul>
            <li><strong>Имя:</strong> ${firstName} ${lastName || ''}</li>
            <li><strong>Телефон:</strong> ${phone}</li>
        </ul>
        
        <h3>Параметры подбора:</h3>
        <ul>
            <li><strong>Цель покупки:</strong> ${purposeText}</li>
            <li><strong>Бюджет:</strong> ${budgetText}</li>
        </ul>
        
        <h3>Рекомендованные модели:</h3>
        <pre>${recommendationsText}</pre>
        
        <h3>История чата:</h3>
        <div style="background: #f5f5f5; padding: 10px; border-radius: 5px;">
            ${chatHistory ? chatHistory.slice(-5).map(msg => 
                `<p><strong>${msg.role === 'user' ? 'Клиент' : 'Бот'}:</strong> ${msg.content}</p>`
            ).join('') : '<p>Нет истории</p>'}
        </div>
        
        <hr>
        <p><small>Отправлено: ${new Date().toLocaleString('ru-RU')}</small></p>
    `;
    
    // Отправка письма
    try {
        await transporter.sendMail({
            from: `"Chery Bot" <${process.env.EMAIL_USER}>`,
            to: process.env.ADMIN_EMAIL,
            subject: `⚡ Новая заявка: ${firstName} ${phone}`,
            html: html
        });
        
        console.log('Email sent successfully');
        return true;
    } catch (error) {
        console.error('Email sending failed:', error);
        throw error;
    }
}

module.exports = { sendLeadEmail };
