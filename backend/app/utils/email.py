import logging
import httpx

from app.config import settings

RESEND_API_URL = "https://api.resend.com/emails"


def _build_html(otp_code: str, title: str, subtitle: str, expiry: str) -> str:
    """Return a styled HTML email with OTP prominently at the top."""
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{title}</title>
</head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="520" cellpadding="0" cellspacing="0"
               style="background:#121212;border-radius:16px;border:1px solid #2a2a2a;overflow:hidden;max-width:520px;width:100%;">

          <!-- OTP BLOCK -->
          <tr>
            <td style="padding:48px 40px 36px;text-align:center;background:#121212;">
              <p style="margin:0 0 8px;font-size:13px;color:#888;letter-spacing:0.08em;text-transform:uppercase;">{subtitle}</p>
              <h1 style="margin:0 0 32px;font-size:20px;font-weight:700;color:#f5f5f5;">{title}</h1>

              <!-- Big OTP code -->
              <div style="display:inline-block;background:#1a1a1a;border:1.5px solid #f97316;border-radius:12px;padding:24px 40px;margin-bottom:24px;">
                <span style="font-size:44px;font-weight:800;letter-spacing:12px;color:#f97316;font-family:'Courier New',monospace;">{otp_code}</span>
              </div>

              <p style="margin:0 0 6px;font-size:14px;color:#bbb;">This code expires in <strong style="color:#f5f5f5;">{expiry}</strong>.</p>
              <p style="margin:0;font-size:13px;color:#666;">Enter this code in the Avenir app to continue.</p>
            </td>
          </tr>

          <!-- DIVIDER -->
          <tr>
            <td style="padding:0 40px;">
              <hr style="border:none;border-top:1px solid #222;margin:0;" />
            </td>
          </tr>

          <!-- AVENIR BRANDING -->
          <tr>
            <td style="padding:32px 40px 40px;text-align:center;">
              <p style="margin:0 0 6px;font-size:22px;font-weight:800;color:#f97316;letter-spacing:-0.5px;">Avenir</p>
              <p style="margin:0 0 16px;font-size:13px;color:#666;">Neighbourhood Intelligence for Hyderabad</p>
              <p style="margin:0;font-size:12px;color:#555;line-height:1.6;">
                Avenir analyses safety, transport, education, lifestyle and grocery<br />
                infrastructure to give you an objective livability score for any area.
              </p>
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="padding:16px 40px 28px;text-align:center;background:#0d0d0d;border-top:1px solid #1e1e1e;">
              <p style="margin:0;font-size:11px;color:#444;">
                If you didn't request this, you can safely ignore this email.<br />
                &copy; 2026 Avenir &middot; All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""


def send_otp_email(to_email: str, otp_code: str, purpose: str = "email_verification"):
    """
    Send a styled HTML OTP email via Resend API.
    purpose: 'email_verification' | 'login_2fa' | 'password_reset'
    """
    if purpose == "password_reset":
        subject  = "Avenir – Password Reset Code"
        title    = "Password Reset"
        subtitle = "Your reset code"
        expiry   = "10 minutes"
        plain    = f"Your Avenir password reset code is: {otp_code}\n\nExpires in 10 minutes."
    elif purpose == "login_2fa":
        subject  = "Avenir – Login Verification Code"
        title    = "Two-Factor Authentication"
        subtitle = "Your login code"
        expiry   = "5 minutes"
        plain    = f"Your Avenir 2FA login code is: {otp_code}\n\nExpires in 5 minutes."
    else:  # email_verification
        subject  = "Avenir – Verify Your Email"
        title    = "Email Verification"
        subtitle = "Your verification code"
        expiry   = "10 minutes"
        plain    = f"Your Avenir email verification code is: {otp_code}\n\nExpires in 10 minutes."

    # Always print OTP to console for debugging
    print(f"[DEV] OTP for {to_email} ({purpose}): {otp_code}")

    if not settings.RESEND_API_KEY:
        logging.warning("RESEND_API_KEY not configured. Email not sent.")
        return

    payload = {
        "from":    settings.RESEND_FROM,
        "to":      [to_email],
        "subject": subject,
        "text":    plain,
        "html":    _build_html(otp_code, title, subtitle, expiry),
    }

    try:
        response = httpx.post(
            RESEND_API_URL,
            json=payload,
            headers={
                "Authorization": f"Bearer {settings.RESEND_API_KEY}",
                "Content-Type":  "application/json",
            },
            timeout=10.0,
        )
        if response.status_code in (200, 201):
            logging.info(f"OTP email ({purpose}) sent to {to_email} via Resend")
        else:
            logging.error(
                f"Resend error {response.status_code} sending to {to_email}: {response.text[:300]}"
            )
            raise RuntimeError(f"Resend returned {response.status_code}: {response.text[:200]}")

    except Exception as e:
        logging.error(f"Failed to send OTP email ({purpose}) to {to_email}: {str(e)}")
        raise