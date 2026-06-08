const db = require('../../database/db');
const { getSession, setSession } = require('../../utils/conversationSessions');
const { parseQuestions } = require('../../engine/parser');
const { renderMenu } = require('./renderMenu');
const { loadQuizzes, saveQuizzes } = require('../../utils/storage');

/**
 * معالج استقبال النصوص والملفات المرفوعة لبناء شجرة الـ LMS
 */
async function handleIncomingTextAndFiles(ctx) {
  try {
    // استقبال العمليات للأدمن فقط
    if (String(ctx.from.id) !== String(process.env.ADMIN_ID)) return;

    const session = getSession(ctx.from.id);
    if (!session) return; // لا توجد جلسة إدخال بيانات مفتوحة حالياً

    // ==========================================
    // 1. استقبال اسم المجلد الجديد (ترم / مادة / محاضرة)
    // ==========================================
    if (session.step === 'waiting_folder_name') {
      if (!ctx.message.text) {
        return ctx.reply('❌ خطأ: يرجى إرسال اسم المجلد كرسالة نصية فقط!');
      }

      const name = ctx.message.text.trim();
      
      db.prepare(`
        INSERT INTO nodes (name, type, parent_id)
        VALUES (?, 'folder', ?)
      `).run(name, session.parentId);

      const currentFolderId = session.currentFolderId;
      
      // استعادة وضع التصفح وحفظ المجلد الحالي
      setSession(ctx.from.id, {
        currentFolderId: currentFolderId
      });

      await ctx.reply(`✅ تم إنشاء المجلد بنجاح:\n📁 **${name}**`);
      
      // تحديث وعرض القائمة الحالية مباشرة أمام الأدمن
      return renderMenu(ctx, currentFolderId, true);
    }

    // ==========================================
    // 2. استقبال ملفات الـ PDF / الملخصات (دعم الرفع المتعدد)
    // ==========================================
    if (session.step === 'waiting_file') {
      const file = ctx.message.document;
      if (!file) {
        return ctx.reply('❌ خطأ: يرجى إرسال الملف المطلوب كـ Document (PDF, PPTX, Word...)!');
      }

      db.prepare(`
        INSERT INTO nodes (name, type, parent_id, telegram_file_id)
        VALUES (?, 'file', ?, ?)
      `).run(file.file_name, session.parentId, file.file_id);

      await ctx.reply(
        `✅ تم رفع وربط الملف الأكاديمي بنجاح:\n📄 **${file.file_name}**\n\n` +
        `📥 يمكنك إرسال المزيد من الملفات الآن بشكل متتابع، أو اضغط على الزر بالأسفل للإنهاء 👇`
      );
      return;
    }

    // ==========================================
    // 3. استقبال المقاطع الصوتية / الشروحات (دعم الرفع المتعدد)
    // ==========================================
    if (session.step === 'waiting_audio') {
      const audio = ctx.message.audio || ctx.message.voice || ctx.message.document;
      if (!audio) {
        return ctx.reply('❌ خطأ: يرجى إرسال ملف صوتي أو تسجيل صوتي (MP3, Voice, Document)!');
      }

      const audioName = audio.file_name || audio.title || `شرح صوتي - ${new Date().toLocaleDateString('ar-EG')}`;

      db.prepare(`
        INSERT INTO nodes (name, type, parent_id, telegram_file_id)
        VALUES (?, 'audio', ?, ?)
      `).run(audioName, session.parentId, audio.file_id);

      await ctx.reply(
        `✅ تم رفع وربط الشرح الصوتي بنجاح:\n🎧 **${audioName}**\n\n` +
        `📥 يمكنك إرسال المزيد من الصوتيات الآن بشكل متتابع، أو اضغط على الزر بالأسفل للإنهاء 👇`
      );
      return;
    }

    // ==========================================
    // 4. استقبال ملف أسئلة الكويز (.txt / .pdf / .docx)
    // ==========================================
    if (session.step === 'waiting_quiz') {
      const file = ctx.message.document;
      if (!file) {
        return ctx.reply('❌ يرجى رفع ملف الأسئلة المطلوب.');
      }

      const fileName = file.file_name;
      const fileExtension = fileName.split('.').pop().toLowerCase();

      if (!['txt', 'pdf', 'docx'].includes(fileExtension)) {
        return ctx.reply('❌ يرجى رفع ملف أسئلة بصيغة .txt أو .pdf أو .docx فقط.');
      }

      try {
        await ctx.reply('⏳ جاري تحميل وقراءة محتوى الملف... انتظر ثوانٍ معدودة.');
        
        const fileLink = await ctx.telegram.getFileLink(file.file_id);
        const response = await fetch(fileLink.href);
        const fileBuffer = Buffer.from(await response.arrayBuffer());
        
        let questions = [];

        if (fileExtension === 'txt') {
          const text = fileBuffer.toString('utf8');
          questions = parseQuestions(text);
        } else {
          const { parseQuizWithAI } = require('../../utils/aiParser');
          const apiKey = process.env.GEMINI_API_KEY;
          questions = await parseQuizWithAI(fileBuffer, fileExtension, apiKey);
        }

        if (!questions || questions.length === 0) {
          return ctx.reply('❌ فشل تفكيك الأسئلة. تأكد أن صياغة الملف تطابق التنسيق المطلوب.');
        }

        const quizTitle = fileName.replace(/\.(txt|pdf|docx)$/i, '').replace(/- Copy(\s*\(\d+\))?/gi, '').trim();

        // 1. إنشاء نود الكويز في شجرة المنصة
        const result = db.prepare(`
          INSERT INTO nodes (name, type, parent_id)
          VALUES (?, 'quiz', ?)
        `).run(quizTitle, session.parentId);

        const quizNodeId = result.lastInsertRowid;

        // 2. حفظ الأسئلة في ملف quizzes.json تحت معرف النود الفريد ليتسنى للطلاب حلها لاحقاً
        const quizzes = loadQuizzes();
        quizzes[`node_${quizNodeId}`] = {
          lectureName: quizTitle,
          questions: questions
        };
        saveQuizzes(quizzes);

        const currentFolderId = session.currentFolderId;
        
        // استعادة وضع التصفح وحفظ المجلد الحالي
        setSession(ctx.from.id, {
          currentFolderId: currentFolderId
        });

        await ctx.reply(
          `🎉 **تم إنشاء وتوليد الكويز بنجاح عبر ${fileExtension === 'txt' ? 'النظام التقليدي' : 'الذكاء الاصطناعي'}!**\n\n` +
          `📝 العنوان: [ ${quizTitle} ]\n` +
          `📊 إجمالي الأسئلة المستخرجة: [ ${questions.length} سؤال ]\n\n` +
          `تم حفظ الكويز في شجرة المواد بنجاح ويمكن للطلاب حله مباشرة داخل البوت الآن! 🧠✨`
        );

        return renderMenu(ctx, currentFolderId, true);

      } catch (err) {
        console.error('❌ Error parsing quiz in node:', err.message);
        ctx.reply(`❌ حدث خطأ غير متوقع أثناء معالجة وحفظ الكويز: ${err.message}`);
      }
    }

    // ==========================================
    // 5. استقبال الصور والمخططات الطبية (دعم الرفع المتعدد)
    // ==========================================
    if (session.step === 'waiting_photo') {
      const photoArray = ctx.message.photo;
      const doc = ctx.message.document;
      
      let fileId = null;
      let fileName = `مخطط توضيحي - ${new Date().toLocaleDateString('ar-EG')}`;

      if (photoArray && photoArray.length > 0) {
        fileId = photoArray[photoArray.length - 1].file_id;
      } else if (doc && doc.mime_type && doc.mime_type.startsWith('image/')) {
        fileId = doc.file_id;
        fileName = doc.file_name;
      }

      if (!fileId) {
        return ctx.reply('❌ خطأ: يرجى إرسال ملف الصورة المطلوب كصورة (Photo) أو مستند صورة!');
      }

      db.prepare(`
        INSERT INTO nodes (name, type, parent_id, telegram_file_id)
        VALUES (?, 'photo', ?, ?)
      `).run(fileName, session.parentId, fileId);

      await ctx.reply(
        `✅ تم رفع وربط الصورة التوضيحية بنجاح:\n🖼️ **${fileName}**\n\n` +
        `📥 يمكنك إرسال المزيد من الصور الآن بشكل متتابع، أو اضغط على الزر بالأسفل للإنهاء 👇`
      );
      return;
    }

    // ==========================================
    // 6. استقبال رسالة نصية أو توجيه أكاديمي
    // ==========================================
    if (session.step === 'waiting_text_message') {
      if (!ctx.message.text) {
        return ctx.reply('❌ خطأ: يرجى إرسال الرسالة كنص فقط!');
      }

      const textMsg = ctx.message.text.trim();

      db.prepare(`
        INSERT INTO nodes (name, type, parent_id)
        VALUES (?, 'text', ?)
      `).run(textMsg, session.parentId);

      const currentFolderId = session.currentFolderId;

      // استعادة وضع التصفح وحفظ المجلد الحالي
      setSession(ctx.from.id, {
        currentFolderId: currentFolderId
      });

      await ctx.reply(
        `✅ تم حفظ الرسالة النصية بنجاح:\n\n` +
        `✍️ **محتوى الرسالة:**\n` +
        `"${textMsg}"`
      );

      return renderMenu(ctx, currentFolderId, true);
    }

    // ==========================================
    // 7. استقبال الاسم الجديد لإعادة تسمية العنصر
    // ==========================================
    if (session.step === 'waiting_rename_name') {
      if (!ctx.message.text) {
        return ctx.reply('❌ خطأ: يرجى إرسال الاسم الجديد كرسالة نصية فقط!');
      }

      const newName = ctx.message.text.trim();
      const targetNodeId = session.targetNodeId;

      const node = db.prepare('SELECT * FROM nodes WHERE id = ?').get(targetNodeId);
      if (!node) {
        setSession(ctx.from.id, { currentFolderId: session.currentFolderId });
        await ctx.reply('❌ خطأ: لم يتم العثور على العنصر المراد تعديل اسمه!');
        return renderMenu(ctx, session.currentFolderId, true);
      }

      // تحديث قاعدة البيانات
      db.prepare('UPDATE nodes SET name = ? WHERE id = ?').run(newName, targetNodeId);

      // إذا كان كويز، تحديث الاسم في ملف quizzes.json ومهاجرة نتائج الطلاب السابقة في scores.json
      if (node.type === 'quiz') {
        try {
          const quizzes = loadQuizzes();
          if (quizzes[`node_${targetNodeId}`]) {
            quizzes[`node_${targetNodeId}`].lectureName = newName;
            saveQuizzes(quizzes);
          }
        } catch (quizErr) {
          console.error('❌ Error updating quiz name in JSON:', quizErr.message);
        }

        try {
          const fs = require('fs');
          const path = require('path');
          const scoresFile = path.join(__dirname, '../../../scores.json');
          if (fs.existsSync(scoresFile)) {
            const scores = JSON.parse(fs.readFileSync(scoresFile, 'utf8'));
            let scoresUpdated = false;

            const oldSuffix = `_${node.name}`;
            const newSuffix = `_${newName}`;

            for (const key of Object.keys(scores)) {
              if (key.endsWith(oldSuffix) && !key.startsWith('profile_')) {
                const userId = key.substring(0, key.length - oldSuffix.length);
                const newKey = `${userId}${newSuffix}`;
                
                scores[newKey] = scores[key];
                delete scores[key];
                scoresUpdated = true;
              }
            }

            if (scoresUpdated) {
              fs.writeFileSync(scoresFile, JSON.stringify(scores, null, 2));
              console.log(`✔ Migrated quiz scores in scores.json from "${node.name}" to "${newName}"`);
            }
          }
        } catch (scoresErr) {
          console.error('❌ Error migrating quiz scores on rename:', scoresErr.message);
        }
      }

      const currentFolderId = session.currentFolderId;
      setSession(ctx.from.id, {
        currentFolderId: currentFolderId
      });

      await ctx.reply(`✅ تم تعديل الاسم بنجاح إلى:\n✨ **${newName}**`);
      return renderMenu(ctx, currentFolderId, true);
    }

  } catch (error) {
    console.error('❌ Error in handleIncomingTextAndFiles:', error.message);
    ctx.reply('❌ حدث خطأ غير متوقع أثناء استقبال ومعالجة البيانات.');
  }
}

module.exports = {
  handleIncomingTextAndFiles
};