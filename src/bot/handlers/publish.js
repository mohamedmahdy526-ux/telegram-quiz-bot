const fs = require("fs");
const path = require("path");
const { Markup } = require("telegraf");
const { getQuestions } = require("../../utils/storage");

const groupsFile = path.join(__dirname, "../../../groups.json");

// تحميل الجروبات من ملف JSON
function loadGroups() {
  if (!fs.existsSync(groupsFile)) {
    return [];
  }
  return JSON.parse(fs.readFileSync(groupsFile));
}

// أمر /publish لبناء قائمة الأزرار الشفافة لايف
async function handlePublish(ctx) {
  try {
    const groups = loadGroups();

    if (!groups.length) {
      return ctx.reply("❌ لا توجد جروبات محفوظة");
    }

    // إنشاء الأزرار الشفافة ديناميكياً بناءً على الجروبات المسجلة
    const buttons = groups.map((group) => {
      return [
        Markup.button.callback(
          `${group.title}`,
          `publish_${group.id}`
        )
      ];
    });

    return ctx.reply(
      "📡 اختر الجروب أو القناة للنشر:",
      Markup.inlineKeyboard(buttons)
    );

  } catch (err) {
    console.log("❌ Publish Menu Error:", err.message);
    return ctx.reply("❌ حدث خطأ");
  }
}

// تنفيذ عملية الضخ للهدف المحدد بعد الضغط على الزرار
async function publishToGroup(ctx, groupId) {
  try {
    const userId = ctx.from.id;
    const quizData = getQuestions(userId);

    if (!quizData) {
      return ctx.reply("❌ ارفع ملف الأسئلة أولاً");
    }

    const groups = loadGroups();
    const target = groups.find(
      (g) => String(g.id) === String(groupId)
    );

    if (!target) {
      return ctx.reply("❌ الجروب غير موجود");
    }

    const { lectureName, questions } = quizData;

    // بانر البداية النظيف في الجروب المستهدف
    await ctx.telegram.sendMessage(
      target.id,
      `📚 ${lectureName}`
    );

    let count = 0;

    // ضخ بنك الأسئلة بالـ Smart Delay والـ Anonymous Mode لحماية الأداء
    for (const q of questions) {
      try {
        await ctx.telegram.sendPoll(
          target.id,
          `Q${count + 1}) ${q.question}`,
          q.options,
          {
            type: "quiz",
            correct_option_id: q.correct,
            is_anonymous: true
          }
        );

        count++;
        console.log(`✅ Sent ${count}/${questions.length} -> ${target.title}`);

        // الـ 4 ثواني التكتيكية المعتمدة منك لمنع الـ Rate Limit 🏎️
        await new Promise((r) => setTimeout(r, 4000));

      } catch (err) {
        console.log("❌ Poll Error:", err.message);
      }
    }

    // بانر النهاية الصافي
    await ctx.telegram.sendMessage(
      target.id,
      `✅ انتهت أسئلة ${lectureName}`
    );

    return ctx.reply("🚀 تم النشر بنجاح");

  } catch (err) {
    console.log("❌ Publish Error:", err.message);
    return ctx.reply("❌ حدث خطأ أثناء النشر");
  }
}

module.exports = {
  handlePublish,
  publishToGroup
};