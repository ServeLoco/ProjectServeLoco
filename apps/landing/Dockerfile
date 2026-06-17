# Landing page for serveloco.app
# Serves a single static index.html plus the favicon.

FROM nginx:alpine

# Drop the default nginx welcome page.
RUN rm -rf /usr/share/nginx/html/*

# Copy our static site into the nginx document root.
COPY src/ /usr/share/nginx/html/

# Replace the default nginx site config with our minimal one (gzip + caching).
RUN rm -f /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
