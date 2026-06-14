# ServeLoco Backend API Test Report

Generated: 2026-05-24 15:36 IST  
Base URL tested: `http://localhost:3000`  
Scope: customer signup to delivered order, plus admin setup, product, offer, image, reports, and order management.

## Test Data From Smoke Run

| Item | Value |
| --- | --- |
| Customer phone | `7705241536` |
| Customer password | `Test@12345` |
| Category ID | `10` |
| Product ID | `10` |
| Product image ID | `6a12cde07cee8a640053ff47` |
| Offer ID | `2` |
| Order ID | `6` |
| Order number | `OD-20260524-0001` |

## Smoke Result Summary

| Area | Result | Notes |
| --- | --- | --- |
| Backend health | PASS | MySQL and MongoDB both returned `ok`. |
| Admin auth | PASS | Admin token issued. |
| Admin settings | PASS | Shop and delivery enabled. |
| Admin category/product setup | PASS | Category and product created. |
| Admin image upload/product image attach | PASS | Image uploaded and attached to product `10`. |
| Admin offer setup | PASS | Active offer created. |
| Customer auth/profile | PASS | Customer registered, logged in, fetched profile, updated profile. |
| Product browsing | PASS | Customer category/product endpoints returned created records. |
| Cart calculation | PASS | Subtotal `199`, delivery `10`, total `209`, valid `true`. |
| Checkout/order creation | PASS | Order created in `Pending`. |
| Customer order tracking | PASS | Customer saw order history and detail. |
| Admin order processing | PASS | Pending -> Preparing -> Out for Delivery -> Delivered. |
| Payment update | PASS | Payment marked `Paid`. |
| Reports/dashboard | PASS | Dashboard, sales, customers, and top-products reports returned data. |

## Extended Negative And Edge Scenario Run

Generated: 2026-05-24 15:47 IST  
Result: `51 PASS / 0 FAIL`  

| Item | Value |
| --- | --- |
| Customer phone | `7905241547` |
| Customer password | `Test@12345` |
| Category ID | `12` |
| Product ID | `12` |
| Cancellation order ID | `7` |
| Transition order ID | `8` |

Note: Admin login was already inside the 15-minute rate-limit window from repeated smoke runs, so the extended run verified the rate-limit response (`429`) and used a locally generated admin JWT from the backend auth utility for protected admin checks. Valid admin login had already passed in the main smoke run.

## End-To-End Flow Checklist

### 1. Health And Preflight

| Step | API | Expected |
| --- | --- | --- |
| Check server and DB health | `GET /health` | `status: ok`, `databases.mysql: ok`, `databases.mongodb: ok` |
| Public settings load | `GET /api/settings` | Shop settings returned |
| Public active offer load | `GET /api/offers/active` | Active offer or `data: null` |

### 2. Admin Login And Store Setup

| Step | API | Payload | Expected |
| --- | --- | --- | --- |
| Admin login | `POST /api/admin/login` | `{ "ownerId": "...", "password": "..." }` | Admin JWT token |
| Enable shop/delivery | `PATCH /api/admin/settings` | `{ "shop_open": true, "delivery_available": true, "minimum_order_amount": 50 }` | Settings updated |
| Create category | `POST /api/admin/categories` | `{ "name": "Cold Drinks", "slug": "cold-drinks", "type": "packed", "active": true }` | Category ID returned |
| Upload image | `POST /api/admin/images` | Multipart field `image` | `data.id` and `data.imageUrl` returned |
| Create product | `POST /api/admin/products` | `{ "name": "Cola", "price": 199, "categoryId": 10, "unit": "1 pack", "available": true }` | Product ID returned |
| Attach product image | `PATCH /api/admin/products/:id/image` | `{ "imageId": "..." }` | Product image updated |
| Confirm availability | `PATCH /api/admin/products/:id/availability` | `{ "available": true }` | Product remains available |
| Create active offer | `POST /api/admin/offers` | `{ "title": "Weekend Offer", "description": "...", "active": true }` | Offer ID returned |

### 3. Customer Account And Browse Flow

| Step | API | Payload | Expected |
| --- | --- | --- | --- |
| Register customer | `POST /api/auth/register` | `{ "name": "Test User", "phone": "7705241536", "whatsappNumber": "7705241536", "password": "Test@12345", "address": "Test Address" }` | Customer JWT token and user ID |
| Login customer | `POST /api/auth/login` | `{ "phone": "7705241536", "password": "Test@12345" }` | Customer JWT token |
| Fetch profile | `GET /api/auth/me` | Bearer customer token | Customer profile |
| Update profile | `PATCH /api/auth/profile` | `{ "name": "Updated User", "address": "Updated Address", "whatsappNumber": "7705241536" }` | Profile updated |
| Fetch categories | `GET /api/categories` | None | Active categories |
| Fetch products | `GET /api/products?categoryId=10` | None | Available products in category |
| Fetch product detail | `GET /api/products/:id` | None | Product detail and image URL if attached |

