// Main entry point for the application
const { scrapeIPIndiaNews } = require('./scraper');

// This file serves as the entry point for local testing
// It will run the scraper when executed directly with Node.js

// Check if this file is being run directly
if (require.main === module) {
  console.log('Running scraper locally...');
  
  // Set test mode for local testing
  process.env.TEST_MODE = 'true';
  
  // Run the scraper
  scrapeIPIndiaNews()
    .then(result => {
      console.log('Scraper completed successfully');
      console.log(result);
    })
    .catch(error => {
      console.error('Scraper failed:', error);
      process.exit(1);
    });
}

// Export for use in API routes
module.exports = { scrapeIPIndiaNews };