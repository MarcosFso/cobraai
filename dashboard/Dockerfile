# Stage 1: build the static site
FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# The browser calls the services directly, so these are the public (host) addresses.
ARG VITE_BILLING_URL=http://localhost:8080
ARG VITE_REPORT_URL=http://localhost:8000
ENV VITE_BILLING_URL=$VITE_BILLING_URL VITE_REPORT_URL=$VITE_REPORT_URL
RUN npm run build

# Stage 2: serve only the built files
FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
