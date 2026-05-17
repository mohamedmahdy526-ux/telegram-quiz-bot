const fs = require("fs");
const path = require("path");
const { Markup } = require("telegraf");
const { getQuestions } = require("../../utils/storage");

const groupsFile = path.join(__dirname, "../../../groups.json");

function loadGroups() {
  if (!fs.existsSync(groupsFile)) {
    return {};
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(groupsFile, "utf8"));
    return Array.isArray(parsed) ? {} : parsed;
  } catch (e) {
    return {};
  }
}

// أمر /publish لبناء قائمة الأزرار الشفافة لايف
async function handlePublish(ctx) {
  try {
    const groupsObject = loadGroups();
    const groupsArray = Object.values(groupsObject); // تحويل الـ Object لـ Array فقط عند رص الأزرار

    if (!groupsArray.length) {
      return ctx.reply("❌ لا توجد جروبات محفوظة");
    }

    // 🔘 إنشاء الأزرار: الاسم ظاهر + الـ ID مخفي داخلياً بالملي لمنع لخبطة الأندرويد
    const buttons = groupsArray.map((group) => {
      return [
        Markup.button.callback(
          `${group.title} (${group.type === 'private' ? 'خاص 👤' : 'عام 📢'})`,
          `publish_${group.id}` // الـ ID محمي ومخفي جوه الـ Callback Data
        )
      ];
    });

    return ctx.reply(
      "📡 اختر الجروب، القناة أو الشات الخاص للنشر:",
      Markup.inlineKeyboard(buttons)
    );

  } catch (err) {
    console.log("❌ Publish Menu Error:", err.message);
    return ctx.reply("❌ حدث خطأ في جلب قائمة الأهداف.");
  }
}

// تنفيذ عملية الضخ بعد لقط الـ ID الصافي من الـ Regex
async function publishToGroup(ctx, groupId) {
  try {
    const userId = ctx.from.id;
    const quizData = getQuestions(userId);

    if (!quizData) {
      return ctx.reply("❌ ارفع ملف الأسئلة أولاً");
    }

    const groupsObject = loadGroups();
    const target = groupsObject[String(groupId)]; // سحب الهدف فوراً بـ الكي (O(1) Speed) بدون لف ودوران

    if (!target) {
      return ctx.reply("❌ الهدف المختار غير موجود في القائمة");
    }

    const { lectureName, questions } = quizData;

    // رسالة: جاري النشر الفورية للأدمن في الخاص
    await ctx.reply(
      `🚀 جاري نشر محاضرة:\n\n📚 ${lectureName}\n\n⏳ انتظر حتى اكتمال النشر...`
    );

    // رسالة بداية الكويز في الهدف المستهدف
    await ctx.telegram.sendMessage(
      target.id,
      `📚 ${lectureName}`
    );

    let count = 0;

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
        await new Promise((r) => setTimeout(r, 4000));

      } catch (pollError) {
        if (pollError.message.includes('429') || pollError.message.includes('retry after')) {
          const matchSeconds = pollError.message.match(/retry after (\d+)/i);
          const waitTime = matchSeconds ? parseInt(matchSeconds[1]) * 1000 : 9000;
          
          await new Promise(resolve => setTimeout(resolve, waitTime));
          
          await ctx.telegram.sendPoll(
            target.id,
            `Q${count + 1}) ${q.question}`,
            q.options,
            { type: "quiz", correct_option_id: q.correct, is_anonymous: true }
          );
          count++;
          await new Promise(resolve => setTimeout(resolve, 4000));
        }
      }
    }

    await ctx.telegram.sendMessage(
      target.id,
      `✅ انتهت أسئلة ${lectureName}`
    );

    // رسالة عند انتهاء النشر مفصلة للأدمن
    return ctx.reply(
      `✅ اكتمل نشر محاضرة:\n\n📚 ${lectureName}\n\n🎯 عدد الأسئلة: ${questions.length}`
    );

  } catch (err) {
    console.log("❌ Publish Error:", err.message);
    return ctx.reply("❌ حدث خطأ غير متوقع أثناء ضخ الكويز.");
  }
}

module.exports = {
  handlePublish,
  publishToGroup
};