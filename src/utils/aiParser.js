const https = require("https");
const pdf = require("pdf-parse");
const mammoth = require("mammoth");

/**
 * دالة استدعاء Gemini API بشكل آمن ومباشر
 */
function callGeminiAPI(apiKey, prompt) {
  const models = [
    "gemini-2.0-flash",
    "gemini-1.5-flash"
  ];

  const makeRequest = (modelName) => {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt }
            ]
          }
        ],
        generationConfig: {
          responseMimeType: "application/json"
        }
      });

      const options = {
        hostname: 'generativelanguage.googleapis.com',
        port: 443,
        path: `/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data)
        }
      };

      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(body);
            if (parsed && parsed.candidates && parsed.candidates[0] && parsed.candidates[0].content && parsed.candidates[0].content.parts[0]) {
              resolve(parsed.candidates[0].content.parts[0].text);
            } else {
              reject(new Error(body));
            }
          } catch (e) {
            reject(e);
          }
        });
      });

      req.on('error', (e) => reject(e));
      req.write(data);
      req.end();
    });
  };

  return new Promise(async (resolve, reject) => {
    let lastError = null;
    for (const model of models) {
      try {
        const result = await makeRequest(model);
        return resolve(result);
      } catch (err) {
        lastError = err;
      }
    }
    reject(lastError || new Error("Failed to contact any Gemini models"));
  });
}

/**
 * استخراج النص من ملف PDF
 */
async function extractTextFromPdf(buffer) {
  try {
    const data = await pdf(buffer);
    return data.text;
  } catch (error) {
    throw new Error("فشل استخراج النص من ملف PDF: " + error.message);
  }
}

/**
 * استخراج النص من ملف Word (.docx)
 */
async function extractTextFromDocx(buffer) {
  try {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  } catch (error) {
    throw new Error("فشل استخراج النص من ملف Word: " + error.message);
  }
}

/**
 * الدالة الرئيسية لتحليل الملفات واستخراج الكويز بالذكاء الاصطناعي
 */
async function parseQuizWithAI(fileBuffer, fileExtension, apiKey) {
  if (!apiKey) {
    throw new Error("مفتاح GEMINI_API_KEY غير موجود. يرجى إضافته في ملف .env لتشغيل خاصية قراءة ملفات PDF والـ Word بالذكاء الاصطناعي.");
  }

  let rawText = "";
  const ext = fileExtension.toLowerCase().replace(/^\./, "");

  if (ext === "pdf") {
    rawText = await extractTextFromPdf(fileBuffer);
  } else if (ext === "docx") {
    rawText = await extractTextFromDocx(fileBuffer);
  } else if (ext === "txt") {
    rawText = fileBuffer.toString("utf8");
  } else {
    throw new Error(`امتداد الملف غير مدعوم: ${fileExtension}`);
  }

  if (!rawText || !rawText.trim()) {
    throw new Error("الملف فارغ أو لم نتمكن من استخراج أي نصوص منه.");
  }

  const prompt = `أنت بروفيسور تمريض وخبير تعليمي ومصحح كويزات.
مهمتك هي قراءة النص التالي المستخرج من ملف كويز (قد يحتوي على حروف مقلوبة أو أرقام صفحات أو ترويسات مشوهة بسبب استخراجه من PDF/Word).
استخرج الأسئلة والاختيارات والإجابة الصحيحة لكل سؤال بدقة بالغة.

الشروط والتعليمات:
1. يجب استخراج الأسئلة والاختيارات باللغة الأصلية المكتوبة بها (غالباً الإنجليزية أو العربية).
2. قم بإصلاح أي كلمات مشوهة أو حروف عربية متقطعة أو مقلوبة تلقائياً لتظهر بشكل صحيح ومفهوم.
3. حدد الاختيار الصحيح بدقة بناءً على النص أو المؤشرات الموجودة في الملف (مثل وضع علامة صح، أو وضع نجمة *، أو تلوين الإجابة، أو كتابة Answer: X، أو أي مؤشر آخر).
4. يجب أن تكون النتيجة بتنسيق JSON array of objects تماماً.

الهيكل المطلوب للـ JSON:
[
  {
    "question": "نص السؤال هنا بدون ترقيم وبدون الحرف A أو B أو C أو D",
    "options": [
      "الاختيار الأول",
      "الاختيار الثاني",
      "الاختيار الثالث",
      "الاختيار الرابع"
    ],
    "correct": 0
  }
]
ملاحظة: الـ correct هو رقم يمثل الفهرس (Index) للاختيار الصحيح (يبدأ من 0 لـ A، و1 لـ B، و2 لـ C، و3 لـ D وهكذا).

النص المراد تحليله:
"""
${rawText}
"""`;

  try {
    const aiResponse = await callGeminiAPI(apiKey, prompt);
    const cleanedJson = aiResponse.trim();
    const questions = JSON.parse(cleanedJson);

    if (!Array.isArray(questions)) {
      throw new Error("الاستجابة المستلمة من الذكاء الاصطناعي ليست مصفوفة JSON صالحة.");
    }

    return questions;
  } catch (error) {
    console.error("❌ Gemini Parsing Error:", error);
    throw new Error("حدث خطأ أثناء تحليل الأسئلة بواسطة الذكاء الاصطناعي: " + error.message);
  }
}

module.exports = {
  parseQuizWithAI
};
