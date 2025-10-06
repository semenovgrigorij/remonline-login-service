// server.js
const express = require("express");
const puppeteer = require("puppeteer");
const cors = require("cors");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Кеш cookies (щоб не логінитись кожного разу)
let cachedCookies = null;
let lastLoginTime = null;
const CACHE_DURATION = 15 * 60 * 1000; // 15 хвилин

app.get("/", (req, res) => {
  res.json({
    status: "RemOnline Login Service",
    version: "1.0.0",
    hasCachedCookies: !!cachedCookies,
  });
});

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
      console.log("Повертаємо кешовані cookies");
      return res.json({
        success: true,
        cookies: cachedCookies,
        cached: true,
      });
    }

    console.log("Виконується логін в RemOnline...");

    const browser = await puppeteer.launch({
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--no-first-run",
        "--no-zygote",
        "--disable-gpu",
      ],
    });

    const page = await browser.newPage();

    await page.goto("https://web.roapp.io/login", {
      waitUntil: "networkidle0",
      timeout: 30000,
    });

    const usernameInput = await page.waitForSelector('input[type="text"]', {
      visible: true,
      timeout: 10000,
    });

    const passwordInput = await page.waitForSelector('input[type="password"]', {
      visible: true,
      timeout: 5000,
    });

    await usernameInput.type(email, { delay: 100 });
    await passwordInput.type(password, { delay: 100 });

    const submitButton = await page.$('button[type="submit"]');

    await Promise.all([
      submitButton.click(),
      page.waitForFunction(() => !window.location.href.includes("/login"), {
        timeout: 15000,
      }),
    ]);

    await new Promise((resolve) => setTimeout(resolve, 3000));

    const cookies = await page.cookies();
    const cookieString = cookies
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join("; ");

    await browser.close();

    // Кешуємо cookies
    cachedCookies = cookieString;
    lastLoginTime = now;

    console.log("Логін успішний, cookies отримано");

    res.json({
      success: true,
      cookies: cookieString,
      cached: false,
    });
  } catch (error) {
    console.error("Помилка логіну:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

app.listen(PORT, () => {
  console.log(`Login Service запущено на порту ${PORT}`);
});
