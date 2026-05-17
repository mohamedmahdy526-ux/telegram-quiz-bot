const fs = require("fs");
const path = require("path");
const { getQuestions } = require("../../utils/storage");

const groupsFile = path.join(__dirname, "../../../groups.json");

// تحميل الجروبات المستهدفة لايف من الـ JSON
function loadGroups() {
  if (!fs.existsSync(groupsFile)) {
    return [];
  }
  return JSON.parse(fs.readFileSync(groupsFile));
}

async function handlePublish(ctx) {
  try {
    const userId = ctx.from.id;

    // جلب الأسئلة المخزنة مؤقتاً
    const quizData = getQuestions(userId);
    if (!quizData) {
      return ctx.reply("❌ ارفع ملف الأسئلة أولاً");
    }

    const groups = loadGroups();
    if (!groups.length) {
      return ctx.reply("❌ لا توجد جروبات محفوظة");
    }

    const { lectureName, questions } = quizData;

    // الحلقة الكبرى للمرور على كل الجروبات والقنوات المسجلة
    for (const group of groups) {
      try {
        // بانر البداية النظيف لكل جروب
        await ctx.telegram.sendMessage(
          group.id,
          `📚 ${lectureName}`
        );

        let count = 0;

        // ضخ الأسئلة سؤال تلو الآخر مع الـ Pacing لمنع الـ Flood
        for (const q of questions) {
          try {
            await ctx.telegram.sendPoll(
              group.id,
              `Q${count + 1}) ${q.question}`,
              q.options,
              {
                type: "quiz",
                correct_option_id: q.correct,
                is_anonymous: true // وضع التخفي النشط لحماية الأداء 🕵️‍♂️🔥
              }
            );

            count++;
            console.log(`✅ Sent ${count}/${questions.length} -> ${group.title}`);

            // الـ Smart Delay المعتمد (4 ثواني هدوء بين كل سؤال وسؤال) 🏎️
            await new Promise((r) => setTimeout(r, 4000));

          } catch (err) {
            console.log("❌ Poll Error:", err.message);
          }
        }

        // بانر النهاية النظيف لكل جروب بعد اكتمال الضخ
        await ctx.telegram.sendMessage(
          group.id,
          `✅ انتهت أسئلة ${lectureName}`
        );

      } catch (err) {
        console.log("❌ Group Publish Error:", err.message);
      }
    }

    return ctx.reply("🚀 تم نشر الأسئلة بنجاح");

  } catch (err) {
    console.log("❌ Publish Error:", err.message);
    return ctx.reply("❌ حدث خطأ أثناء النشر");
  }
}

module.exports = {
  handlePublish
};