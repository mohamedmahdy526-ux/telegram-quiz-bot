const { Telegraf, Markup } = require("telegraf");
const fs = require("fs");
const path = require("path");

const { handleUpload } = require("./handlers/upload");
const { handlePublish, preparePublishMenu, startMassPublishing } = require("./handlers/publish");

const bot = new Telegraf(process.env.BOT_TOKEN);
const adminId = process.env.ADMIN_ID;

const groupsFile = path.join(__dirname, "../../groups.json");
const pollsFile = path.join(__dirname, "../../polls.json");
const scoresFile = path.join(__dirname, "../../scores.json");

function loadData(file) {
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify({}));
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { return {}; }
}

function saveData(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// 🤖 حارس لقط رسائل نص الـ Intro + حفظ المجموعات تلقائياً
bot.on("message", async (ctx, next) => {
  try {
    const chat = ctx.chat;
    const userId = String(ctx.from?.id);

    if (chat.type === "private" && global.waitingForSubject && global.waitingForSubject[userId] && ctx.message.text) {
      const subjectName = ctx.message.text.trim();
      startMassPublishing(ctx, userId, subjectName);
      return; 
    }

    if (chat && (chat.type === "group" || chat.type === "supergroup" || chat.type === "channel")) {
      let groups = loadData(groupsFile);
      if (!groups[String(chat.id)]) {
        groups[String(chat.id)] = { id: chat.id, title: chat.title, type: chat.type };
        saveData(groupsFile, groups);
      }
    }
  } catch (err) {}
  return next();
});

// معالجة تشغيل البوت وعرض تقرير النتيجة الأكاديمي بالحسابات الرياضية المظبوطة بالملي 🎯
bot.start(async (ctx) => {
  if (ctx.chat.type !== "private") return;
  const startPayload = ctx.payload;
  
  if (startPayload && startPayload.startsWith("result_")) {
    // 🎯 تطهير فوري لاسم المحاضرة القادم من الرابط وتحويل الشرطات لمسافات للمطابقة الصارمة
    const targetLecture = startPayload.replace("result_", "").replace(/_/g, " ").trim();
    
    const scores = loadData(scoresFile);
    const userId = String(ctx.from.id);
    const userKey = `${userId}_${targetLecture}`;

    if (!scores[userKey]) {
      return ctx.reply(`❌ عذراً! لم يتم العثور على أي إجابات مسجلة لك في محاضرة:\n📚 ${targetLecture}\n\nتأكد أنك قمت بحل الأسئلة بالكامل!`, { parse_mode: undefined });
    }

    const { correct, wrong, total } = scores[userKey];
    
    const totalAnswered = correct + wrong;
    const finalTotal = (total && total > 0) ? total : totalAnswered;
    const percentage = finalTotal > 0 ? Math.round((correct / finalTotal) * 100) : 0;

    let rating = "⚠️ تحتاج لمزيد من المذاكرة";
    if (percentage >= 90) rating = "ممتاز جداً (بروفيسور) ✨";
    else if (percentage >= 80) rating = "جيد جداً (رائع)";
    else if (percentage >= 70) rating = "جيد (مستوى مبشر)";
    else if (percentage >= 50) rating = "مقبول (شد حيلك)";

    const resultText = 
      `📊 تقرير نتيجتك الأكاديمية:\n\n` +
      `📚 المحاضرة: ${targetLecture}\n\n` +
      `✅ الإجابات الصحيحة: ${correct}\n` +
      `❌ الإجابات الخاطئة: ${wrong}\n` +
      `📝 إجمالي الأسئلة المحلولة: ${totalAnswered}/${finalTotal}\n\n` +
      `📊 النسبة المئوية: ${percentage}%\n` +
      `🎯 التقييم العام: ${rating}\n\n` +
      `شكراً لك ومزيد من التوفيق والنجاح! 🩺🎓`;

    return ctx.reply(resultText, { parse_mode: undefined });
  }
  ctx.reply("🚀 أهلاً بك في نظام الكويزات الأكاديمي! البوت مستعد الآن لرصد وحفظ نتائجك فوراً وبشكل تلقائي.", { parse_mode: undefined });
});

// 🎯 مراقبة إجابات الطلاب وحظر التغيير والتكرار التكتيكي (Anti-Cheat Engine)
bot.on("poll_answer", async (ctx) => {
  try {
    console.log("🔥 POLL ANSWER RECEIVED LAUNCHED!");
    const answer = ctx.pollAnswer;
    const pollId = String(answer.poll_id);
    const userId = String(answer.user.id);
    
    const polls = loadData(pollsFile);
    const pollData = polls[pollId];
    if (!pollData) return;

    // لقط اسم المحاضرة وتطهيره من أي مسافات زائدة لتوحيد الـ Key دايماً
    const lectureClean = String(pollData.lecture).replace(/_/g, " ").trim();
    const { correct, total } = pollData;
    
    const userKey = `${userId}_${lectureClean}`;
    let scores = loadData(scoresFile);
    
    if (!scores[userKey]) {
      scores[userKey] = { 
        correct: 0, 
        wrong: 0, 
        total: Number(total || 0), 
        answeredPolls: {} 
      };
    }

    // حارس منع تكرار أو تعديل الإجابة
    if (scores[userKey].answeredPolls && scores[userKey].answeredPolls[pollId]) {
      console.log(`⚠️ Blocked duplicate vote attempt from Student: ${userId} on Poll: ${pollId}`);
      return;
    }

    if (!scores[userKey].answeredPolls) scores[userKey].answeredPolls = {};
    scores[userKey].answeredPolls[pollId] = true;

    const studentChoice = answer.option_ids[0];
    if (studentChoice === correct) {
      scores[userKey].correct += 1;
    } else {
      scores[userKey].wrong += 1;
    }

    saveData(scoresFile, scores);
    console.log(`📝 [Clean Score Saved] -> Student: ${userId} | Lecture: ${lectureClean} | Correct: ${scores[userKey].correct} | Wrong: ${scores[userKey].wrong}`);
  } catch (err) {
    console.log("❌ Poll Answer Error Caught:", err.message);
  }
});

bot.on("document", async (ctx) => {
  if (ctx.chat.type !== "private" || String(ctx.from.id) !== String(adminId)) return;
  return handleUpload(ctx);
});

bot.command("publish", async (ctx) => {
  if (ctx.chat.type !== "private" || String(ctx.from.id) !== String(adminId)) return;
  return handlePublish(ctx);
});

bot.action(/^publish_(.+)/, async (ctx) => {
  try {
    const groupId = ctx.match[1];
    await ctx.answerCbQuery();
    return preparePublishMenu(ctx, groupId); 
  } catch (err) {}
});

module.exports = bot;