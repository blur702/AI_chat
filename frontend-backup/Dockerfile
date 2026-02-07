FROM node:20-alpine

RUN addgroup -S app && adduser -S app -G app

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy application code
COPY . .

RUN chown -R app:app /app

USER app

# Expose port
EXPOSE 3000

# Production: use "npm start"; for development override with: CMD ["npm", "run", "dev"]
CMD ["npm", "start"]
