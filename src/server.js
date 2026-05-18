require("dotenv").config(); // شحن البيئة المحيطة والـ Tokens فوراً
const bot = require("./bot/index"); // استدعاء كائن البوت المطهر

// 🎯 قفل اللعبة هنا: الـ Launch الفريد والوحيد المعتمد على مستوى السيستم بالكامل
bot.launch({
  allowedUpdates: [
    "message",
    "callback_query",
    "poll_answer",
    "poll"
  ]
}).then(() => {
  console.log("🤖 Telegram Quiz Bot is fully launched with Deep Allowed Updates! [ACTIVE]");
}).catch((err) => {
  console.error("❌ Launch Critical Error:", err.message);
});

// تفعيل الـ Graceful Shutdown لإغلاق آمن وحماية الـ File Streams
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));