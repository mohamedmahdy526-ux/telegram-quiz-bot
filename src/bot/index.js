const { Telegraf, Markup } = require("telegraf");
const fs = require("fs");
const path = require("path");

const { handleUpload } = require("./handlers/upload");
const { handlePublish, publishToGroup } = require("./handlers/publish");

// التأكد من وجود التوكن في البيئة المحيطة لمنع الكراش
if (!process.env.BOT_TOKEN) {
  console.error("❌ CRITICAL: BOT_TOKEN is missing in .env file!");
  process.exit(1);
}

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

// 🤖 حارس قنص الأهداف والجروبات التلقائي لو تليجرام تفاعل معاها
bot.on("message", async (ctx, next) => {
  try {
    const chat = ctx.chat;
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

// معالجة تشغيل البوت وجلب النتيجة المصفاة بدون مارك داون معقد
bot.start(async (ctx) => {
  if (ctx.chat.type !== "private") return;
  
  const startPayload = ctx.payload;
  
  if (startPayload && startPayload.startsWith("result_")) {
    const targetLecture = startPayload.replace("result_", "").replace(/_/g, " ");
    const scores = loadData(scoresFile);
    const userId = String(ctx.from.id);
    const userKey = `${userId}_${targetLecture}`;

    if (!scores[userKey]) {
      return ctx.reply(`❌ عذراً! لم يتم العثور على أي إجابات مسجلة لك في محاضرة:\n📚 ${targetLecture}\n\nتأكد أنك قمت بحل الأسئلة وجاوبت على الـ Polls بالفعل!`, { parse_mode: undefined });
    }

    const { correct, wrong, total } = scores[userKey];
    const percentage = Math.round((correct / total) * 100);

    let rating = "⚠️ تحتاج لمزيد من المذاكرة";
    if (percentage >= 90) rating = "🔥 ممتاز جداً (بروفيسور) ✨";
    else if (percentage >= 80) rating = "🌟 جيد جداً (رائع)";
    else if (percentage >= 70) rating = "👍 جيد (مستوى مبشر)";
    else if (percentage >= 50) rating = "📈 مقبول (شد حيلك)";

    const resultText = `📊 تقرير نتيجتك الأكاديمية:\n\n📚 المحاضرة: ${targetLecture}\n\n✅ الإجابات الصحيحة: ${correct}\n❌ الإجابات الخاطئة: ${wrong}\n📝 إجمالي الأسئلة المحلولة: ${correct + wrong}/${total}\n\n📊 النسبة المئوية: ${percentage}%\n🎯 التقييم العام: ${rating}\n\nشكراً لك ومزيد من التوفيق والنجاح! 🩺🎓`;

    return ctx.reply(resultText, { parse_mode: undefined });
  }

  ctx.reply("🚀 أهلاً بك في نظام الكويزات الأكاديمي! البوت مستعد الآن لرصد وحفظ نتائجك فوراً وبشكل تلقائي بعد تفعيل مستشعرات تليجرام العميقة 😎.", { parse_mode: undefined });
});

// 🎯 مراقبة وتحليل إجابات الطلاب لايف في الخلفية بعد فتح الـ Allowed Updates
bot.on("poll_answer", async (ctx) => {
  try {
    // الـ Log الذهبي للتأكد من وصول الإشارة لايف جوه الـ Terminal
    console.log("🔥 POLL ANSWER RECEIVED LAUNCHED!");

    const answer = ctx.pollAnswer;
    const pollId = String(answer.poll_id);
    const userId = String(answer.user.id);
    
    const polls = loadData(pollsFile);
    const pollData = polls[pollId];

    if (!pollData) {
      console.log(`⚠️ Ignored poll answer for unmapped poll ID: ${pollId}`);
      return;
    }

    const { lecture, correct, total } = pollData;
    const userKey = `${userId}_${lecture}`;
    
    let scores = loadData(scoresFile);
    if (!scores[userKey]) {
      scores[userKey] = { correct: 0, wrong: 0, total: total };
    }

    const studentChoice = answer.option_ids[0];
    if (studentChoice === correct) {
      scores[userKey].correct += 1;
    } else {
      scores[userKey].wrong += 1;
    }

    saveData(scoresFile, scores);
    console.log(`📝 [Score Saved Successfully] -> Student: ${userId} | Lecture: ${lecture} | Correct: ${scores[userKey].correct} | Wrong: ${scores[userKey].wrong}`);

  } catch (err) {
    console.log("❌ Poll Answer Processing Error:", err.message);
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
    await ctx.reply("🚀 بدأ النشر وتوليد الكويزات في الخلفية بنجاح... ونظام الدرجات والنتائج نشط للطلاب الآن 😎🔥", { parse_mode: undefined });
    publishToGroup(ctx, groupId);
  } catch (err) {}
});

// تصدير كائن البوت صافي وبدون سطر الـ launch الخبيث من هنا 🎯
module.exports = bot;