### 4. Cart, Checkout, And Customer Tracking

| Step | API | Payload | Expected |
| --- | --- | --- | --- |
| Calculate cart | `POST /api/cart/calculate` | `{ "items": [{ "productId": 10, "quantity": 1 }] }` | Valid cart, subtotal, delivery, total |
| Place order | `POST /api/orders` | `{ "address": "Updated Address", "paymentMethod": "Cash", "items": [{ "productId": 10, "quantity": 1 }] }` | Order ID, order number, `Pending` status |
| Get customer orders | `GET /api/orders` | Bearer customer token | Created order listed |
| Get customer order detail | `GET /api/orders/:id` | Bearer customer token | Order items and current status |
| Cancel pending order | `PATCH /api/orders/:id/cancel` | `{ "reason": "Changed mind" }` | Only allowed while `Pending` |

### 5. Admin Order Fulfillment

| Step | API | Payload | Expected |
| --- | --- | --- | --- |
| View pending orders | `GET /api/admin/orders?status=Pending` | Bearer admin token | Pending orders returned |
| View order detail | `GET /api/admin/orders/:id` | Bearer admin token | Order and items returned |
| Move to preparing | `PATCH /api/admin/orders/:id/status` | `{ "status": "Preparing" }` | Status updated |
| Move out for delivery | `PATCH /api/admin/orders/:id/status` | `{ "status": "Out for Delivery" }` | Status updated |
| Mark payment paid | `PATCH /api/admin/orders/:id/payment` | `{ "paymentStatus": "Paid" }` | Payment updated |
| Deliver order | `PATCH /api/admin/orders/:id/status` | `{ "status": "Delivered" }` | Final status updated |
| Customer confirms delivery | `GET /api/orders/:id` | Bearer customer token | Customer sees `Delivered` and `Paid` |

### 6. Admin Customer And Reporting Flow

| Step | API | Expected |
| --- | --- | --- |
| Customer list/search | `GET /api/admin/customers?search=7705241536` | Customer returned |
| Customer detail | `GET /api/admin/customers/:id` | Profile, orders, lifetime spend |
| Trust customer | `PATCH /api/admin/customers/:id/trust` | Trust state updated |
| Block/unblock customer | `PATCH /api/admin/customers/:id/block` | Block state updated |
| Dashboard | `GET /api/admin/dashboard` | Sales metrics, latest orders, alerts |
| Sales report | `GET /api/admin/reports/sales` | Today/week/month sales |
| Customer report | `GET /api/admin/reports/customers` | Customer totals |
| Top products report | `GET /api/admin/reports/top-products` | Sold product ranking |
| Audit log | `GET /api/admin/audit` | Recent admin actions if Mongo audit logging is connected |

## Negative And Edge Tests Executed

| Feature | Test | Expected | Actual | Result |
| --- | --- | --- | --- | --- |
| Admin auth | Repeated admin login after limiter threshold | `429` | `429` | PASS |
| Admin auth | Missing admin token | `401` | `401` | PASS |
| Customer auth | Duplicate phone registration | `400` or `409` | `400` | PASS |
| Customer auth | Wrong password | `401` | `401` | PASS |
| Customer auth | Missing customer token | `401` | `401` | PASS |
| Authorization | Customer token on admin route | `401` or `403` | `403` | PASS |
| Product validation | Invalid product payload | `400` | `400` | PASS |
| Image upload | Non-image file upload | `400` | `400` | PASS |
| Cart | Missing `items` field | `400` | `400` | PASS |
| Cart | Empty `items` array | `200` with `valid=false` | `200`, `valid=false` | PASS |
| Checkout | Below minimum order | `400` | `400` | PASS |
| Checkout | Unavailable product | `400` | `400` | PASS |
| Checkout | Blocked customer | `403` | `403` | PASS |
| Customer order | Cancel pending order | `200` | `200` | PASS |
| Customer order | Cancel after `Preparing` | `400` | `400` | PASS |
| Admin order status | Move backward from `Preparing` to `Pending` | `400` | `400` | PASS |
| Admin order status | Change delivered order | `400` | `400` | PASS |
| Admin payment | Update payment for cancelled order | `400` | `400` | PASS |
| Admin customers | Block/unblock customer | `200` | `200` | PASS |
| Admin customers | Trust/untrust customer | `200` | `200` | PASS |
| Admin audit | Fetch audit logs | `200` | `200` | PASS |
| Admin filters | Products by category/search | `200` with expected product | `200` with expected product | PASS |
| Admin filters | Customers by search/page/limit | `200` with expected customer | `200` with expected customer | PASS |
| Admin filters | Orders by status/search/payment filters | `200` | `200` | PASS |

