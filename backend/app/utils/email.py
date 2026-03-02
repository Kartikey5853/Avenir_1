import smtplib
from email.mime.text import MIMEText
import logging
import os



def send_otp_email(to_email: str, otp_code: str):


    smtp_server = os.getenv("SMTP_SERVER")
    smtp_port = int(os.getenv("SMTP_PORT", 587))
    smtp_user = os.getenv("SMTP_USER")
    smtp_password = os.getenv("SMTP_PASSWORD")

    subject = "Your Verification OTP"
    body = f"Your OTP is: {otp_code}\n\nThis OTP expires in 5 minutes."

    message = MIMEText(body)
    message["Subject"] = subject
    message["From"] = smtp_user
    message["To"] = to_email

    try:
        with smtplib.SMTP(smtp_server, smtp_port) as server:
            server.starttls()
            server.login(smtp_user, smtp_password)
            server.sendmail(smtp_user, to_email, message.as_string())
            

        logging.info(f"OTP email sent to {to_email}")

    except Exception as e:
        logging.error(f"Failed to send OTP email: {str(e)}")
        raise