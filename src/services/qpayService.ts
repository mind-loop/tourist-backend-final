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

export interface InvoiceResult {
  invoiceId: string
  qrText:    string
  qrImage:   string
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

  const d = await qpayFetch(`${BASE()}/v2/invoice`, {
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

  return {
    invoiceId: d.id      || '',
    qrText:    d.qr_code || '',
    qrImage:   d.qr_image || '',
  }
}

export async function checkPayment(invoiceId: string): Promise<{ paid: boolean }> {
  const d = await qpayFetch(`${BASE()}/v2/payment/check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ invoice_id: invoiceId }),
  })
  return { paid: d.invoice_status === 'PAID' }
}
