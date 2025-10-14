const express = require("express");
const puppeteer = require("puppeteer-core");
const chromium = require("@sparticuz/chromium");

const app = express();
app.use(express.json());

let cachedCookies = null;
let lastLoginTime = null;
const CACHE_DURATION = 50 * 60 * 1000;

chromium.setHeadlessMode = true;
chromium.setGraphicsMode = false;

async function loginToRemOnline(username, password) {
  console.log("🚀 Запуск браузера...");

  let browser;
  try {
    browser = await puppeteer.launch({
      args: [
        ...chromium.args,
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--disable-setuid-sandbox",
        "--no-sandbox",
        "--no-zygote",
        "--single-process",
      ],
      defaultViewport: { width: 1280, height: 720 },
      executablePath: await chromium.executablePath(),
      headless: true,
    });

    const page = await browser.newPage();

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    console.log("📱 Переход на страницу логина...");

    await page.goto("https://web.roapp.io/login", {
      waitUntil: "networkidle2",
      timeout: 60000,
    });

    await page.waitForTimeout(3000);

    console.log("🔍 Ищем поля формы...");

    // ИСПРАВЛЕНО: Ищем поле "Имя пользователя"
    const usernameSelector = await page.evaluate(() => {
      // Ищем по placeholder с текстом "Имя пользователя" или "Username"
      let input = document.querySelector(
        'input[placeholder*="Имя пользователя" i]'
      );
      if (input) return 'input[placeholder*="Имя пользователя" i]';

      input = document.querySelector('input[placeholder*="Username" i]');
      if (input) return 'input[placeholder*="Username" i]';

      // Ищем input с name="username"
      input = document.querySelector('input[name="username"]');
      if (input) return 'input[name="username"]';

      // Ищем input с id="username"
      input = document.querySelector('input[id="username"]');
      if (input) return 'input[id="username"]';

      // Ищем первый текстовый input
      input = document.querySelector('input[type="text"]');
      if (input) return 'input[type="text"]';

      // Ищем любой первый input (кроме hidden)
      const inputs = Array.from(
        document.querySelectorAll('input:not([type="hidden"])')
      );
      if (inputs.length > 0) {
        inputs[0].setAttribute("data-username-field", "true");
        return 'input[data-username-field="true"]';
      }

      return null;
    });

    if (!usernameSelector) {
      const html = await page.content();
      console.log("📄 HTML страницы:", html.substring(0, 2000));
      throw new Error("Не найдено поле для имени пользователя");
    }

    console.log(`✅ Найден селектор username: ${usernameSelector}`);

    // Ищем поле "Пароль"
    const passwordSelector = await page.evaluate(() => {
      // Ищем input с type="password"
      let input = document.querySelector('input[type="password"]');
      if (input) return 'input[type="password"]';

      // Ищем по placeholder
      input = document.querySelector('input[placeholder*="Пароль" i]');
      if (input) return 'input[placeholder*="Пароль" i]';

      input = document.querySelector('input[placeholder*="Password" i]');
      if (input) return 'input[placeholder*="Password" i]';

      // Ищем по name
      input = document.querySelector('input[name="password"]');
      if (input) return 'input[name="password"]';

      return null;
    });

    if (!passwordSelector) {
      throw new Error("Не найдено поле для пароля");
    }

    console.log(`✅ Найден селектор password: ${passwordSelector}`);

    // Вводим данные
    console.log("✍️ Ввод имени пользователя...");
    await page.waitForSelector(usernameSelector, { timeout: 5000 });
    await page.click(usernameSelector, { clickCount: 3 }); // Выделяем текст если есть
    await page.type(usernameSelector, username, { delay: 100 });

    console.log("✍️ Ввод пароля...");
    await page.waitForSelector(passwordSelector, { timeout: 5000 });
    await page.click(passwordSelector);
    await page.type(passwordSelector, password, { delay: 100 });

    // Ищем кнопку входа
    console.log("🔍 Ищем кнопку входа...");
    const submitButton = await page.evaluate(() => {
      // Ищем кнопку submit
      let btn = document.querySelector('button[type="submit"]');
      if (btn) return 'button[type="submit"]';

      // Ищем кнопку с текстом входа
      const buttons = Array.from(
        document.querySelectorAll('button, input[type="submit"]')
      );
      btn = buttons.find((b) => {
        const text = (b.textContent || b.value || "").toLowerCase();
        return (
          text.includes("вход") ||
          text.includes("войти") ||
          text.includes("login") ||
          text.includes("sign in")
        );
      });

      if (btn) {
        btn.setAttribute("data-login-btn", "true");
        return '[data-login-btn="true"]';
      }

      // Последняя попытка - первая кнопка на странице
      const firstBtn = document.querySelector("button");
      if (firstBtn) {
        firstBtn.setAttribute("data-first-btn", "true");
        return '[data-first-btn="true"]';
      }

      return null;
    });

    if (!submitButton) {
      throw new Error("Не найдена кнопка входа");
    }

    console.log(`✅ Найдена кнопка: ${submitButton}`);
    console.log("🔐 Нажимаем кнопку входа...");

    await Promise.all([
      page.click(submitButton),
      page
        .waitForNavigation({
          waitUntil: "networkidle2",
          timeout: 45000,
        })
        .catch((e) => console.log("Navigation timeout, but continuing...")),
    ]);

    console.log("⏳ Ждем завершения логина...");
    await page.waitForTimeout(3000);

    // Проверяем успешность логина
    const currentUrl = page.url();
    console.log(`📍 Текущий URL: ${currentUrl}`);

    if (currentUrl.includes("/login")) {
      // Проверяем наличие ошибок на странице
      const errorMessage = await page.evaluate(() => {
        const error = document.querySelector(
          '.error, .alert, [class*="error"]'
        );
        return error ? error.textContent : null;
      });

      throw new Error(
        errorMessage || "Логин не удался - остались на странице логина"
      );
    }

    console.log("🍪 Получение cookies...");
    const cookies = await page.cookies();

    if (cookies.length === 0) {
      throw new Error("Cookies не получены");
    }

    const cookieString = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

    console.log(`✅ Успешно получено ${cookies.length} cookies`);

    await browser.close();
    return cookieString;
  } catch (error) {
    console.error("❌ Ошибка:", error.message);
    if (browser) {
      try {
        await browser.close();
      } catch (e) {}
    }
    throw error;
  }
}

