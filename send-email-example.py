#!/usr/bin/env python3
"""
Example: How to send NPS survey emails programmatically using Python

This script shows how to send NPS survey emails using Python's built-in smtplib
or popular email services like SendGrid, AWS SES, etc.

Install dependencies:
    pip install python-dotenv  # For loading environment variables (optional)
    
For SendGrid:
    pip install sendgrid
    
For AWS SES:
    pip install boto3
"""

import smtplib
import os
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime
from typing import Dict, List

# ============================================
# CONFIGURATION
# ============================================

CONFIG = {
    # Your Google Apps Script Web App URL
    'script_url': 'https://script.google.com/macros/s/YOUR_SCRIPT_ID_HERE/exec',
    
    # Email settings
    'smtp_server': 'smtp.gmail.com',  # or smtp.sendgrid.net, email-smtp.us-east-1.amazonaws.com, etc.
    'smtp_port': 587,
    'email_user': 'your-email@gmail.com',
    'email_password': 'your-app-password',  # Use App Password for Gmail
    
    # Sender info
    'from_name': 'Your Company',
    'from_email': 'support@yourcompany.com',
}

# ============================================
# EMAIL TEMPLATE
# ============================================

def load_email_template() -> str:
    """Load the email template from file"""
    template_path = os.path.join(os.path.dirname(__file__), 'email-template.html')
    with open(template_path, 'r', encoding='utf-8') as f:
        return f.read()


def prepare_email(template: str, customer: Dict) -> str:
    """Replace placeholders in the email template"""
    return template \
        .replace('{{SCRIPT_URL}}', CONFIG['script_url']) \
        .replace('{{CUSTOMER_ID}}', customer['id']) \
        .replace('{{CUSTOMER_EMAIL}}', customer['email'])


# ============================================
# EMAIL SENDING (SMTP)
# ============================================

def send_nps_survey_smtp(customer: Dict) -> Dict:
    """
    Send NPS survey email using SMTP (works with Gmail, SendGrid SMTP, etc.)
    """
    try:
        # Load and prepare template
        template = load_email_template()
        email_html = prepare_email(template, customer)
        
        # Create message
        message = MIMEMultipart('alternative')
        message['Subject'] = 'How was your installation experience?'
        message['From'] = f"{CONFIG['from_name']} <{CONFIG['from_email']}>"
        message['To'] = customer['email']
        
        # Plain text version (fallback)
        text_content = f"""
Hi {customer.get('name', 'there')},

We'd love to hear your feedback about your recent installation.

Please rate us on a scale of 0-10:
{CONFIG['script_url']}?customer={customer['id']}&email={customer['email']}

Thank you!
        """
        
        # Attach both plain text and HTML versions
        part1 = MIMEText(text_content, 'plain')
        part2 = MIMEText(email_html, 'html')
        message.attach(part1)
        message.attach(part2)
        
        # Send email
        with smtplib.SMTP(CONFIG['smtp_server'], CONFIG['smtp_port']) as server:
            server.starttls()
            server.login(CONFIG['email_user'], CONFIG['email_password'])
            server.send_message(message)
        
        print(f"✅ Email sent to {customer['email']} (ID: {customer['id']})")
        return {'success': True, 'customer': customer['email']}
        
    except Exception as e:
        print(f"❌ Failed to send email to {customer['email']}: {str(e)}")
        return {'success': False, 'customer': customer['email'], 'error': str(e)}


# ============================================
# EMAIL SENDING (SendGrid API)
# ============================================

