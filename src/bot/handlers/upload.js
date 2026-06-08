const { parseQuestions } = require('../../utils/parser');
const { parseQuizWithAI } = require('../../utils/aiParser');
const { saveQuestions } = require('../../utils/storage');
const { cleanText } = require('../../utils/formatter'); // استدعاء حارس التطهير التلقائي

async function handleUpload(ctx) {
  try {
    const fileId = ctx.message.document.file_id;
    const fileName = ctx.message.document.file_name;
    const userId = ctx.from.id;

    const fileExtension = fileName.split('.').pop().toLowerCase();

    if (!['txt', 'pdf', 'docx'].includes(fileExtension)) {
      return ctx.reply('❌ نوع الملف غير مدعوم. يرجى رفع ملف بصيغة .txt أو .pdf أو .docx فقط.');
    }

    // تطهير اسم المحاضرة من الامتدادات وزوائد النسخ
    const lectureTitle = fileName
      .replace(/\.(txt|pdf|docx)$/i, '')
      .replace(/- Copy(\s*\(\d+\))?/gi, '')
      .trim();

    await ctx.reply('⏳ جاري تحميل وقراءة محتوى الملف... انتظر ثوانٍ معدودة.');

    // جلب الرابط المباشر من سيرفرات تليجرام وقراءته
    const fileLink = await ctx.telegram.getFileLink(fileId);
    const response = await fetch(fileLink.href);
    const fileBuffer = Buffer.from(await response.arrayBuffer());

    let questions = [];

    if (fileExtension === 'txt') {
      let textContent = fileBuffer.toString('utf8');
      textContent = cleanText(textContent);
      questions = parseQuestions(textContent);
    } else {
      // استخدام الذكاء الاصطناعي للملفات الأخرى (pdf, docx)
      const apiKey = process.env.GEMINI_API_KEY;
      questions = await parseQuizWithAI(fileBuffer, fileExtension, apiKey);
    }

    // التحقق الصارم والرد المباشر لو الـ Format مش تمام
    if (!questions || !questions.length) {
      return ctx.reply(
        '❌ فشل استخراج الأسئلة.. تأكد من صياغة بنك الأسئلة داخل الملف والـ Format المطلوب.'
      );
    }

    // حفظ البيانات في الـ Storage والـ Session لمنع أي سقوط للداتا
    if (!ctx.session) ctx.session = {};
    ctx.session.questions = questions;
    ctx.session.lectureTitle = lectureTitle;

    saveQuestions(userId, {
      lectureName: lectureTitle,
      questions
    });

    // رد البوت الرسمي والنظيف وتأكيد استخراج الأسئلة للأدمن
    await ctx.reply(
      `✅ **تم استخراج وقفل أسئلة المحاضرة بنجاح عبر ${fileExtension === 'txt' ? 'النظام التقليدي' : 'الذكاء الاصطناعي'}!**\n\n` +
      `📚 المحاضرة:\n${lectureTitle}\n\n` +
      `📊 عدد الأسئلة:\n[ ${questions.length} سؤال ]\n\n` +
      `📤 اكتب الآن:\n/publish\n\n` +
      `لاختيار مكان النشر 🔥`,
      {
        parse_mode: 'Markdown'
      }
    );

  } catch (error) {
    console.error('❌ Upload Handler Error:', error.message);
    ctx.reply(`❌ حدث خطأ أثناء معالجة وقراءة ملف الأسئلة: ${error.message}`);
  }
}

module.exports = {
  handleUpload
};