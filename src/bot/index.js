const { Telegraf } = require("telegraf");
const fs = require("fs");
const path = require("path");

const {
  handleUpload,
  publishToGroup
} = require("./handlers/upload"); // تأكيد استدعاء الـ Destructuring الكامل والمطهر
const { handlePublish, publishToGroup: publishFn } = require("./handlers/publish");

const bot = new Telegraf(process.env.BOT_TOKEN);
const adminId = process.env.ADMIN_ID;

const groupsFile = path.join(__dirname, "../../groups.json");

// تحميل الجروبات
function loadGroups() {
  if (!fs.existsSync(groupsFile)) {
    fs.writeFileSync(groupsFile, JSON.stringify([]));
  }
  return JSON.parse(fs.readFileSync(groupsFile));
}

// حفظ الجروبات
function saveGroups(groups) {
  fs.writeFileSync(groupsFile, JSON.stringify(groups, null, 2));
}

// لقط وحفظ الأهداف تلقائياً عند استقبال أي رسالة (صخر ومضمون 100%)
bot.on("message", async (ctx, next) => {
  try {
    const chat = ctx.chat;

    if (
      chat &&
      (chat.type === "group" ||
        chat.type === "supergroup" ||
        chat.type === "channel")
    ) {
      let groups = loadGroups();
      const exists = groups.find((g) => g.id === chat.id);

      if (!exists) {
        groups.push({
          id: chat.id,
          title: chat.title,
          type: chat.type
        });

        saveGroups(groups);
        console.log(`✅ Saved New Target: ${chat.title}`);
      }
    }
  } catch (err) {
    console.log("❌ Auto Save Error:", err.message);
  }
  return next();
});

bot.start((ctx) => {
  if (ctx.chat.type !== "private") return;
  ctx.reply("🚀 ارفع ملف الأسئلة TXT ثم استخدم /publish");
});

// رفع واستقبال ملفات الأسئلة 
bot.on("document", async (ctx) => {
  if (String(ctx.from.id) !== String(adminId)) return;
  return handleUpload(ctx);
});

// أمر النشر وبناء قائمة الأزرار
bot.command("publish", async (ctx) => {
  if (String(ctx.from.id) !== String(adminId)) {
    return ctx.reply("❌ للأدمن فقط");
  }
  return handlePublish(ctx);
});

// 🎯 التعديل الفولاذي المعتمد منك: التقاط كليكة الزرار وضخ الكويز للجروب المختار فوراً
bot.action(/publish_(.+)/, async (ctx) => {
  try {
    const groupId = ctx.match[1];
    await ctx.answerCbQuery(); // مسح علامة التحميل الشفافة من الزرار فوراً
    return publishFn(ctx, groupId);
  } catch (err) {
    console.log("❌ Action Error:", err.message);
  }
});

module.exports = bot;