# Use Node.js 20 Alpine for a lightweight image
FROM node:20-alpine

# Set the working directory
WORKDIR /usr/src/app

# Set Node environment to production
ENV NODE_ENV=production

# Copy package.json and package-lock.json
COPY package*.json ./

# Install production dependencies
# Using npm ci for a clean, deterministic install
RUN npm ci --only=production

# Copy the rest of the application code
COPY . .

# Ensure the uploads directory exists and is writable
RUN mkdir -p uploads && chown -R node:node uploads

# Switch to a non-root user for security
USER node

# Expose the application port
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
