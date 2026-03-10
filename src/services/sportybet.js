const puppeteer = require('puppeteer');

const LIVE_URL = 'https://www.sportybet.com/ng/sport/football/live_list';

// Filter criteria
const MIN_MINUTE = 30;
const MIN_HOME_ODD = 1.40;
const MAX_HOME_ODD = 2.5;
const ALLOWED_SCORES = [
  { home: 0, away: 0 },
  { home: 1, away: 1 },
];

// In-memory cache
let cache = { games: null, timestamp: 0 };
const CACHE_TTL_MS = 30_000;

// Promise lock — prevents multiple simultaneous browser launches
let pendingScrape = null;

async function scrapeAllGames() {
  console.log('[Scraper] Launching browser...');

  // Resolved here (not at module load) so a missing Chrome doesn't crash the server on startup
  const executablePath = process.env.CHROME_PATH || puppeteer.executablePath();

  const browser = await puppeteer.launch({
    headless: true,
    executablePath,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-first-run',
    ],
  });

  try {
    const page = await browser.newPage();

    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // Block images/fonts/stylesheets to speed up load
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (['image', 'font', 'stylesheet'].includes(req.resourceType())) {
        req.abort();
      } else {
        req.continue();
      }
    });

    await page.goto(LIVE_URL, { waitUntil: 'domcontentloaded', timeout: 40000 });

    // Wait for at least one game row to appear
    await page.waitForSelector('.match-row', { timeout: 20000 });

    const games = await page.evaluate(() => {
      const results = [];

      // Each .m-table.match-table groups rows under one league
      const leagueTables = document.querySelectorAll('.m-table.match-table');

      leagueTables.forEach((table) => {
        const league = table.querySelector('.league-row .league')?.textContent?.trim() || 'Unknown League';
        const rows = table.querySelectorAll('.m-table-row.match-row.football-row');

        rows.forEach((row) => {
          // Teams
          const homeTeam = row.querySelector('.home-team')?.textContent?.trim() || '';
          const awayTeam = row.querySelector('.away-team')?.textContent?.trim() || '';

          // Stable event ID from title attribute on .teams div
          const teamsEl = row.querySelector('.teams');
          const title = teamsEl?.getAttribute('title') || `${homeTeam} vs ${awayTeam}`;
          const eventId = title.toLowerCase().replace(/\s+/g, '-');

          // Clock: "67:14" → 67 min | "HT" → 45 | "45+2:00" → 47
          const clockText = row.querySelector('.clock-time')?.textContent?.trim() || '0';
          let minute = 0;
          if (clockText === 'HT') {
            minute = 45;
          } else {
            const base = clockText.split(':')[0];
            if (base.includes('+')) {
              const [main, extra] = base.split('+');
              minute = parseInt(main, 10) + parseInt(extra, 10);
            } else {
              minute = parseInt(base, 10) || 0;
            }
          }

          // Score: first .score-item = home, second = away
          const scoreItems = row.querySelectorAll('.score .score-item');
          const homeScore = parseInt(scoreItems[0]?.textContent?.trim() || '0', 10);
          const awayScore = parseInt(scoreItems[1]?.textContent?.trim() || '0', 10);

          // Odds: always from the FIRST .m-market only (1X2 market)
          const firstMarket = row.querySelector('.m-market');
          const getOdds = (sel) => {
            const text = firstMarket?.querySelector(sel)?.textContent?.trim();
            const val = parseFloat(text);
            return isNaN(val) ? null : val;
          };

          const homeOdd = getOdds('[data-op="desktop-outcome_0"] .m-outcome-odds');
          const drawOdd = getOdds('[data-op="desktop-outcome_1"] .m-outcome-odds');
          const awayOdd = getOdds('[data-op="desktop-outcome_2"] .m-outcome-odds');

          results.push({ eventId, homeTeam, awayTeam, homeScore, awayScore, minute, homeOdd, drawOdd, awayOdd, league });
        });
      });

      return results;
    });

    const valid = games.filter((g) => g.homeTeam && g.awayTeam);
    console.log(`[Scraper] Scraped ${valid.length} live games`);
    return valid;

  } finally {
    await browser.close();
  }
}

function matchesCriteria(game) {
  const scoreMatch = ALLOWED_SCORES.some(
    (s) => s.home === game.homeScore && s.away === game.awayScore
  );
  const minuteMatch = game.minute > MIN_MINUTE;
  const oddMatch =
    game.homeOdd !== null &&
    game.homeOdd >= MIN_HOME_ODD &&
    game.homeOdd <= MAX_HOME_ODD;

  return scoreMatch && minuteMatch && oddMatch;
}

async function getFilteredGames() {
  const now = Date.now();

  // Return cache if still fresh
  if (cache.games && now - cache.timestamp < CACHE_TTL_MS) {
    console.log('[Scraper] Returning cached results');
    return cache.games.filter(matchesCriteria);
  }

  // If a scrape is already running, wait for it instead of launching another browser
  if (!pendingScrape) {
    pendingScrape = scrapeAllGames()
      .then((games) => {
        cache = { games, timestamp: Date.now() };
        return games;
      })
      .finally(() => {
        pendingScrape = null;
      });
  } else {
    console.log('[Scraper] Scrape already in progress, waiting...');
  }

  const games = await pendingScrape;
  return games.filter(matchesCriteria);
}

module.exports = { getFilteredGames, scrapeAllGames, matchesCriteria };
