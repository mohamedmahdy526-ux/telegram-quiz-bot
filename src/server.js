require('dotenv').config();
const bot = require('./bot');

// تشغيل البوت مباشرة عبر الـ Long Polling المستقر
bot.launch()
  .then(() => {
    console.log('\n====================================');
    console.log('🚀 Quiz Platform Server is Live & Pure Cloud Mode Active!');
    console.log('====================================\n');
  })
  .catch((err) => {
    console.error('❌ Error starting Telegram Bot Server:', err.message);
  });

// إيقاف آمن للسيرفر في حالة الطوارئ
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));