def send_nps_survey_sendgrid(customer: Dict, api_key: str) -> Dict:
    """
    Send NPS survey email using SendGrid API
    Requires: pip install sendgrid
    """
    try:
        from sendgrid import SendGridAPIClient
        from sendgrid.helpers.mail import Mail
        
        # Load and prepare template
        template = load_email_template()
        email_html = prepare_email(template, customer)
        
        # Create message
        message = Mail(
            from_email=CONFIG['from_email'],
            to_emails=customer['email'],
            subject='How was your installation experience?',
            html_content=email_html
        )
        
        # Send
        sg = SendGridAPIClient(api_key)
        response = sg.send(message)
        
        print(f"✅ Email sent to {customer['email']} (ID: {customer['id']})")
        return {'success': True, 'customer': customer['email']}
        
    except Exception as e:
        print(f"❌ Failed to send email to {customer['email']}: {str(e)}")
        return {'success': False, 'customer': customer['email'], 'error': str(e)}


# ============================================
# EMAIL SENDING (AWS SES)
# ============================================

def send_nps_survey_ses(customer: Dict, aws_region: str = 'us-east-1') -> Dict:
    """
    Send NPS survey email using AWS SES
    Requires: pip install boto3
    """
    try:
        import boto3
        
        # Load and prepare template
        template = load_email_template()
        email_html = prepare_email(template, customer)
        
        # Create SES client
        ses = boto3.client('ses', region_name=aws_region)
        
        # Send email
        response = ses.send_email(
            Source=f"{CONFIG['from_name']} <{CONFIG['from_email']}>",
            Destination={'ToAddresses': [customer['email']]},
            Message={
                'Subject': {'Data': 'How was your installation experience?'},
                'Body': {
                    'Html': {'Data': email_html},
                    'Text': {'Data': f"Rate us: {CONFIG['script_url']}?customer={customer['id']}&email={customer['email']}"}
                }
            }
        )
        
        print(f"✅ Email sent to {customer['email']} (ID: {customer['id']})")
        return {'success': True, 'customer': customer['email']}
        
    except Exception as e:
        print(f"❌ Failed to send email to {customer['email']}: {str(e)}")
        return {'success': False, 'customer': customer['email'], 'error': str(e)}


# ============================================
# BULK SENDING
# ============================================

def send_bulk_surveys(customers: List[Dict], method: str = 'smtp') -> Dict:
    """
    Send surveys to multiple customers
    
    Args:
        customers: List of customer dictionaries
        method: 'smtp', 'sendgrid', or 'ses'
    """
    print(f"\n📧 Sending NPS surveys to {len(customers)} customers...\n")
    
    results = {
        'sent': 0,
        'failed': 0,
        'errors': []
    }
    
    for customer in customers:
        # Choose sending method
        if method == 'smtp':
            result = send_nps_survey_smtp(customer)
        elif method == 'sendgrid':
            api_key = os.getenv('SENDGRID_API_KEY', '')
            result = send_nps_survey_sendgrid(customer, api_key)
        elif method == 'ses':
            result = send_nps_survey_ses(customer)
        else:
            print(f"❌ Unknown method: {method}")
            continue
        
        # Track results
        if result['success']:
            results['sent'] += 1
        else:
            results['failed'] += 1
            results['errors'].append({
                'customer': result['customer'],
                'error': result.get('error', 'Unknown error')
            })
        
        # Add delay to avoid rate limits (adjust as needed)
        import time
        time.sleep(1)
    
    # Print summary
    print('\n' + '='*50)
    print('📊 SUMMARY')
    print('='*50)
    print(f"✅ Successfully sent: {results['sent']}")
    print(f"❌ Failed: {results['failed']}")
    
    if results['errors']:
        print('\n❌ Errors:')
        for error in results['errors']:
            print(f"   - {error['customer']}: {error['error']}")
    
    return results


# ============================================
# EXAMPLES
# ============================================

def example_single():
    """Example: Send survey to a single customer"""
    customer = {
        'id': 'CUST-12345',
        'name': 'John Doe',
        'email': 'john@example.com',
        'install_date': '2024-11-07'
    }
    
    send_nps_survey_smtp(customer)


