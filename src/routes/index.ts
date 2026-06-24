import { Router } from 'express'
import { authenticate, requireAdmin, requireSuperAdmin } from '../middlewares/auth/authMiddleware'
import { uploadSingle, uploadMultiple, uploadCover, uploadTourFields } from '../middlewares/upload/uploadMiddleware'

import * as auth     from '../controllers/authController'
import * as places   from '../controllers/placesController'
import * as tags     from '../controllers/tagsController'
import * as banners  from '../controllers/bannersController'
import * as reviews  from '../controllers/reviewsController'
import * as articles from '../controllers/articlesController'
import * as users    from '../controllers/usersController'
import * as routes   from '../controllers/routesController'
import * as tours    from '../controllers/toursController'
import * as pricing  from '../controllers/pricingController'
import * as payment  from '../controllers/paymentController'

const r = Router()

// ── Auth ──────────────────────────────────────────────────────────────────────
r.post('/auth/register',        auth.register)
r.post('/auth/login',           auth.login)
r.post('/auth/google/callback', auth.googleCallback)
r.get ('/auth/me',              authenticate, auth.getMe)
r.post('/auth/logout',          authenticate, auth.logout)

// ── Place images ──────────────────────────────────────────────────────────────
r.delete('/places/images/:imageId',       authenticate, requireAdmin, places.deleteImage)
r.patch ('/places/images/:imageId/cover', authenticate, requireAdmin, places.setCoverImage)

// ── Places (public) ───────────────────────────────────────────────────────────
r.get('/places',              places.getPlaces)
r.get('/places/admin/list',   authenticate, requireAdmin, places.getAdminPlaces)
r.get('/places/id/:id',       authenticate, requireAdmin, places.getPlaceById)
r.get('/places/:slug',        places.getPlaceBySlug)

// ── Places (admin) ────────────────────────────────────────────────────────────
r.post  ('/places',            authenticate, requireAdmin, uploadMultiple, places.createPlace)
r.put   ('/places/:id',        authenticate, requireAdmin, uploadMultiple, places.updatePlace)
r.delete('/places/:id',        authenticate, requireAdmin, places.deletePlace)
r.patch ('/places/:id/status', authenticate, requireAdmin, places.updateStatus)

// ── Tags ──────────────────────────────────────────────────────────────────────
r.get   ('/tags',     tags.getTags)
r.post  ('/tags',     authenticate, requireAdmin, tags.createTag)
r.delete('/tags/:id', authenticate, requireAdmin, tags.deleteTag)

// ── Banners (public) ──────────────────────────────────────────────────────────
r.get('/banners/active', banners.getActiveBanners)

// ── Banners (admin) ───────────────────────────────────────────────────────────
r.get   ('/banners',            authenticate, requireAdmin, banners.getAllBanners)
r.post  ('/banners',            authenticate, requireAdmin, uploadSingle, banners.createBanner)
r.patch ('/banners/:id/toggle', authenticate, requireAdmin, banners.toggleBanner)
r.delete('/banners/:id',        authenticate, requireAdmin, banners.deleteBanner)

// ── Reviews ───────────────────────────────────────────────────────────────────
r.get   ('/reviews/place/:placeId', reviews.getPlaceReviews)
r.post  ('/reviews',     authenticate, reviews.createReview)
r.delete('/reviews/:id', authenticate, requireAdmin, reviews.deleteReview)

// ── Articles (public) ─────────────────────────────────────────────────────────
r.get('/articles',              articles.getArticles)
r.get('/articles/admin/list',   authenticate, requireAdmin, articles.getAdminArticles)
r.get('/articles/id/:id',       authenticate, requireAdmin, articles.getArticleById)
r.get('/articles/:slug',        articles.getArticleBySlug)

// ── Articles (admin) ──────────────────────────────────────────────────────────
r.post  ('/articles',            authenticate, requireAdmin, uploadCover, articles.createArticle)
r.put   ('/articles/:id',        authenticate, requireAdmin, uploadCover, articles.updateArticle)
r.patch ('/articles/:id/status', authenticate, requireAdmin, articles.updateArticleStatus)
r.delete('/articles/:id',        authenticate, requireAdmin, articles.deleteArticle)

