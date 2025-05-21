const fs = require('fs').promises;
const path = require('path');
const chromium = require('chrome-aws-lambda');
const mysql = require('mysql2/promise');
const { formatISO } = require('date-fns');

// --- DB CONFIG ---
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'ems',
  password: process.env.DB_PASSWORD || 'wmtadmin',
  database: process.env.DB_NAME || 'ip_insights_hub'
};

// Function to parse date string (e.g., "January 15, 2024" to Date object)
function parseDate(dateString) {
  return new Date(dateString);
}

// Function to log to file for testing purposes
async function logToFile(message, fileName = 'scraper-log.txt') {
  const logPath = path.join(process.cwd(), fileName);
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  
  try {
    // Append to log file
    await fs.appendFile(logPath, logMessage);
  } catch (error) {
    console.error(`Failed to write to log file: ${error.message}`);
  }
}

async function scrapeIPIndiaNews() {
  await logToFile('Starting IPIndia news scraper...');
  
  let browser = null;
  
  try {
    // --- SETUP PUPPETEER/CHROMIUM ---
    // This configuration works both locally and on Vercel
    browser = await chromium.puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath,
      headless: chromium.headless,
      ignoreHTTPSErrors: true,
    });
    
    const page = await browser.newPage();
    
    // --- SCRAPE IPIndia News Page ---
    const url = "https://ipindia.gov.in/arched-news.htm";
    await logToFile(`Navigating to ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    
    // Wait for the news container to load
    await page.waitForSelector('#news-container', { timeout: 10000 });
    
    // Extract news items
    const newsItems = await page.evaluate(() => {
      const container = document.querySelector('#news-container');
      if (!container) return [];
      
      const items = container.querySelectorAll('li');
      return Array.from(items).map(li => {
        const aTag = li.querySelector('a');
        const pTag = li.querySelector('p');
        
        if (!aTag || !pTag) return null;
        
        return {
          title: aTag.textContent.trim(),
          link: aTag.href,
          dateText: pTag.textContent.trim()
        };
      }).filter(item => item !== null);
    });
    
    await browser.close();
    browser = null;
    
    await logToFile(`Found ${newsItems.length} news items`);
    
    // Log the first few items for testing
    await logToFile(`Sample items: ${JSON.stringify(newsItems.slice(0, 3), null, 2)}`);
    
    // --- TESTING MODE: Log items and skip DB if TEST_MODE is enabled ---
    if (process.env.TEST_MODE === 'true') {
      await logToFile('TEST MODE: Skipping database operations');
      await logToFile(`All scraped items: ${JSON.stringify(newsItems, null, 2)}`);
      await logToFile("🎉 Test completed successfully.");
      return { success: true, count: newsItems.length };
    }
    
    // --- CONNECT TO DB ---
    await logToFile('Connecting to database...');
    const connection = await mysql.createConnection(dbConfig);
    
    // Get content_source_id for "IPIndia News"
    const [sourceRows] = await connection.execute(
      'SELECT id FROM content_sources WHERE keyword = ?', 
      ['IPIndia News']
    );
    
    if (sourceRows.length === 0) {
      throw new Error("content_source_id for 'IPIndia News' not found.");
    }
    
    const contentSourceId = sourceRows[0].id;
    await logToFile(`Found content_source_id: ${contentSourceId}`);
    
    let insertedCount = 0;
    let skippedCount = 0;
    
    // --- Process Each News Item ---
    for (const item of newsItems) {
      try {
        let { title, link, dateText } = item;
        
        // Ensure link is absolute
        if (!link.startsWith('http')) {
          link = `https://ipindia.gov.in/${link.replace(/^\//, '')}`;
        }
        
        // Parse the date
        const publishedAt = parseDate(dateText);
        
        // --- Skip if link already exists ---
        const [existingRows] = await connection.execute(
          'SELECT id FROM curated_contents WHERE link = ?', 
          [link]
        );
        
        if (existingRows.length > 0) {
          await logToFile(`⚠️ Skipping duplicate: ${title}`);
          skippedCount++;
          continue;
        }
        
        const now = new Date();
        const formattedNow = formatISO(now);
        const formattedPublishedAt = formatISO(publishedAt);
        
        // Insert the news item
        await connection.execute(
          `INSERT INTO curated_contents 
           (title, link, source, content, status, published_at, fetched_at, content_source_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            title, 
            link, 
            'IPIndia', 
            '', 
            'pending', 
            formattedPublishedAt, 
            formattedNow, 
            contentSourceId, 
            formattedNow, 
            formattedNow
          ]
        );
        
        await logToFile(`✅ Inserted: ${title}`);
        insertedCount++;
        
      } catch (error) {
        await logToFile(`❌ Error processing news item: ${error.message}`);
      }
    }
    
    // Close the database connection
    await connection.end();
    await logToFile(`🎉 Done! Inserted: ${insertedCount}, Skipped: ${skippedCount}`);
    
    return { success: true, inserted: insertedCount, skipped: skippedCount };
    
  } catch (error) {
    await logToFile(`❌ Failed to scrape IPIndia news: ${error.message}`);
    if (browser) await browser.close();
    throw error;
  }
}

// Export the scraper function
module.exports = { scrapeIPIndiaNews };