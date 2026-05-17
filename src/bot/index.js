const { Telegraf } = require("telegraf");
const fs = require("fs");
const path = require("path");

const { handleUpload } = require("./handlers/upload");
const { handlePublish } = require("./handlers/publish");

const bot = new Telegraf(process.env.BOT_TOKEN);
const adminId = process.env.ADMIN_ID;

const groupsFile = path.join(__dirname, "../../groups.json");

// تحميل الجروبات من ملف JSON
function loadGroups() {
  if (!fs.existsSync(groupsFile)) {
    fs.writeFileSync(groupsFile, JSON.stringify([]));
  }
  return JSON.parse(fs.readFileSync(groupsFile));
}

// حفظ الجروبات في ملف JSON
function saveGroups(groups) {
  fs.writeFileSync(groupsFile, JSON.stringify(groups, null, 2));
}

// 📡 حارس قنص وحفظ الجروبات تلقائياً بمجرد إضافة البوت كـ Admin
bot.on("my_chat_member", async (ctx) => {
  try {
    const chat = ctx.chat;

    if (!chat || (chat.type !== "group" && chat.type !== "supergroup" && chat.type !== "channel")) {
      return;
    }

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
  } catch (err) {
    console.log("❌ Auto Save Group Error:", err.message);
  }
});

bot.start((ctx) => {
  if (ctx.chat.type !== "private") return;
  ctx.reply("🚀 ارفع ملف الأسئلة TXT ثم استخدم /publish");
});

// حارس استقبال ورفع ملفات الأسئلة
bot.on("document", async (ctx) => {
  if (String(ctx.from.id) !== String(adminId)) return;
  return handleUpload(ctx);
});

// أمر النشر والضخ الشامل للجروبات المسجلة
bot.command("publish", async (ctx) => {
  if (String(ctx.from.id) !== String(adminId)) {
    return ctx.reply("❌ للأدمن فقط");
  }
  return handlePublish(ctx);
});

module.exports = bot;