/**
 * Example: How to send NPS survey emails programmatically
 * 
 * This is a Node.js example using Nodemailer (popular email library)
 * You can adapt this to any language/platform you use.
 * 
 * Install dependencies first:
 * npm install nodemailer
 */

const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

// ============================================
// CONFIGURATION - Update these values
// ============================================

const CONFIG = {
  // Your Google Apps Script Web App URL
  scriptUrl: 'https://script.google.com/macros/s/YOUR_SCRIPT_ID_HERE/exec',
  
  // Email settings (example using Gmail)
  // For production, use a proper email service like SendGrid, AWS SES, etc.
  email: {
    service: 'gmail',
    auth: {
      user: 'your-email@gmail.com',
      pass: 'your-app-password' // Use App Password, not your regular password
    }
  },
  
  // Sender info
  from: {
    name: 'Your Company',
    email: 'support@yourcompany.com'
  }
};

// ============================================
// EMAIL TEMPLATE
// ============================================

/**
 * Load and prepare the email template
 */
function loadEmailTemplate() {
  const templatePath = path.join(__dirname, 'email-template.html');
  return fs.readFileSync(templatePath, 'utf8');
}

/**
 * Replace placeholders in the email template
 */
function prepareEmail(template, customer) {
  return template
    .replace(/\{\{SCRIPT_URL\}\}/g, CONFIG.scriptUrl)
    .replace(/\{\{CUSTOMER_ID\}\}/g, customer.id)
    .replace(/\{\{CUSTOMER_EMAIL\}\}/g, customer.email);
}

// ============================================
// EMAIL SENDING
// ============================================

/**
 * Send NPS survey email to a customer
 */
async function sendNPSSurvey(customer) {
  try {
    // Create email transporter
    const transporter = nodemailer.createTransport(CONFIG.email);
    
    // Load and prepare email template
    const template = loadEmailTemplate();
    const emailHTML = prepareEmail(template, customer);
    
    // Email options
    const mailOptions = {
      from: `${CONFIG.from.name} <${CONFIG.from.email}>`,
      to: customer.email,
      subject: 'How was your installation experience?',
      html: emailHTML,
      // Optional: Add plain text version
      text: `Hi ${customer.name},\n\nWe'd love to hear your feedback about your recent installation.\n\nPlease rate us on a scale of 0-10: ${CONFIG.scriptUrl}?customer=${customer.id}&email=${customer.email}\n\nThank you!`
    };
    
    // Send email
    const info = await transporter.sendMail(mailOptions);
    
    console.log(`✅ Email sent to ${customer.email} (ID: ${customer.id})`);
    console.log(`   Message ID: ${info.messageId}`);
    
    return { success: true, messageId: info.messageId };
    
  } catch (error) {
    console.error(`❌ Failed to send email to ${customer.email}:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Send surveys to multiple customers
 */
async function sendBulkSurveys(customers) {
  console.log(`\n📧 Sending NPS surveys to ${customers.length} customers...\n`);
  
  const results = {
    sent: 0,
    failed: 0,
    errors: []
  };
  
  for (const customer of customers) {
    const result = await sendNPSSurvey(customer);
    
    if (result.success) {
      results.sent++;
    } else {
      results.failed++;
      results.errors.push({ customer: customer.email, error: result.error });
    }
    
    // Add delay to avoid rate limits (adjust as needed)
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 SUMMARY');
  console.log('='.repeat(50));
  console.log(`✅ Successfully sent: ${results.sent}`);
  console.log(`❌ Failed: ${results.failed}`);
  
  if (results.errors.length > 0) {
    console.log('\n❌ Errors:');
    results.errors.forEach(err => {
      console.log(`   - ${err.customer}: ${err.error}`);
    });
  }
  
  return results;
}

// ============================================
// EXAMPLE USAGE
// ============================================

/**
 * Example: Send survey to a single customer
 */
async function exampleSingle() {
  const customer = {
    id: 'CUST-12345',
    name: 'John Doe',
    email: 'john@example.com',
    installDate: '2024-11-10'
  };
  
  await sendNPSSurvey(customer);
}

/**
 * Example: Send surveys to multiple customers
 */
async function exampleBulk() {
  const customers = [
    {
      id: 'CUST-12345',
      name: 'John Doe',
      email: 'john@example.com',
      installDate: '2024-11-10'
    },
    {
      id: 'CUST-12346',
      name: 'Jane Smith',
      email: 'jane@example.com',
      installDate: '2024-11-12'
    },
    {
      id: 'CUST-12347',
      name: 'Bob Johnson',
      email: 'bob@example.com',
      installDate: '2024-11-13'
    }
  ];
  
  await sendBulkSurveys(customers);
}

/**
 * Example: Load customers from a CSV file
 */
async function exampleFromCSV() {
  // You would need to install 'csv-parser' package
  // npm install csv-parser
  
  // const csv = require('csv-parser');
  // const customers = [];
  
  // fs.createReadStream('customers.csv')
  //   .pipe(csv())
  //   .on('data', (row) => {
  //     customers.push({
  //       id: row.customer_id,
  //       name: row.name,
  //       email: row.email,
  //       installDate: row.install_date
  //     });
  //   })
  //   .on('end', async () => {
  //     await sendBulkSurveys(customers);
  //   });
}

/**
 * Example: Integration with your database
 */
async function exampleFromDatabase() {
  // Example with any database (MongoDB, PostgreSQL, etc.)
  
  // const customers = await db.query(`
  //   SELECT customer_id, name, email, install_date
  //   FROM customers
  //   WHERE install_date = CURRENT_DATE - INTERVAL '7 days'
  //   AND nps_survey_sent = false
  // `);
  
  // const formattedCustomers = customers.map(c => ({
  //   id: c.customer_id,
  //   name: c.name,
  //   email: c.email,
  //   installDate: c.install_date
  // }));
  
  // const results = await sendBulkSurveys(formattedCustomers);
  
  // // Mark as sent in database
  // if (results.sent > 0) {
  //   await db.query(`
  //     UPDATE customers
  //     SET nps_survey_sent = true
  //     WHERE install_date = CURRENT_DATE - INTERVAL '7 days'
  //   `);
  // }
}

// ============================================
// RUN THE SCRIPT
// ============================================

// Uncomment the example you want to run:

// exampleSingle();
// exampleBulk();

// Or run from command line:
if (require.main === module) {
  // Check if config is set up
  if (CONFIG.scriptUrl.includes('YOUR_SCRIPT_ID_HERE')) {
    console.error('❌ Error: Please update CONFIG.scriptUrl in this file with your Google Apps Script URL');
    process.exit(1);
  }
  
  if (CONFIG.email.auth.user.includes('your-email')) {
    console.error('❌ Error: Please update CONFIG.email settings with your email credentials');
    process.exit(1);
  }
  
  // Run example
  exampleBulk().then(() => {
    console.log('\n✅ Done!');
    process.exit(0);
  }).catch(err => {
    console.error('\n❌ Error:', err);
    process.exit(1);
  });
}

// Export functions for use in other scripts
module.exports = {
  sendNPSSurvey,
  sendBulkSurveys,
  prepareEmail
};


