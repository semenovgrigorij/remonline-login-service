const express = require("express");
const puppeteer = require("puppeteer-core");
const chromium = require("@sparticuz/chromium");

const app = express();
app.use(express.json());

// Кеш для cookies
let cachedCookies = null;
let lastLoginTime = null;
const CACHE_DURATION = 10 * 60 * 1000; // 10 хвилин

async function loginToRemOnline(email, password) {
  console.log("🚀 Запуск браузера...");

  let browser;
  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });

    console.log("✅ Браузер запущено");

    const page = await browser.newPage();

    // Збільшено timeout для повільних з'єднань
    page.setDefaultNavigationTimeout(60000); // 60 секунд
    page.setDefaultTimeout(60000);

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    console.log("📱 Перехід на сторінку логіну...");

    // ЗМІНЕНО: Використовуємо 'domcontentloaded' замість 'networkidle0' - швидше
    await page.goto("https://web.roapp.io/login", {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });

    console.log("⏳ Чекаємо форму логіну...");
    await page.waitForSelector('input[name="email"]', { timeout: 10000 });

    console.log("✍️ Введення даних...");
    await page.type('input[name="email"]', email, { delay: 50 });
    await page.type('input[name="password"]', password, { delay: 50 });

    console.log("🔐 Натискаємо кнопку входу...");
    await page.click('button[type="submit"]');

    console.log("⏳ Чекаємо завершення логіну...");
    // ЗМІНЕНО: Чекаємо навігацію з більшим timeout
    await page.waitForNavigation({
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });

    // Додаткова пауза після логіну
    await page.waitForTimeout(2000);

    console.log("🍪 Отримання cookies...");
    const cookies = await page.cookies();

    if (cookies.length === 0) {
      throw new Error("Не вдалося отримати cookies - можливо, невдалий логін");
    }

    const cookieString = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

    console.log(`✅ Успішно отримано ${cookies.length} cookies`);

    await browser.close();
    return cookieString;
  } catch (error) {
    console.error("❌ Помилка:", error.message);
    if (browser) {
      try {
        await browser.close();
      } catch (e) {
        console.error("Помилка закриття браузера:", e.message);
      }
    }
    throw error;
  }
}

// Головна сторінка
app.get("/", (req, res) => {
  res.json({
    status: "RemOnline Login Service",
    version: "2.1.0",
    engine: "puppeteer-core + chromium",
    hasCachedCookies: !!cachedCookies,
    lastLogin: lastLoginTime ? new Date(lastLoginTime).toISOString() : null,
    cacheExpiresIn:
      cachedCookies && lastLoginTime
        ? Math.max(
            0,
            Math.round((CACHE_DURATION - (Date.now() - lastLoginTime)) / 1000)
          )
        : 0,
  });
});

// Endpoint для отримання cookies
app.post("/get-cookies", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: "Email та password обов'язкові",
      });
    }

    // Перевірка кешу
    const now = Date.now();
    if (
      cachedCookies &&
      lastLoginTime &&
      now - lastLoginTime < CACHE_DURATION
    ) {
      console.log("✅ Повертаємо cookies з кешу");
      return res.json({
        success: true,
        cookies: cachedCookies,
        cached: true,
        expiresIn: Math.round((CACHE_DURATION - (now - lastLoginTime)) / 1000),
      });
    }

    // Новий логін
    console.log("🔄 Виконуємо новий логін...");
    const cookies = await loginToRemOnline(email, password);

    cachedCookies = cookies;
    lastLoginTime = now;

    res.json({
      success: true,
      cookies: cookies,
      cached: false,
      expiresIn: CACHE_DURATION / 1000,
    });
  } catch (error) {
    console.error("❌ Помилка логіну:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Login service запущено на порту ${PORT}`);
  console.log(`🔧 Timeout: 60 секунд`);
  console.log(`💾 Cache duration: ${CACHE_DURATION / 1000 / 60} хвилин`);
});
