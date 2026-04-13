const { chromium } = require('playwright');
const fetch = require('node-fetch');

// 🔗 URLs
const URLS = [
  { url: 'https://www.allaccess.com.ar/event/bts-21-de-octubre', fecha: '21 Oct' },
  { url: 'https://www.allaccess.com.ar/event/bts-23-de-octubre', fecha: '23 Oct' },
  { url: 'https://www.allaccess.com.ar/event/bts-24-de-octubre', fecha: '24 Oct' }
];

// 🎯 Sectores
const SECTORS = ['Campo', 'Cabecera Sur', 'Cabecera Norte'];

// 🔐 Variables
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

// 🧠 memoria
let yaNotificados = new Set();

async function sendTelegram(message) {
  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: message
      })
    });

    const data = await res.json();
    console.log("Telegram response:", data);

  } catch (err) {
    console.log('⚠️ Error enviando a Telegram');
  }
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled'
    ]
  });

  let page = await browser.newPage();

  // 🧠 headers más humanos
  await page.setExtraHTTPHeaders({
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36'
  });

  console.log('🤖 Bot corriendo...');

  // 👋 mensaje inicial
  await sendTelegram("👋 Hola! Soy el bot de BTS y ya estoy activo 🚨");

  while (true) {
    let encontrados = [];
    let vistos = new Set();

    try {
      // 🔄 recrear página cada loop (evita crashes)
      await page.close();
      page = await browser.newPage();

      await page.setExtraHTTPHeaders({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36'
      });

      for (const entry of URLS) {
        try {
          await page.goto(entry.url, {
            waitUntil: 'domcontentloaded',
            timeout: 60000
          });

          // ⏳ esperar JS dinámico
          await page.waitForTimeout(3000);

          for (const sector of SECTORS) {
            const elements = await page.locator(`text=${sector}`).all();

            for (const el of elements) {
              const parent = await el.locator('xpath=..').innerText();
              const text = parent.toLowerCase();

              const isSoldOut =
                text.includes('agotado') ||
                text.includes('sold out') ||
                text.includes('no disponible');

              // 🚫 excluir cosas que no querés
              const isValidSector =
                !text.includes('soundcheck') &&
                !text.includes('vip') &&
                !text.includes('hospitality') &&
                !text.includes('package');

              // 🚫 evitar falsos positivos tipo "campo agotado"
              if (text.includes(sector.toLowerCase()) && isSoldOut) continue;

              const key = `${entry.fecha}-${sector}`;

              if (!isSoldOut && isValidSector && !vistos.has(key) && !yaNotificados.has(key)) {
                encontrados.push({
                  fecha: entry.fecha,
                  sector: sector,
                  url: entry.url
                });

                vistos.add(key);
                yaNotificados.add(key);
              }
            }
          }

        } catch (err) {
          console.log(`⚠️ Error en ${entry.fecha}`);
        }
      }

      if (encontrados.length > 0) {
        const prioridad = { 'Campo': 1, 'Cabecera Sur': 2, 'Cabecera Norte': 3 };

        encontrados.sort((a, b) => prioridad[a.sector] - prioridad[b.sector]);

        let mensaje = `🚨 BTS DISPONIBLE 🚨\n\n`;

        for (const item of encontrados) {
          mensaje += `🎟️ Sector: ${item.sector}\n`;
          mensaje += `📅 Fecha: ${item.fecha}\n`;
          mensaje += `🔗 Comprar: ${item.url}\n\n`;
        }

        await sendTelegram(mensaje);

        console.log('🚨 ALERTA ENVIADA');

        // 💤 cooldown para no spamear
        await new Promise(r => setTimeout(r, 180000));
      } else {
        console.log('⏳ Sin disponibilidad...');
      }

    } catch (err) {
      console.log('🔥 Error general, reiniciando loop...');
    }

    // ⏱️ cada 10 segundos
    await new Promise(r => setTimeout(r, 10000));
  }
})();