## Actual Smoke Steps Executed

| # | Feature | Method | Path | Result |
| --- | --- | --- | --- | --- |
| 1 | Backend health | GET | `/health` | PASS |
| 2 | Admin login | POST | `/api/admin/login` | PASS |
| 3 | Admin settings enable shop/delivery | PATCH | `/api/admin/settings` | PASS |
| 4 | Admin create category | POST | `/api/admin/categories` | PASS |
| 5 | Admin upload product image | POST | `/api/admin/images` | PASS |
| 6 | Admin create product | POST | `/api/admin/products` | PASS |
| 7 | Admin attach product image | PATCH | `/api/admin/products/10/image` | PASS |
| 8 | Admin confirm product availability | PATCH | `/api/admin/products/10/availability` | PASS |
| 9 | Admin create active offer | POST | `/api/admin/offers` | PASS |
| 10 | Customer sees settings | GET | `/api/settings` | PASS |
| 11 | Customer sees categories | GET | `/api/categories` | PASS |
| 12 | Customer sees product list | GET | `/api/products?categoryId=10` | PASS |
| 13 | Customer account creation | POST | `/api/auth/register` | PASS |
| 14 | Customer login | POST | `/api/auth/login` | PASS |
| 15 | Customer profile fetch | GET | `/api/auth/me` | PASS |
| 16 | Customer profile update | PATCH | `/api/auth/profile` | PASS |
| 17 | Cart calculation | POST | `/api/cart/calculate` | PASS |
| 18 | Customer places order | POST | `/api/orders` | PASS |
| 19 | Customer order history | GET | `/api/orders` | PASS |
| 20 | Customer order detail | GET | `/api/orders/6` | PASS |
| 21 | Admin sees pending order | GET | `/api/admin/orders?status=Pending&search=OD-20260524-0001` | PASS |
| 22 | Admin order detail | GET | `/api/admin/orders/6` | PASS |
| 23 | Admin status preparing | PATCH | `/api/admin/orders/6/status` | PASS |
| 24 | Admin status out for delivery | PATCH | `/api/admin/orders/6/status` | PASS |
| 25 | Admin marks payment paid | PATCH | `/api/admin/orders/6/payment` | PASS |
| 26 | Admin status delivered | PATCH | `/api/admin/orders/6/status` | PASS |
| 27 | Customer sees delivered order | GET | `/api/orders/6` | PASS |
| 28 | Admin dashboard updates | GET | `/api/admin/dashboard` | PASS |
| 29 | Admin sales report | GET | `/api/admin/reports/sales` | PASS |
| 30 | Admin customers report | GET | `/api/admin/reports/customers` | PASS |
| 31 | Admin top products report | GET | `/api/admin/reports/top-products` | PASS |

## Extended Scenario Steps Executed

