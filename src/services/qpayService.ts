import dotenv from 'dotenv'
dotenv.config()

const BASE = () => (process.env.QPAY_BASEURL || 'https://quickqr.qpay.mn').replace(/\/$/, '')

let _token  = ''
let _expiry = 0

function clearToken() {
  _token  = ''
  _expiry = 0
}

async function fetchFreshToken(): Promise<string> {
  const user       = process.env.QPAY_USERNAME    || ''
  const pass       = process.env.QPAY_PASSWORD    || ''
  const terminalId = process.env.QPAY_TERMINAL_ID || ''

  const creds = Buffer.from(`${user}:${pass}`).toString('base64')
  const res = await fetch(`${BASE()}/v2/auth/token`, {
    method: 'POST',
    headers: {
      Authorization:  `Basic ${creds}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ terminal_id: terminalId }),
  })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`QPay auth failed ${res.status}: ${txt}`)
  }
  const d: any = await res.json()
  _token  = d.access_token
  _expiry = Date.now() + Math.max(0, (Number(d.expires_in) - 120)) * 1000
  return _token
}

async function getToken(): Promise<string> {
  if (_token && Date.now() < _expiry) return _token
  return fetchFreshToken()
}

async function qpayFetch(url: string, options: RequestInit, retry = true): Promise<any> {
  const token = await getToken()
  const res = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers as Record<string, string>),
      Authorization: `Bearer ${token}`,
    },
  })
  if (res.status === 401 && retry) {
    // Token was rejected — clear cache and try once more with a fresh token
    clearToken()
    return qpayFetch(url, options, false)
  }
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`QPay ${res.status}: ${txt}`)
  }
  return res.json()
}

export interface InvoiceResult {
  invoiceId: string
  qrText:    string
  qrImage:   string
  expiresAt: Date | null
}

// POST /v2/invoice-ийн response
interface QPayInvoiceCreateResponse {
  invoice_id?:  string
  id?:          string
  qr_code?:     string
  qr_image?:    string
  expiry_date?: string
}

export async function createInvoice(params: {
  invoiceNo:    string
  description:  string
  amount:       number
  customerName?: string
}): Promise<InvoiceResult> {
  const merchantId = process.env.SYSTEM_QPAY_MERCHANT_ID || ''
  const branchCode = process.env.QPAY_BRANCH_CODE || 'BRANCH_002'
  const callback   = process.env.QPAY_CALL_BACK_URL || ''
  const bankCode   = process.env.SYSTEM_BANK_CODE || ''
  const bankAcct   = process.env.SYSTEM_ACCOUNT_NUMBER || ''
  const bankName   = (process.env.SYSTEM_ACCOUNT_NAME || '').replace(/^"|"$/g, '')

  if (!callback) {
    console.warn('[QPay] QPAY_CALL_BACK_URL тохируулаагүй байна — төлбөр төлөгдсөний дараа webhook ирэхгүй, зөвхөн frontend-ийн polling-оор л баталгаажина')
  }

  const d: QPayInvoiceCreateResponse = await qpayFetch(`${BASE()}/v2/invoice`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      merchant_id:   merchantId,
      branch_code:   branchCode,
      amount:        params.amount,
      currency:      'MNT',
      customer_name: params.customerName || 'Customer',
      customer_logo: '',
      callback_url:  callback,
      description:   params.description,
      bank_accounts: [
        {
          account_bank_code: bankCode,
          account_number:    bankAcct,
          account_name:      bankName,
          is_default:        true,
        },
      ],
    }),
  })

  const invoiceId = d.invoice_id || d.id || ''
  if (!invoiceId) {
    throw new Error('QPay invoice_id хоосон байна — response format шалгана уу')
  }

  return {
    invoiceId,
    qrText:  d.qr_code  || '',
    qrImage: d.qr_image || '',
    expiresAt: d.expiry_date ? new Date(d.expiry_date) : null,
  }
}

// POST /v2/payment/check-ийн response (QPay-ийн албан ёсны баримт бичигт бичигдсэн бодит форматтай таарсан)
interface QPayPaymentCheckResponse {
  id?:                  string
  invoice_status?:      string   // 'PAID' | 'NEW' | 'EXPIRED' гэх мэт
  invoice_status_date?: string
  payments?: Array<{
    id:             string
    amount:         string
    payment_status: string       // 'SUCCESS' | 'FAILED' гэх мэт
  }>
}

export interface PaymentCheckResult {
  paid:        boolean
  paidAmount?: number
}

// Төлбөрийн жинхэнэ баталгаа болгож зөвхөн invoice_status === 'PAID' эсэхийг шалгана —
// payments[].payment_status зэрэг бусад талбарыг найдваргүй гэж үзнэ (QPay-ийн албан баримт бичигт
// invoice_status-г эцсийн шийдвэр гэж заасан байдаг)
export async function checkPayment(invoiceId: string): Promise<PaymentCheckResult> {
  const d: QPayPaymentCheckResponse = await qpayFetch(`${BASE()}/v2/payment/check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ invoice_id: invoiceId }),
  })

  const paid = d.invoice_status === 'PAID'
  const paidAmount = paid
    ? d.payments?.reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
    : undefined

  return { paid, paidAmount }
}

// QPay invoice-ийн хугацаа дууссан эсэхийг шалгана (enable_expiry/expiry_date-д үндэслэсэн)
export function isInvoiceExpired(expiresAt: Date | string | null | undefined): boolean {
  if (!expiresAt) return false
  return new Date(expiresAt).getTime() < Date.now()
}
