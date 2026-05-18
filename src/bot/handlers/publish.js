const fs = require("fs");
const path = require("path");
const { Markup } = require("telegraf");
const { getQuestions } = require("../../utils/storage");

const groupsFile = path.join(__dirname, "../../../groups.json");
const pollsFile = path.join(__dirname, "../../../polls.json");

// مخزن الـ States المؤقتة لانتظار اسم المادة لايف
global.waitingForSubject = global.waitingForSubject || {};

function loadGroups() {
  if (!fs.existsSync(groupsFile)) return {};
  try { return JSON.parse(fs.readFileSync(groupsFile, "utf8")); } catch (e) { return {}; }
}

function savePoll(pollId, lectureName, correctOption, totalQuestions) {
  let polls = {};
  if (fs.existsSync(pollsFile)) {
    try { polls = JSON.parse(fs.readFileSync(pollsFile, "utf8")); } catch (e) {}
  }
  polls[String(pollId)] = { lecture: lectureName, correct: correctOption, total: totalQuestions };
  fs.writeFileSync(pollsFile, JSON.stringify(polls, null, 2));
}

function shuffleQuestion(q) {
  if (!q.options || q.options.length <= 1) return q;
  const originalCorrect = q.correct ?? q.correctAnswer ?? q.correct_option_id ?? 0;
  const correctText = q.options[originalCorrect];
  if (!correctText) return q;

  const fixedPatterns = ["all of the above", "all above", "none of the above", "none above", "both", "both a and b", "both b and c", "a+b", "a & b", "all answers", "all mentioned", "all are correct", "all correct", "none are correct"];
  const fixedOptions = [];
  const normalOptions = [];

  for (const option of q.options) {
    const lower = option.toLowerCase().replace(/\s+/g, " ").trim();
    if (fixedPatterns.some(pattern => lower.includes(pattern))) {
      fixedOptions.push(option);
    } else {
      normalOptions.push(option);
    }
  }

  for (let i = normalOptions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [normalOptions[i], normalOptions[j]] = [normalOptions[j], normalOptions[i]];
  }

  const shuffledOptions = [...normalOptions, ...fixedOptions];
  const newCorrectIndex = shuffledOptions.indexOf(correctText);
  return newCorrectIndex === -1 ? q : { ...q, options: shuffledOptions, correct: newCorrectIndex };
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

// خطوة قنص الجروب وتفعيل الـ Waiting Mode لانتظار اسم المادة
async function preparePublishMenu(ctx, groupId) {
  try {
    const userId = String(ctx.from.id);
    const quizData = getQuestions(userId);

    if (!quizData) {
      return ctx.reply("❌ ارفع ملف الأسئلة أولاً");
    }

    const { lectureName, questions } = quizData;

    // تفعيل الـ Waiting Mode وحفظ الداتا مؤقتاً
    global.waitingForSubject[userId] = {
      groupId: groupId,
      lectureName: lectureName,
      questions: questions
    };

    return ctx.reply(
      `📚 اسم المحاضرة: ${lectureName}\n\n` +
      `✍️ من فضلك اكتب الآن اسم المادة (مثال: Adult Nursing):`,
      { parse_mode: undefined }
    );

  } catch (err) {
    console.log("❌ Prepare Publish Error:", err.message);
  }
}

// محرك الضخ الخلفي الفولاذي وتركيب الرسالة الثابتة والمنظمة تلقائياً
async function startMassPublishing(ctx, userId, subjectName) {
  try {
    const sessionData = global.waitingForSubject[userId];
    if (!sessionData) return;

    const { groupId, lectureName, questions } = sessionData;
    
    // مسح الـ State فوراً لتأمين التكرار وتحرير الذاكرة
    delete global.waitingForSubject[userId];

    const groupsObject = loadGroups();
    const target = groupsObject[String(groupId)];
    if (!target) return ctx.reply("❌ الهدف المستهدف لم يعد متاحاً.");

    // رسالة طمأنينة فورية للأدمن في الخاص
    await ctx.reply(`🚀 جاري نشر محاضرة:\n\n📚 ${lectureName}\n🎯 عدد الأسئلة: ${questions.length}\n⏳ انتظر حتى اكتمال النشر...`, { parse_mode: undefined });

    // تركيب الـ البانر الثابت، الاحترافي والمرتب تلقائياً بناءً على خطتك الأكاديمية الذكية
    const finalIntro = 
      `📚 بداية كويز محاضرة\n` +
      `🩺 المادة: ${subjectName}\n` +
      `📖 المحاضرة: ${lectureName}\n` +
      `📊 نظام الدرجات مفعل\n` +
      `🎲 الـ Shuffle مفعل\n` +
      `🔥 بالتوفيق!`;

    // إرسال البانر الافتتاحي للجروب المستهدف
    await ctx.telegram.sendMessage(target.id, finalIntro, { parse_mode: undefined });
    await new Promise((r) => setTimeout(r, 2000)); // ثانيتين راحة للعين قبل أول سؤال

    // تنبيه إجباري للطلاب ببدء البوت في الخاص لحساب النتيجة
    await ctx.telegram.sendMessage(
      target.id,
      `⚠️ لمعرفة نتيجتك بعد حل المحاضرات:\nابدأ البوت أولاً 👇\n🤖 @${ctx.botInfo.username}`,
      { parse_mode: undefined }
    );

    let count = 0;
    for (let originalQuestion of questions) {
      try {
        const shuffledQ = shuffleQuestion(originalQuestion);

        // إرسال الـ Poll - علني (is_anonymous: false) عشان النتايج والدرجات تشتغل صح
        const pollMessage = await ctx.telegram.sendPoll(
          target.id,
          `Q${count + 1}) ${shuffledQ.question}`,
          shuffledQ.options,
          { type: "quiz", correct_option_id: shuffledQ.correct, is_anonymous: false }
        );

        savePoll(pollMessage.poll.id, lectureName, shuffledQ.correct, questions.length);
        count++;
        
        // Anti-429 delay: الانتظار التكتيكي (4 ثواني) لحماية البوت من الـ Flood
        await new Promise((r) => setTimeout(r, 4000));

      } catch (pollError) {
        console.log(`❌ Poll Error Caught at index [${count}]:`, pollError.message);
        continue; 
      }
    }

    // 🎯 إعادة حقن بانر الختام الفخم مع زر استلام الدرجات في الخاص للطلاب (تم التصليح بفضل لمحك الذكي)
    await ctx.telegram.sendMessage(
      target.id,
      `✅ انتهت أسئلة محاضرة: [ ${lectureName} ]\n\nاضغط على الزر بالأسفل لمعرفة نتيجتك التفصيلية فوراً في الخاص 📩👇`,
      {
        parse_mode: undefined,
        ...Markup.inlineKeyboard([
          [Markup.button.url("📊 اعرف نتيجتك / Show My Result", `t.me/${ctx.botInfo.username}?start=result_${lectureName.replace(/\s+/g, '_')}`)]
        ])
      }
    );

    // رسالة اكتمال النشر النهائية للأدمن في الخاص
    return ctx.reply(`✅ اكتمل نشر محاضرة:\n\n📚 ${lectureName}\n\n🎯 عدد الأسئلة: ${questions.length}`, { parse_mode: undefined });

  } catch (err) {
    console.log("❌ Massive Publishing Engine Error:", err.message);
  }
}

module.exports = { handlePublish, preparePublishMenu, startMassPublishing };