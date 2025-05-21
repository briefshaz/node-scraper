// Serverless function for Vercel
const { scrapeIPIndiaNews } = require('../scraper');

// If API_KEY is set in environment variables, we'll use it for basic auth
const API_KEY = process.env.API_KEY;

module.exports = async (req, res) => {
  // Basic auth check if API_KEY is set
  if (API_KEY) {
    const authHeader = req.headers.authorization;
    if (!authHeader || authHeader !== `Bearer ${API_KEY}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }
  
  try {
    // Run the scraper
    const result = await scrapeIPIndiaNews();
    
    // Return success response
    res.status(200).json({ 
      success: true,
      message: 'Scraping completed successfully',
      ...result
    });
  } catch (error) {
    console.error('Scraper error:', error);
    
    // Return error response
    res.status(500).json({ 
      success: false, 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};