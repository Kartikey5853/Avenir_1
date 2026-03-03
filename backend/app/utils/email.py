import smtplib
from email.mime.text import MIMEText
import logging
import os


def send_otp_email(to_email: str, otp_code: str, purpose: str = "email_verification"):
    """
    Send an OTP email to the given address.
    purpose: 'email_verification' | 'login_2fa' | 'password_reset'
    """
    smtp_server = os.getenv("SMTP_SERVER")
    smtp_port = int(os.getenv("SMTP_PORT", 587))
    smtp_user = os.getenv("SMTP_USER")
    smtp_password = os.getenv("SMTP_PASSWORD")

    if purpose == "password_reset":
        subject = "Avenir – Password Reset Code"
        body = (
            f"Hi,\n\n"
            f"Your password reset code is: {otp_code}\n\n"
            f"This code expires in 10 minutes.\n\n"
            f"If you did not request a password reset, you can safely ignore this email."
        )
    elif purpose == "login_2fa":
        subject = "Avenir – Login Verification Code"
        body = (
            f"Hi,\n\n"
            f"Your two-factor authentication code is: {otp_code}\n\n"
            f"This code expires in 5 minutes.\n\n"
            f"If you did not attempt to log in, please secure your account immediately."
        )
    else:  # email_verification
        subject = "Avenir – Verify Your Email"
        body = (
            f"Hi,\n\n"
            f"Your email verification code is: {otp_code}\n\n"
            f"This code expires in 10 minutes.\n\n"
            f"If you did not create an Avenir account, please ignore this email."
        )

    message = MIMEText(body)
    message["Subject"] = subject
    message["From"] = smtp_user
    message["To"] = to_email

    try:
        with smtplib.SMTP(smtp_server, smtp_port) as server:
            server.starttls()
            server.login(smtp_user, smtp_password)
            server.sendmail(smtp_user, to_email, message.as_string())

        logging.info(f"OTP email ({purpose}) sent to {to_email}")

    except Exception as e:
        logging.error(f"Failed to send OTP email ({purpose}) to {to_email}: {str(e)}")
        raise