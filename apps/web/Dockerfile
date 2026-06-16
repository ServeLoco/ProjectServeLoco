# Stage 1: Build the React (Vite) PWA
FROM node:20-alpine AS build

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy the rest of the application code
COPY . .

# The API base URL is baked in at build time (Vite inlines VITE_* vars).
# The client reads VITE_API_URL (see apps/web/src/api/client.js), so the
# build arg MUST match that name or the fallback "http://localhost:3000/api"
# is used and the deployed app can't reach the API.
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

# Stage 2: Serve the static build with Nginx
FROM nginx:alpine

# Copy the build output from the previous stage to the Nginx html directory
COPY --from=build /app/dist /usr/share/nginx/html

# Copy the custom Nginx configuration (SPA fallback + asset caching + /api proxy)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 80
EXPOSE 80

# Start Nginx
CMD ["nginx", "-g", "daemon off;"]
