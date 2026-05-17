const { getQuestions } = require('../../utils/storage');

async function handlePublish(ctx) {
  try {
    const userId = ctx.from.id;

    // 🎯 ضع هنا الـ Chat ID الثابت والمؤقت لجروب مكثف المنيا أو الـ Hub
    // ملحوظة: تليجرام IDs للجروبات بتبدأ بـ -100 دايماً
    const TARGET_CHAT_ID = "-1003941865995"; 

    // جلب الأسئلة المخزنة
    const quizData = getQuestions(userId);
    if (!quizData) {
      return ctx.reply('❌ لا توجد أسئلة نشطة حالياً. يرجى رفع ملف .txt أولاً!');
    }

    const { lectureName: lectureTitle, questions } = quizData;

    // رسالة البداية النظيفة والمصفاة تماماً
    await ctx.telegram.sendMessage(
      TARGET_CHAT_ID,
      `📚 بداية كويز المحاضرة:\n\n🔥 ${lectureTitle} 🔥`
    );

    let sentCount = 0;

    for (const q of questions) {
      try {
        // وضع التخفي النشط والاحترافي لحماية الجروب
        await ctx.telegram.sendPoll(
          TARGET_CHAT_ID,
          `Q${sentCount + 1}) ${q.question}`,
          q.options,
          {
            type: 'quiz',
            correct_option_id: q.correct,
            is_anonymous: true
          }
        );

        sentCount++;
        console.log(`⚡ [Quiz Engine] Sent Question [${sentCount}/${questions.length}].`);

        // الـ Smart Delay الآمن ضد الـ Rate Limits (4 ثواني)
        await new Promise(resolve => setTimeout(resolve, 4000));

      } catch (pollError) {
        console.error(`❌ Error sending poll at index ${sentCount}:`, pollError.message);
        
        // الـ Auto Retry الاحترافي لو تليجرام رخم بـ 429
        if (pollError.message.includes('429') || pollError.message.includes('retry after')) {
          const matchSeconds = pollError.message.match(/retry after (\d+)/i);
          const waitTime = matchSeconds ? parseInt(matchSeconds[1]) * 1000 : 9000;
          
          await new Promise(resolve => setTimeout(resolve, waitTime));
          
          await ctx.telegram.sendPoll(
            TARGET_CHAT_ID,
            `Q${sentCount + 1}) ${q.question}`,
            q.options,
            { type: 'quiz', correct_option_id: q.correct, is_anonymous: true }
          );
          sentCount++;
          await new Promise(resolve => setTimeout(resolve, 4000));
        }
      }
    }

    // رسالة النهاية الرسمية والصافية تماماً بدون أي حشو
    await ctx.telegram.sendMessage(
      TARGET_CHAT_ID,
      `✅ انتهت أسئلة محاضرة:\n\n${lectureTitle}`
    );

    // تأكيد الإتمام للأدمن في الخاص
    return ctx.telegram.sendMessage(userId, `🚀 **تم ضخ ونشر الـ [ ${sentCount} سؤال ] بنجاح كامل على السيرفر وبوضع التخفي النظيف!**`);

  } catch (error) {
    console.error('❌ Publish Handler Mega Error:', error.message);
    ctx.reply('❌ حدث خطأ غير متوقع أثناء ضخ ونشر الأسئلة.');
  }
}

module.exports = {
  handlePublish
};