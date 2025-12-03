# Build stage
FROM node:24-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY tsconfig.json ./
COPY src ./src

# Build the project
RUN npm run build

# Production stage
FROM node:24-alpine

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy built assets from builder stage
COPY --from=builder /app/dist ./dist

# Set user to non-root
USER node

# Start the operator
CMD ["node", "dist/index.js"]
