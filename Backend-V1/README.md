# Backend-V1

## Deployment Instructions

Before starting the server in a new or updated environment, always run the database migrations. The backend no longer runs dynamic DDL (`ALTER TABLE`) during requests.

```bash
npm run db:migrate
npm start
```