const express = require("express");
const puppeteer = require("puppeteer");

const app = express();
app.use(express.json());

// Кеш для cookies
let cachedCookies = null;
let lastLoginTime = null;
const CACHE_DURATION = 10 * 60 * 1000; // 10 хвилин

// Конфігурація Puppeteer для Render
const puppeteerConfig = {
  headless: "new",
  args: [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--disable-software-rasterizer",
    "--disable-dev-tools",
    "--no-first-run",
    "--no-zygote",
    "--single-process",
    "--disable-extensions",
    "--disable-background-networking",
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-breakpad",
    "--disable-component-extensions-with-background-pages",
    "--disable-features=TranslateUI",
    "--disable-ipc-flooding-protection",
    "--disable-renderer-backgrounding",
    "--force-color-profile=srgb",
    "--metrics-recording-only",
    "--mute-audio",
  ],
  executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
};

async function loginToRemOnline(email, password) {
  console.log("🚀 Запуск браузера...");

  let browser;
  try {
    browser = await puppeteer.launch(puppeteerConfig);
    console.log("✅ Браузер запущено");

    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    );

    console.log("📱 Перехід на сторінку логіну...");
    await page.goto("https://web.roapp.io/login", {
      waitUntil: "networkidle0",
      timeout: 30000,
    });

    console.log("✍️ Введення даних...");
    await page.type('input[name="email"]', email, { delay: 100 });
    await page.type('input[name="password"]', password, { delay: 100 });

    console.log("🔐 Вхід в систему...");
    await Promise.all([
      page.click('button[type="submit"]'),
      page.waitForNavigation({ waitUntil: "networkidle0", timeout: 30000 }),
    ]);

    console.log("🍪 Отримання cookies...");
    const cookies = await page.cookies();
    const cookieString = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

    console.log(`✅ Успішно отримано ${cookies.length} cookies`);

    await browser.close();
    return cookieString;
  } catch (error) {
    console.error("❌ Помилка:", error.message);
    if (browser) await browser.close();
    throw error;
  }
}

// Головна сторінка
app.get("/", (req, res) => {
  res.json({
    status: "RemOnline Login Service",
    version: "1.0.0",
    hasCachedCookies: !!cachedCookies,
    lastLogin: lastLoginTime ? new Date(lastLoginTime).toISOString() : null,
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
});
