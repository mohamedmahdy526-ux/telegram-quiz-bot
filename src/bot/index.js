const { Telegraf } = require("telegraf");
const fs = require("fs");
const path = require("path");

const { handleUpload } = require("./handlers/upload");
const { handlePublish, publishToGroup } = require("./handlers/publish");

const bot = new Telegraf(process.env.BOT_TOKEN);
const adminId = process.env.ADMIN_ID;

const groupsFile = path.join(__dirname, "../../groups.json");

// تحميل الجروبات كـ Object (Dictionary)
function loadGroups() {
  if (!fs.existsSync(groupsFile)) {
    fs.writeFileSync(groupsFile, JSON.stringify({}));
  }
  try {
    const data = fs.readFileSync(groupsFile, "utf8");
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? {} : parsed;
  } catch (e) {
    return {};
  }
}

// حفظ الجروبات
function saveGroups(groups) {
  fs.writeFileSync(groupsFile, JSON.stringify(groups, null, 2));
}

// 🤖 حارس قنص الأهداف التلقائي
bot.on("message", async (ctx, next) => {
  try {
    const chat = ctx.chat;

    if (
      chat &&
      (chat.type === "private" ||
        chat.type === "group" ||
        chat.type === "supergroup" ||
        chat.type === "channel")
    ) {
      let groups = loadGroups();
      const targetId = String(chat.id);

      if (!groups[targetId]) {
        const chatTitle = chat.type === "private" 
          ? `👤 الخاص الخاص بك (${chat.first_name || 'Admin'})` 
          : chat.title;

        groups[targetId] = {
          id: chat.id,
          title: chatTitle,
          type: chat.type
        };

        saveGroups(groups);
        console.log(`✅ Saved New Target Object [${chat.type}]: ${chatTitle}`);
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

// استقبال ورفع ملفات الأسئلة (للأدمن فقط وفي الخاص) 🔐❌
bot.on("document", async (ctx) => {
  if (ctx.chat.type !== "private") return; 
  if (String(ctx.from.id) !== String(adminId)) return ctx.reply("❌ عذراً، هذا البوت مخصص للإشراف الأكاديمي فقط!");
  return handleUpload(ctx);
});

// أمر النشر (للأدمن فقط وفي الخاص) 🔐❌
bot.command("publish", async (ctx) => {
  if (ctx.chat.type !== "private") return;
  if (String(ctx.from.id) !== String(adminId)) return ctx.reply("❌ للأدمن فقط");
  return handlePublish(ctx);
});

// 🎯 التعديل الذهبي لإنهاء الـ Timeout: الرد الفوري وتشغيل الضخ بالخلفية
bot.action(/^publish_(.+)/, async (ctx) => {
  try {
    const groupId = ctx.match[1];
    
    // 1. اقفل علامة التحميل الشفافة في تليجرام فوراً لمنع الـ Timeout
    await ctx.answerCbQuery(); 

    // 2. رد على الأدمن فوراً وثبّت الأداء في الشات الخاص
    await ctx.reply("🚀 بدأ النشر وتوليد الكويزات في الخلفية بنجاح... يمكنك متابعة الجروب الآن 😎🔥");

    // 3. طيّر عملية النشر في الخلفية (بدون return وبدون await للـ function ككل لعدم التعطيل)
    publishToGroup(ctx, groupId);

  } catch (err) {
    console.log("❌ Action Error:", err.message);
  }
});

module.exports = bot;