// ── Users (superadmin role management) ───────────────────────────────────────
r.get  ('/users',          authenticate, requireAdmin,      users.getUsers)
r.patch('/users/:id/role', authenticate, requireSuperAdmin, users.updateRole)

// ── Dashboard ─────────────────────────────────────────────────────────────────
r.get('/dashboard/stats', authenticate, requireAdmin, users.getDashboardStats)

// ── Pricing (superadmin) ──────────────────────────────────────────────────────
r.get('/pricing',                     authenticate, requireAdmin,      pricing.getPricing)
r.get('/pricing/tour-commission',     authenticate, requireAdmin,      pricing.getTourCommission)
r.put('/pricing/tour-commission',     authenticate, requireSuperAdmin, pricing.updateTourCommission)
r.get('/pricing/fee/:contentType',    authenticate, requireAdmin,      payment.getContentFee)
r.put('/pricing/:contentType',        authenticate, requireSuperAdmin, pricing.updatePricing)

// ── Payment (QPay) ────────────────────────────────────────────────────────────
r.post('/pay/callback',              payment.qpayCallback)   // webhook
r.post('/payments/qpay-webhook',     payment.qpayCallback)   // alias (old URL)
r.post('/pay/create',                authenticate, requireAdmin, payment.createContentPayment)
r.get ('/pay/check/:invoiceId',      authenticate, requireAdmin, payment.checkContentPayment)
r.get ('/pay/upgrade/fee',              authenticate, payment.getUpgradeFee)
r.post('/pay/upgrade',                  authenticate, payment.createUpgradePayment)
r.get ('/pay/upgrade/check/:invoiceId', authenticate, payment.checkUpgradePayment)

// ── Routes (public) ───────────────────────────────────────────────────────────
r.get('/routes',              routes.getRoutes)
r.get('/routes/admin/list',   authenticate, requireAdmin, routes.getAdminRoutes)
r.get('/routes/:id',          routes.getRouteById)

// ── Routes (admin) ────────────────────────────────────────────────────────────
r.post  ('/routes',            authenticate, requireAdmin, uploadSingle, routes.createRoute)
r.put   ('/routes/:id',        authenticate, requireAdmin, uploadSingle, routes.updateRoute)
r.delete('/routes/:id',        authenticate, requireAdmin, routes.deleteRoute)
r.patch ('/routes/:id/status', authenticate, requireAdmin, routes.updateRouteStatus)

// ── Tours (public) ────────────────────────────────────────────────────────────
r.get ('/tours',                   tours.getTours)
r.get ('/tours/admin/list',        authenticate, requireAdmin, tours.getAdminTours)
r.get ('/tours/id/:id',            authenticate, requireAdmin, tours.getTourById)
r.post('/tours/:id/register',      tours.registerTour)
r.post('/tours/reg-check',         tours.checkTourRegistrationPayment)
r.get ('/tours/:id/registrations', authenticate, requireAdmin, tours.getTourRegistrations)
r.get ('/tours/:id/settlement',    authenticate, requireAdmin,      tours.getTourSettlement)
r.post('/tours/:id/settle',        authenticate, requireSuperAdmin, tours.settleTour)
r.get ('/tours/:slug',             tours.getTourBySlug)

// ── Tours (admin) ─────────────────────────────────────────────────────────────
r.post  ('/tours',                             authenticate, requireAdmin, uploadTourFields, tours.createTour)
r.put   ('/tours/:id',                         authenticate, requireAdmin, uploadTourFields, tours.updateTour)
r.delete('/tours/:id',                         authenticate, requireAdmin, tours.deleteTour)
r.patch ('/tours/:id/status',                  authenticate, requireAdmin, tours.updateTourStatus)
r.patch ('/tours/registrations/:regId/status', authenticate, requireAdmin, tours.updateRegistrationStatus)


export default r
