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

// 🔐 Variables desde Railway
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

// 🧠 memoria de alertas enviadas
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
      '--disable-dev-shm-usage'
    ]
  });

  const page = await browser.newPage();

  console.log('🤖 Bot corriendo...');

  // 👋 mensaje al iniciar
  await sendTelegram("👋 Hola! Soy el bot de BTS y ya estoy activo 🚨");

  while (true) {
    let encontrados = [];
    let vistos = new Set();

    for (const entry of URLS) {
      try {
        await page.goto(entry.url, { waitUntil: 'networkidle' });

        for (const sector of SECTORS) {
          const elements = await page.locator(`text=${sector}`).all();

          for (const el of elements) {
            const parent = await el.locator('xpath=..').innerText();

            const isAvailable =
              !parent.toLowerCase().includes('agotado') &&
              !parent.toLowerCase().includes('sold out') &&
              !parent.toLowerCase().includes('no disponible');

            const key = `${entry.fecha}-${sector}`;

            if (isAvailable && !vistos.has(key) && !yaNotificados.has(key)) {
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
        mensaje += `🎟️ ${item.sector}\n`;
        mensaje += `📅 ${item.fecha}\n`;
        mensaje += `👉 ${item.url}\n\n`;
      }

      await sendTelegram(mensaje);
      console.log("TOKEN:", TELEGRAM_TOKEN);
      console.log("CHAT_ID:", CHAT_ID);

      console.log('🚨 ALERTA ENVIADA');

      await new Promise(r => setTimeout(r, 180000)); // cooldown 3 min
    } else {
      console.log('⏳ Sin disponibilidad...');
    }

    await new Promise(r => setTimeout(r, 30000)); // check cada 30s
  }
})();