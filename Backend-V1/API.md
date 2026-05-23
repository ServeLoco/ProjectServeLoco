# ServeLoco Backend V1 API Contract

## 1. Local Setup and Environment

### `.env` File
Create a `.env` file in the root of the backend directory with the following structure:
```env
PORT=3000
NODE_ENV=development

# MySQL Setup
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=jaat
DB_NAME=serveloco

# MongoDB Setup (for Images)
MONGO_URI=mongodb://localhost:27017/serveloco

# Authentication
JWT_SECRET=supersecret123
ADMIN_OWNER_ID=admin
ADMIN_PASSWORD=admin

# General
MAX_IMAGE_SIZE_MB=5
PUBLIC_BASE_URL=http://10.0.2.2:3000
CORS_ALLOWED_ORIGINS=http://localhost:3000,http://10.0.2.2:3000
```

### Database Setup
Ensure you have MySQL and MongoDB running locally. You can seed the local testing database with the provided command:
```bash
npm run seed
```

### Base URLs
- **Android Emulator**: Set `PUBLIC_BASE_URL=http://10.0.2.2:3000`
- **iOS Simulator / Localhost**: Set `PUBLIC_BASE_URL=http://localhost:3000`
- **Physical Device**: Set `PUBLIC_BASE_URL=http://<YOUR_LOCAL_IP>:3000`

## 2. Authentication

The API uses standard JSON Web Tokens.
Provide it in the `Authorization` header for protected endpoints:
```http
Authorization: Bearer <your-jwt-token>
```

---

## 3. Endpoints

### 3.1. Customer Auth
**Signup (`POST /api/auth/register`)**
```json
// Request
{
  "name": "John Doe",
  "phone": "9999999999",
  "whatsappNumber": "9999999999",
  "password": "password123",
  "address": "123 Main St"
}
```

**Login (`POST /api/auth/login`)**
```json
// Request
{
  "phone": "9999999999",
  "password": "password123"
}
// Response
{
  "message": "Login successful",
  "token": "eyJhb...",
  "user": { "id": 1, "name": "John Doe" }
}
```

### 3.2. Customer Products & Cart
**Product List (`GET /api/products`)**
```json
// Response
{
  "data": [
    {
      "id": 1,
      "name": "Burger",
      "price": "150.00",
      "category_name": "Fast Food",
      "imageUrl": "http://10.0.2.2:3000/api/images/abc.jpg"
    }
  ]
}
```

**Cart Calculate (`POST /api/cart/calculate`)**
```json
// Request
{
  "items": [
    { "productId": 1, "quantity": 2 }
  ]
}
// Response
{
  "subtotal": 300,
  "deliveryCharge": 10,
  "nightCharge": 0,
  "total": 310,
  "valid": true,
  "items": [...]
}
```

### 3.3. Checkout & Orders
**Checkout (`POST /api/orders`)**
```json
// Request
{
  "address": "123 Main St",
  "paymentMethod": "Cash",
  "items": [
    { "productId": 1, "quantity": 2 }
  ]
}
// Response
{
  "message": "Order created successfully",
  "orderId": 1001,
  "orderNumber": "#ORD-1001"
}
```

### 3.4. Admin Auth & Management
**Admin Login (`POST /api/admin/login`)**
```json
// Request
{
  "ownerId": "admin",
  "password": "admin"
}
```

**Admin Settings Update (`PATCH /api/admin/settings`)**
```json
// Request (Accepts partial payload)
{
  "shopOpen": false
}
```

**Admin Offer Update (`PATCH /api/admin/offers/:id`)**
```json
// Request
{
  "title": "New Offer",
  "active": true
}
```

**Admin Order Status Update (`PATCH /api/admin/orders/:id/status`)**
```json
// Request
{
  "status": "Preparing"
}
```

**Admin Image Upload (`POST /api/admin/images`)**
- Send `multipart/form-data` with a single file under the field name `image`.
- The response returns the fully qualified `imageUrl` and a MongoDB `_id` (`id`) that can be attached to products via `PATCH /api/admin/products/:id/image`.
