import { Request, Response } from 'express'
import pool from '../config/database'

async function getCommissionRate(): Promise<number> {
  const [rows]: any = await pool.execute(
    `SELECT fee FROM content_pricing WHERE content_type = 'tour_commission' LIMIT 1`
  )
  return Number(rows[0]?.fee) || 0
}

// Тухайн admin-ий өөрийн аялалуудаас цугласан орлого — комисс хассны дараах цэвэр орлого
async function getTourIncome(createdBy: number | null) {
  const where = createdBy != null ? 'WHERE t.created_by = ?' : ''
  const params = createdBy != null ? [createdBy] : []

  const [rows]: any = await pool.query(
    `SELECT t.id, t.title_mn, t.settlement_status,
            COALESCE(SUM(tr.amount), 0) AS collected,
            COALESCE(SUM(tr.participant_count), 0) AS participants
     FROM tours t
     LEFT JOIN tour_registrations tr ON tr.tour_id = t.id AND tr.qpay_status = 'paid'
     ${where}
     GROUP BY t.id
     HAVING collected > 0
     ORDER BY collected DESC`,
    params
  )

  const rate = await getCommissionRate()

  let totalCollected = 0, totalCommission = 0, settledCommission = 0, unsettledCommission = 0
  let settledNet = 0, unsettledNet = 0

  const byTour = rows.map((r: any) => {
    const collected  = Number(r.collected)
    const commission = Math.round(collected * rate / 100)
    const net         = collected - commission
    totalCollected += collected
    totalCommission += commission
    if (r.settlement_status === 'settled') {
      settledCommission += commission
      settledNet += net
    } else {
      unsettledCommission += commission
      unsettledNet += net
    }
    return {
      id: r.id, title_mn: r.title_mn, settlement_status: r.settlement_status,
      collected, commission, net, participants: Number(r.participants),
    }
  })

  return {
    rate,
    totalCollected,
    totalCommission,
    totalNet: totalCollected - totalCommission,
    settledNet, unsettledNet,
    settledCommission, unsettledCommission,
    byTour,
  }
}

const LISTING_TYPES = ['tourist_place', 'historical_place', 'tour', 'banner', 'article', 'service']

// GET /dashboard/revenue  (admin — own; superadmin — platform-wide нэмэлттэй)
export async function getRevenueDashboard(req: Request, res: Response) {
  try {
    const isSA = req.user!.role === 'superadmin'
    const uid  = req.user!.id

    // Миний аялалын орлого (аль ч эрхтэй хэрэглэгч өөрийн аялалын орлогыг харна)
    const tourIncome = await getTourIncome(isSA ? null : uid)

    // Миний зарцуулсан байршуулах хураамж (admin өөрийн зардлаа хардаг)
    const [myExpenseRows]: any = await pool.query(
      `SELECT content_type, SUM(amount) AS total, COUNT(*) AS count
       FROM content_payments
       WHERE status = 'paid' AND user_id = ?
       GROUP BY content_type`,
      [uid]
    )
    const myExpenses = {
      total: myExpenseRows.reduce((s: number, r: any) => s + Number(r.total), 0),
      byType: myExpenseRows.map((r: any) => ({ content_type: r.content_type, total: Number(r.total), count: Number(r.count) })),
    }

    const data: any = { tourIncome, myExpenses }

    if (isSA) {
      const [allPaymentRows]: any = await pool.query(
        `SELECT content_type, SUM(amount) AS total, COUNT(*) AS count
         FROM content_payments
         WHERE status = 'paid'
         GROUP BY content_type`
      )
      const listingFeesByType = allPaymentRows
        .filter((r: any) => LISTING_TYPES.includes(r.content_type))
        .map((r: any) => ({ content_type: r.content_type, total: Number(r.total), count: Number(r.count) }))
      const listingFeesTotal = listingFeesByType.reduce((s: number, r: any) => s + r.total, 0)

      const upgradeRow = allPaymentRows.find((r: any) => r.content_type === 'admin_upgrade')
      const adminUpgrades = { total: Number(upgradeRow?.total) || 0, count: Number(upgradeRow?.count) || 0 }

      const allTourIncome = await getTourIncome(null)
      const commissionEarned = {
        total: allTourIncome.totalCommission,
        settled: allTourIncome.settledCommission,
        unsettled: allTourIncome.unsettledCommission,
      }

      data.platform = {
        listingFees: { total: listingFeesTotal, byType: listingFeesByType },
        adminUpgrades,
        commissionEarned,
        grandTotal: listingFeesTotal + adminUpgrades.total + commissionEarned.total,
      }
    }

    res.json({ success: true, data })
  } catch (err: any) {
    console.error('getRevenueDashboard error:', err)
    res.status(500).json({ success: false, message: 'Серверийн алдаа' })
  }
}
