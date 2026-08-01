import nodemailer from 'nodemailer'

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USERNAME,
    pass: process.env.GMAIL_PASSWORD,
  },
})

export async function sendPasswordResetCode(to: string, code: string): Promise<void> {
  await transporter.sendMail({
    from: `QRUVS <${process.env.GMAIL_USERNAME}>`,
    to,
    subject: 'QRUVS — Нууц үг сэргээх код',
    html: `
      <div style="font-family: sans-serif; max-width: 420px; margin: 0 auto; padding: 24px; background: #f8fafc; border-radius: 12px;">
        <h2 style="color: #0A2E52; margin-bottom: 8px;">Нууц үг сэргээх код</h2>
        <p style="color: #475569; font-size: 14px; line-height: 1.5;">
          Таны акаунтад нууц үг сэргээх хүсэлт ирлээ. Доорх кодыг ашиглан нууц үгээ шинэчилнэ үү.
        </p>
        <div style="background: #0A2E52; color: #fff; font-size: 28px; font-weight: 700; letter-spacing: 6px; text-align: center; padding: 16px; border-radius: 8px; margin: 20px 0;">
          ${code}
        </div>
        <p style="color: #94a3b8; font-size: 12px;">
          Энэ код 10 минутын дараа хүчингүй болно. Хэрэв та энэ хүсэлтийг илгээгээгүй бол энэ имэйлийг үл тоомсорлоно уу.
        </p>
      </div>
    `,
  })
}