def example_bulk():
    """Example: Send surveys to multiple customers"""
    customers = [
        {
            'id': 'CUST-12345',
            'name': 'John Doe',
            'email': 'john@example.com',
            'install_date': '2024-11-07'
        },
        {
            'id': 'CUST-12346',
            'name': 'Jane Smith',
            'email': 'jane@example.com',
            'install_date': '2024-11-08'
        },
        {
            'id': 'CUST-12347',
            'name': 'Bob Johnson',
            'email': 'bob@example.com',
            'install_date': '2024-11-09'
        }
    ]
    
    send_bulk_surveys(customers, method='smtp')


def example_from_csv():
    """Example: Load customers from CSV and send surveys"""
    import csv
    
    customers = []
    with open('customers-example.csv', 'r') as f:
        reader = csv.DictReader(f)
        for row in reader:
            customers.append({
                'id': row['customer_id'],
                'name': row['name'],
                'email': row['email'],
                'install_date': row['install_date']
            })
    
    send_bulk_surveys(customers, method='smtp')


def example_from_database():
    """Example: Integration with a database"""
    # This is a pseudo-example - adapt to your database
    
    # import psycopg2  # PostgreSQL
    # import mysql.connector  # MySQL
    # import pymongo  # MongoDB
    
    # # Connect to database
    # conn = psycopg2.connect(
    #     host="localhost",
    #     database="mydb",
    #     user="myuser",
    #     password="mypassword"
    # )
    # 
    # # Query customers who completed installation 7 days ago
    # cursor = conn.cursor()
    # cursor.execute("""
    #     SELECT customer_id, name, email, install_date
    #     FROM customers
    #     WHERE install_date = CURRENT_DATE - INTERVAL '7 days'
    #     AND nps_survey_sent = false
    # """)
    # 
    # # Format customers
    # customers = []
    # for row in cursor.fetchall():
    #     customers.append({
    #         'id': row[0],
    #         'name': row[1],
    #         'email': row[2],
    #         'install_date': row[3]
    #     })
    # 
    # # Send surveys
    # results = send_bulk_surveys(customers, method='smtp')
    # 
    # # Mark as sent in database
    # if results['sent'] > 0:
    #     cursor.execute("""
    #         UPDATE customers
    #         SET nps_survey_sent = true
    #         WHERE install_date = CURRENT_DATE - INTERVAL '7 days'
    #     """)
    #     conn.commit()
    # 
    # cursor.close()
    # conn.close()
    
    pass


# ============================================
# SCHEDULED SENDING (using APScheduler)
# ============================================

def setup_scheduled_sending():
    """
    Example: Automatically send surveys every day at 10 AM
    Requires: pip install apscheduler
    """
    # from apscheduler.schedulers.blocking import BlockingScheduler
    # 
    # def daily_survey_job():
    #     """Job to run daily"""
    #     print(f"\n🕐 Running daily NPS survey job at {datetime.now()}")
    #     
    #     # Load customers who installed 7 days ago
    #     # customers = get_customers_from_database()
    #     
    #     # Send surveys
    #     # send_bulk_surveys(customers)
    #     
    #     print("✅ Daily job completed")
    # 
    # # Create scheduler
    # scheduler = BlockingScheduler()
    # 
    # # Schedule job to run every day at 10:00 AM
    # scheduler.add_job(daily_survey_job, 'cron', hour=10, minute=0)
    # 
    # print("⏰ Scheduler started. Press Ctrl+C to exit.")
    # scheduler.start()
    
    pass


# ============================================
# MAIN
# ============================================

def main():
    """Main function"""
    
    # Check configuration
    if 'YOUR_SCRIPT_ID_HERE' in CONFIG['script_url']:
        print("❌ Error: Please update CONFIG['script_url'] with your Google Apps Script URL")
        return
    
    if 'your-email' in CONFIG['email_user']:
        print("❌ Error: Please update CONFIG email settings with your credentials")
        return
    
    # Run example
    print("🚀 Starting NPS survey sending...\n")
    
    # Uncomment the example you want to run:
    # example_single()
    example_bulk()
    # example_from_csv()
    
    print("\n✅ Done!")


if __name__ == '__main__':
    main()


