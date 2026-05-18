const fs = require("fs");
const path = require("path");
const { Markup } = require("telegraf");
const { getQuestions } = require("../../utils/storage");

const groupsFile = path.join(__dirname, "../../../groups.json");

// تحميل الجروبات من ملف JSON
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

/**
 * 🎲 خوارزمية الخلط الأكاديمية المتقدمة (Advanced Academic Shuffling Engine)
 * تقوم بخلط الاختيارات العادية فقط وتثبيت الإجابات المركبة (All / Both) في النهاية دائمًا
 */
function shuffleQuestion(q) {
  if (!q.options || q.options.length <= 1) {
    return q;
  }

  // دعم كل أنواع أسماء الإجابة الصحيحة المخزنة لمنع الـ Undefined
  const originalCorrect =
    q.correct ??
    q.correctAnswer ??
    q.correct_option_id ??
    0;

  const correctText = q.options[originalCorrect];

  // لو الإجابة مش موجودة في المصفوفة، بنرجع السؤال الأصلي زي ما هو كخط دفاع أول
  if (!correctText) {
    console.log("❌ Invalid correct answer:", q);
    return q;
  }

  // 🎯 الأنماط والكلمات الأكاديمية التي يجب تثبيتها في ذيل السؤال دائماً
  const fixedPatterns = [
    "all of the above",
    "none of the above",
    "both",
    "a+b",
    "a & b",
    "both a and b",
    "all answers",
    "all mentioned",
    "all are correct",
    "none are correct"
  ];

  const fixedOptions = [];
  const normalOptions = [];

  // تقسيم الاختيارات بناءً على الأنماط الذكية
  for (const option of q.options) {
    const lower = option.toLowerCase().trim();
    const isFixed = fixedPatterns.some(pattern => lower.includes(pattern));

    if (isFixed) {
      fixedOptions.push(option);
    } else {
      normalOptions.push(option);
    }
  }

  // Fisher-Yates Shuffle للاختيارات العادية فقط
  for (let i = normalOptions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [normalOptions[i], normalOptions[j]] = [normalOptions[j], normalOptions[i]];
  }

  // دمج المصفوفات: الاختيارات العادية المخلطة أولاً، تليها الاختيارات المركبة الثابتة في الآخر
  const shuffledOptions = [
    ...normalOptions,
    ...fixedOptions
  ];

  // تحديد مؤشر الإجابة الصحيحة الجديد والنهائي بدقة
  const newCorrectIndex = shuffledOptions.indexOf(correctText);

  return {
    ...q,
    options: shuffledOptions,
    correct: newCorrectIndex
  };
}

// أمر /publish لبناء قائمة الأزرار الشفافة لايف
async function handlePublish(ctx) {
  try {
    const groupsObject = loadGroups();
    const groupsArray = Object.values(groupsObject);

    if (!groupsArray.length) {
      return ctx.reply("❌ لا توجد أهداف أو جروبات محفوظة");
    }

    // إنشاء الأزرار الشفافة (تمييز الخاص عن العام بالـ Emojis والأسماء النظيفة)
    const buttons = groupsArray.map((group) => {
      const label = group.type === "private"
        ? `👤 ${group.title} (خاص)`
        : `📢 ${group.title} (عام)`;

      return [Markup.button.callback(label, `publish_${group.id}`)];
    });

    return ctx.reply(
      "📡 اختر المكان المراد ضخ الكويز إليه:",
      Markup.inlineKeyboard(buttons)
    );

  } catch (err) {
    console.log("❌ Publish Menu Error:", err.message);
    return ctx.reply("❌ حدث خطأ أثناء جلب قائمة الأهداف.");
  }
}

// تنفيذ عملية الضخ بالخلفية وحل مشكلة الـ Timeout
async function publishToGroup(ctx, groupId) {
  try {
    const userId = ctx.from.id;
    const quizData = getQuestions(userId);

    if (!quizData) {
      return ctx.reply("❌ ارفع ملف الأسئلة أولاً");
    }

    const groupsObject = loadGroups();
    const target = groupsObject[String(groupId)];

    if (!target) {
      return ctx.reply("❌ الهدف المختار غير موجود في القائمة");
    }

    const { lectureName, questions } = quizData;

    // رسالة إظهار اسم المحاضرة مع عدد الأسئلة الإجمالي للأدمن قبل النشر
    await ctx.reply(
      `🚀 جاري نشر محاضرة:\n\n📚 ${lectureName}\n🎯 عدد الأسئلة الإجمالي: ${questions.length}\n🎲 وضع الخلط الأكاديمي (Academic Shuffle): نشط ومثبت للمركبات! 🔥\n\n⏳ انتظر حتى اكتمال النشر تماماً...`
    );

    // رسالة بداية الكويز في الهدف المستهدف
    await ctx.telegram.sendMessage(
      target.id,
      `📚 ${lectureName}`
    );

    let count = 0;

    for (let originalQuestion of questions) {
      try {
        // 🎯 خلط السؤال وتأمين خيارات الـ Both / All في النهاية دائماً
        const shuffledQ = shuffleQuestion(originalQuestion);

        // ترقيم الأسئلة تلقائياً Q1, Q2... + إخفاء المشاركين (is_anonymous: true)
        await ctx.telegram.sendPoll(
          target.id,
          `Q${count + 1}) ${shuffledQ.question}`,
          shuffledQ.options,
          {
            type: "quiz",
            correct_option_id: shuffledQ.correct,
            is_anonymous: true
          }
        );

        count++;
        console.log(`✅ [Academic Shuffle Passed] Sent ${count}/${questions.length} -> ${target.title}`);
        
        // Anti-429 delay: الانتظار التكتيكي (4 ثواني) بين كل سؤال وسؤال
        await new Promise((r) => setTimeout(r, 4000));

      } catch (pollError) {
        if (pollError.message.includes('429') || pollError.message.includes('retry after')) {
          const matchSeconds = pollError.message.match(/retry after (\d+)/i);
          const waitTime = matchSeconds ? parseInt(matchSeconds[1]) * 1000 : 9000;
          
          console.log(`⚠️ [Rate Limit Caught] Sleeping for ${waitTime / 1000} seconds...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          
          const shuffledQRetry = shuffleQuestion(originalQuestion);
          await ctx.telegram.sendPoll(
            target.id,
            `Q${count + 1}) ${shuffledQRetry.question}`,
            shuffledQRetry.options,
            { type: "quiz", correct_option_id: shuffledQRetry.correct, is_anonymous: true }
          );
          count++;
          await new Promise(resolve => setTimeout(resolve, 4000));
        }
      }
    }

    // رسالة نهاية الكويز في الهدف المستهدف
    await ctx.telegram.sendMessage(
      target.id,
      `✅ انتهت أسئلة ${lectureName}`
    );

    // رسالة عند انتهاء النشر مفصلة للأدمن في الخاص
    return ctx.reply(
      `✅ اكتمل نشر محاضرة:\n\n📚 ${lectureName}\n\n🎯 عدد الأسئلة: ${questions.length}\n🎲 تم الخلط الأكاديمي المتقدم وتوزيع الإجابات بنجاح فخم ونظير بالملي!`
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