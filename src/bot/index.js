const { Telegraf } = require('telegraf');
const { handleUpload } = require('./handlers/upload');
const { handlePublish } = require('./handlers/publish');

const bot = new Telegraf(process.env.BOT_TOKEN);
const adminId = process.env.ADMIN_ID;

bot.start((ctx) => {
  if (ctx.chat.type !== 'private') return;
  ctx.reply('🚀 مرحبًا بك في منصة الاختبارات السريعة الصافية.\nارفع ملف الـ .txt الخاص بالأسئلة الآن!');
});

// أمر النشر للأدمن فقط
bot.command('publish', async (ctx) => {
  if (String(ctx.from.id) !== String(adminId)) return ctx.reply('❌ للأدمن فقط!');
  return handlePublish(ctx);
});

// محرك الـ Inline Action لضخ الكويزات عن بُعد من الخاص
bot.action(/publish_(.+)/, async (ctx) => {
  try {
    const targetId = ctx.match[1];
    await ctx.answerCbQuery(); 
    ctx.targetId = targetId;
    return await handlePublish(ctx);
  } catch (err) {
    console.log('❌ Publish Action Error:', err.message);
  }
});

// حارس استقبال ملفات الأسئلة (TXT فقط بأعلى استقرار)
bot.on('document', async (ctx) => {
  if (String(ctx.from.id) !== String(adminId)) return;
  
  const fName = ctx.message.document.file_name;
  if (!fName.endsWith('.txt')) {
    return ctx.reply('❌ عذراً، المنصة تقبل ملفات بنوك الأسئلة بصيغة .txt فقط لضمان استقرار النشر!');
  }
  
  return handleUpload(ctx);
});

// لمنع تعليق زرار اسم الجروب الشفاف
bot.action('noop', async (ctx) => {
  await ctx.answerCbQuery();
});

module.exports = bot;