const fs = require("fs");
const path = require("path");
const { Markup } = require("telegraf");
const { getQuestions } = require("../../utils/storage");

const groupsFile = path.join(__dirname, "../../../groups.json");
const pollsFile = path.join(__dirname, "../../../polls.json");

// تحميل الجروبات من ملف JSON
function loadGroups() {
  if (!fs.existsSync(groupsFile)) return {};
  try { return JSON.parse(fs.readFileSync(groupsFile, "utf8")); } catch (e) { return {}; }
}

// حفظ وإدارة ملف الـ Polls المفتوحة للنتائج
function savePoll(pollId, lectureName, correctOption, totalQuestions) {
  let polls = {};
  if (fs.existsSync(pollsFile)) {
    try { polls = JSON.parse(fs.readFileSync(pollsFile, "utf8")); } catch (e) {}
  }
  polls[String(pollId)] = {
    lecture: lectureName,
    correct: correctOption,
    total: totalQuestions
  };
  fs.writeFileSync(pollsFile, JSON.stringify(polls, null, 2));
}

/**
 * 🎲 خوارزمية الخلط الأكاديمية مع حارس الفقدان وتطهير المسافات
 */
function shuffleQuestion(q) {
  if (!q.options || q.options.length <= 1) {
    return q;
  }

  const originalCorrect =
    q.correct ??
    q.correctAnswer ??
    q.correct_option_id ??
    0;

  const correctText = q.options[originalCorrect];

  if (!correctText) {
    console.log("❌ Invalid correct answer:", q);
    return q;
  }

  const fixedPatterns = [
    "all of the above",
    "all above",
    "none of the above",
    "none above",
    "both",
    "both a and b",
    "both b and c",
    "a+b",
    "a & b",
    "all answers",
    "all mentioned",
    "all are correct",
    "all correct",
    "none are correct"
  ];

  const fixedOptions = [];
  const normalOptions = [];

  for (const option of q.options) {
    const lower = option.toLowerCase().replace(/\s+/g, " ").trim();
    const isFixed = fixedPatterns.some(pattern => lower.includes(pattern));

    if (isFixed) {
      fixedOptions.push(option);
    } else {
      normalOptions.push(option);
    }
  }

  for (let i = normalOptions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [normalOptions[i], normalOptions[j]] = [normalOptions[j], normalOptions[i]];
  }

  const shuffledOptions = [
    ...normalOptions,
    ...fixedOptions
  ];

  const newCorrectIndex = shuffledOptions.indexOf(correctText);

  if (newCorrectIndex === -1) {
    console.log("❌ Correct answer lost during shuffle! Reverting to original layout:", q);
    return q;
  }

  return {
    ...q,
    options: shuffledOptions,
    correct: newCorrectIndex
  };
}

// أمر /publish لبناء قائمة الأزرار الشفافة
async function handlePublish(ctx) {
  try {
    const groupsArray = Object.values(loadGroups());
    if (!groupsArray.length) return ctx.reply("❌ لا توجد أهداف أو جروبات محفوظة");

    const buttons = groupsArray.map((group) => {
      const label = group.type === "private" ? `👤 ${group.title} (خاص)` : `📢 ${group.title} (عام)`;
      return [Markup.button.callback(label, `publish_${group.id}`)];
    });
    return ctx.reply("📡 اختر المكان المراد ضخ الكويز إليه:", { parse_mode: undefined, ...Markup.inlineKeyboard(buttons) });
  } catch (err) {
    return ctx.reply("❌ حدث خطأ أثناء جلب قائمة الأهداف.");
  }
}

// تنفيذ عملية الضخ بالخلفية مع فك الـ Anonymous لضمان رصد إجابات الطلاب
async function publishToGroup(ctx, groupId) {
  try {
    const userId = ctx.from.id;
    const quizData = getQuestions(userId);
    if (!quizData) return ctx.reply("❌ ارفع ملف الأسئلة أولاً");

    const groupsObject = loadGroups();
    const target = groupsObject[String(groupId)];
    if (!target) return ctx.reply("❌ Target Object Loss Error");

    const { lectureName, questions } = quizData;

    await ctx.reply(
      `🚀 جاري نشر محاضرة:\n\n📚 ${lectureName}\n🎯 عدد الأسئلة: ${questions.length}\n📊 رصد النتائج (Scores Sync): علني ونشط لايف! 🏎️`,
      { parse_mode: undefined }
    );

    await ctx.telegram.sendMessage(target.id, `📚 بداية كويز محاضرة:\n🛑 ${lectureName}`, { parse_mode: undefined });

    let count = 0;
    for (let originalQuestion of questions) {
      try {
        const shuffledQ = shuffleQuestion(originalQuestion);

        // 🎯 التعديل الفولاذي المعتمد منك: تحويل الـ is_anonymous لـ false لإجبار تليجرام على إرسال الـ user ID والدرجة لايف
        const pollMessage = await ctx.telegram.sendPoll(
          target.id,
          `Q${count + 1}) ${shuffledQ.question}`,
          shuffledQ.options,
          { 
            type: "quiz", 
            correct_option_id: shuffledQ.correct, 
            is_anonymous: false // 🔓 مفتوح للرصد الدراسي
          }
        );

        savePoll(pollMessage.poll.id, lectureName, shuffledQ.correct, questions.length);
        count++;
        await new Promise((r) => setTimeout(r, 4000));

      } catch (pollError) {
        console.log(`❌ Poll Error Caught at Question index [${count}]:`, pollError.message);
        continue; 
      }
    }

    return ctx.telegram.sendMessage(
      target.id,
      `✅ انتهت أسئلة محاضرة: ${lectureName}\n\nاضغط على الزر بالأسفل لاستلام نتيجتك التفصيلية فوراً في الخاص 📩👇`,
      {
        parse_mode: undefined,
        ...Markup.inlineKeyboard([
          [Markup.button.url("📊 Show My Result", `t.me/${ctx.botInfo.username}?start=result_${lectureName.replace(/\s+/g, '_')}`)]
        ])
      }
    );

  } catch (err) {
    console.log("❌ Publish Massive Error:", err.message);
  }
}

module.exports = { handlePublish, publishToGroup };