app.get("/", (req, res) => {
  res.json({
    service: "RemOnline Login Service",
    version: "3.2.0 - Fly.io (Username Field)",
    platform: "Fly.io",
    memory: process.memoryUsage(),
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

app.post("/get-cookies", async (req, res) => {
  // ИСПРАВЛЕНО: Принимаем и email, и username для обратной совместимости
  const username = req.body.username || req.body.email;
  const password = req.body.password;

  if (!username || !password) {
    return res.status(400).json({
      success: false,
      error: "Username/email и password обязательны",
    });
  }

  const now = Date.now();

  if (cachedCookies && lastLoginTime && now - lastLoginTime < CACHE_DURATION) {
    console.log("✅ Возвращаем из кеша");
    return res.json({
      success: true,
      cookies: cachedCookies,
      cached: true,
      expiresIn: Math.round((CACHE_DURATION - (now - lastLoginTime)) / 1000),
    });
  }

  try {
    console.log(`🔄 Новый логин для пользователя: ${username}`);
    const cookies = await loginToRemOnline(username, password);

    cachedCookies = cookies;
    lastLoginTime = now;

    res.json({
      success: true,
      cookies,
      cached: false,
      expiresIn: CACHE_DURATION / 1000,
    });
  } catch (error) {
    console.error("❌ Ошибка логина:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    memory: process.memoryUsage(),
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server на Fly.io, порт ${PORT}`);
  console.log(`💾 Кеш: ${CACHE_DURATION / 1000 / 60} минут`);
});