| # | Feature | Method | Path | Expected | Actual | Result |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Backend health | GET | `/health` | `200` | `200` | PASS |
| 2 | Admin login rate limit active | POST | `/api/admin/login` | `429/401` | `429` | PASS |
| 3 | Protected admin route missing token | GET | `/api/admin/dashboard` | `401` | `401` | PASS |
| 4 | Reset settings for tests | PATCH | `/api/admin/settings` | `200` | `200` | PASS |
| 5 | Admin create category | POST | `/api/admin/categories` | `201` | `201` | PASS |
| 6 | Admin invalid product rejected | POST | `/api/admin/products` | `400` | `400` | PASS |
| 7 | Admin create product | POST | `/api/admin/products` | `201` | `201` | PASS |
| 8 | Admin non-image upload rejected | POST | `/api/admin/images` | `400` | `400` | PASS |
| 9 | Admin product category filter | GET | `/api/admin/products?categoryId=12` | `200 + product` | `200 + product` | PASS |
| 10 | Admin product search filter | GET | `/api/admin/products?search=...` | `200 + product` | `200 + product` | PASS |
| 11 | Customer register | POST | `/api/auth/register` | `201` | `201` | PASS |
| 12 | Customer duplicate phone rejected | POST | `/api/auth/register` | `400/409` | `400` | PASS |
| 13 | Customer wrong password rejected | POST | `/api/auth/login` | `401` | `401` | PASS |
| 14 | Missing customer token rejected | GET | `/api/auth/me` | `401` | `401` | PASS |
| 15 | Customer token rejected on admin route | GET | `/api/admin/dashboard` | `401/403` | `403` | PASS |
| 16 | Cart missing items rejected | POST | `/api/cart/calculate` | `400` | `400` | PASS |
| 17 | Empty cart invalid total | POST | `/api/cart/calculate` | `200 + valid=false` | `200 + valid=false` | PASS |
| 18 | Set high minimum order | PATCH | `/api/admin/settings` | `200` | `200` | PASS |
| 19 | Below-minimum checkout rejected | POST | `/api/orders` | `400` | `400` | PASS |
| 20 | Restore minimum order | PATCH | `/api/admin/settings` | `200` | `200` | PASS |
| 21 | Product unavailable toggle | PATCH | `/api/admin/products/12/availability` | `200` | `200` | PASS |
| 22 | Unavailable product checkout rejected | POST | `/api/orders` | `400` | `400` | PASS |
| 23 | Product availability restored | PATCH | `/api/admin/products/12/availability` | `200` | `200` | PASS |
| 24 | Customer blocked | PATCH | `/api/admin/customers/:id/block` | `200` | `200` | PASS |
| 25 | Blocked customer checkout rejected | POST | `/api/orders` | `403` | `403` | PASS |
| 26 | Customer unblocked | PATCH | `/api/admin/customers/:id/block` | `200` | `200` | PASS |
| 27 | Customer trusted | PATCH | `/api/admin/customers/:id/trust` | `200` | `200` | PASS |
| 28 | Customer untrusted | PATCH | `/api/admin/customers/:id/trust` | `200` | `200` | PASS |
| 29 | Customer search pagination | GET | `/api/admin/customers?search=...` | `200 + customer` | `200 + customer` | PASS |
| 30 | Customer detail | GET | `/api/admin/customers/:id` | `200` | `200` | PASS |
| 31 | Create pending order for cancel | POST | `/api/orders` | `201` | `201` | PASS |
| 32 | Cancel pending order | PATCH | `/api/orders/7/cancel` | `200` | `200` | PASS |
| 33 | Customer sees cancelled order | GET | `/api/orders/7` | `200 + Cancelled` | `200 + Cancelled` | PASS |
| 34 | Create order for transitions | POST | `/api/orders` | `201` | `201` | PASS |
| 35 | Move order to Preparing | PATCH | `/api/admin/orders/8/status` | `200` | `200` | PASS |
| 36 | Cancel after Preparing rejected | PATCH | `/api/orders/8/cancel` | `400` | `400` | PASS |
| 37 | Backward status rejected | PATCH | `/api/admin/orders/8/status` | `400` | `400` | PASS |
| 38 | Move order Out for Delivery | PATCH | `/api/admin/orders/8/status` | `200` | `200` | PASS |
| 39 | Deliver transition order | PATCH | `/api/admin/orders/8/status` | `200` | `200` | PASS |
| 40 | Terminal status change rejected | PATCH | `/api/admin/orders/8/status` | `400` | `400` | PASS |
| 41 | Cancelled order payment update rejected | PATCH | `/api/admin/orders/7/payment` | `400` | `400` | PASS |
| 42 | Admin orders status filter | GET | `/api/admin/orders?status=Delivered` | `200` | `200` | PASS |
| 43 | Admin orders search filter | GET | `/api/admin/orders?search=...` | `200 + order` | `200 + order` | PASS |
| 44 | Admin orders payment filters | GET | `/api/admin/orders?paymentStatus=Pending&paymentMethod=Cash` | `200` | `200` | PASS |
| 45 | Admin offers list | GET | `/api/admin/offers` | `200` | `200` | PASS |
| 46 | Admin images list | GET | `/api/admin/images` | `200` | `200` | PASS |
| 47 | Admin audit log list | GET | `/api/admin/audit` | `200` | `200` | PASS |
| 48 | Admin dashboard | GET | `/api/admin/dashboard` | `200` | `200` | PASS |
| 49 | Admin sales report | GET | `/api/admin/reports/sales` | `200` | `200` | PASS |
| 50 | Admin customers report | GET | `/api/admin/reports/customers` | `200` | `200` | PASS |
| 51 | Admin top products report | GET | `/api/admin/reports/top-products` | `200` | `200` | PASS |

## Notes

- The first smoke script expected image upload fields at the response root, but the API correctly returns them under `data` and `image`. The image upload and product image attach were retested successfully.
- The backend order status flow enforces forward-only movement: `Pending -> Preparing -> Out for Delivery -> Delivered`.
- Customer cancellation was tested with a separate fresh `Pending` order and passed.
- Admin login wrong-password response could not be isolated live during the extended run because the admin login limiter was already active. The limiter behavior itself was verified as `429`, and valid admin login passed in the main smoke run.
