# Phase 1 Execution Plan — VillKro → Production

> Decisions locked: **Azure MySQL** (uses your $150 credit) + domain **serveloco.app**.
> This plan does the CODE work first (currently NOT done), then guides the AWS/Azure console clicks.

---

## Why code comes before AWS (the teaching bit)

Your image upload code (`imageRoutes.js`, `imageController.js`, `bulkImportController.js`)
currently writes files to the **container's local disk**. On Lightsail, the disk is wiped on
every redeploy/restart — so **every uploaded image would vanish**. S3 is therefore a hard
prerequisite, and it isn't wired in yet. We fix the code, test locally, *then* deploy.

---

## PART A — Code changes (I do these on your laptop)

### A1. Add AWS SDK dependency
- `apps/api/package.json`: add `@aws-sdk/client-s3` (v3). Run `npm install` after.

### A2. New file `apps/api/src/config/s3.js`
- Creates an S3 client from `S3_REGION` + AWS creds.
- Exports `uploadBuffer(key, buffer, mimeType)` → returns the public S3 URL.
- Exports `deleteObject(key)` for cleanup.
- **Keeps your magic-byte security check** by uploading from memory (no `multer-s3`,
  which would skip that check). This is safer than the original plan.

### A3. `apps/api/src/config/env.js`
- Add `S3_BUCKET`, `S3_REGION`, `S3_PUBLIC_URL`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`.
- Add `STORAGE_DRIVER` (`disk` | `s3`, default `disk`) so local dev still works with disk
  and production uses S3 — **zero behavior change locally**.

### A4. `apps/api/src/routes/imageRoutes.js`
- Switch multer to `memoryStorage()` (file kept in RAM, not disk).
- Run magic-byte check on `req.file.buffer` instead of a disk path.

### A5. `apps/api/src/controllers/imageController.js`
- When `STORAGE_DRIVER=s3`: call `uploadBuffer()`, store the real S3 URL + `storageType:'s3'`.
- `deleteImage`: delete from S3 when `storageType==='s3'`, else keep existing disk delete.
- Disk path stays as the fallback — existing tests keep passing.

### A6. `apps/api/src/controllers/bulkImportController.js`
- Same S3 swap for ZIP-embedded images (`saveImageToDisk` → S3 when driver is s3).
- Rollback logic updated to delete S3 objects on transaction failure.

### A7. `apps/api/src/app.js`
- Keep `/uploads` static serving **only** when `STORAGE_DRIVER=disk` (local dev).
  In production (s3) it's harmless but unused.

### A8. Web app container (for hosting the PWA)
- New `apps/web/Dockerfile` (node build → nginx serve).
- New `apps/web/nginx.conf` (SPA fallback + asset caching).
- New `apps/web/.dockerignore`.

### A9. Production env template
- Update `apps/api/.env.production.example` with Azure MySQL + S3 + serveloco.app values.

### A10. Verify locally
- `cd apps/api && npm test` (must stay green — disk driver unchanged).
- `npm run lint`.

**Nothing in Part A changes how the app behaves on your machine.** Disk stays default locally.

---

## PART B — AWS / Azure console (YOU click, I guide every step)

I will walk you through each of these one screen at a time, in this order. We do them
**after** Part A is tested.

1. **Install tools** — AWS CLI, Docker Desktop, Node 20 (we'll check what you already have first).
2. **AWS account + IAM admin user** + `aws configure`.
3. **S3 bucket** `villkro-images-prod` (public-read + CORS).
4. **IAM user** `villkro-api-s3` (S3 access keys for the API).
5. **Azure MySQL** Flexible Server B1ms + DigiCert CA cert.
6. **MongoDB Atlas** M0 free cluster.
7. **JWT secret + bcrypt admin hash** (I generate these locally for you).
8. **Lightsail Container Service** `villkro-api` + push Docker image.
9. **Deploy** with all env vars.
10. **Cloudflare DNS** for api./admin./app.serveloco.app.
11. **Build + host admin & web** static apps.
12. **Smoke test** the live URLs.

---

## What I need from you to start Part A
Nothing — I can write all the code now. Say go and I'll make the edits, then run the tests.

## What I'll need from you for Part B (gather these now if you can)
- [ ] Confirm you have/will create an AWS account
- [ ] Confirm your Azure $150 student credit is active
- [ ] The admin email you want to log in with (`ADMIN_OWNER_ID`)
- [ ] A strong admin password (I'll bcrypt-hash it — never stored in plaintext)
- [ ] Confirm `serveloco.app` is registered and where (Name.com? Cloudflare?)
