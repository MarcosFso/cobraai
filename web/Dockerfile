# Stage 1: build the static site
FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Which back end the site talks to. "rest" = the Java/Kafka microservices; the browser calls them directly,
# so the URLs are the public ones (or /api/... paths when everything sits behind one proxy).
ARG VITE_BACKEND=rest
ARG VITE_BILLING_URL=http://localhost:8080
ARG VITE_REPORT_URL=http://localhost:8000
ARG VITE_NOTIFICATION_URL=http://localhost:3000
ENV VITE_BACKEND=$VITE_BACKEND VITE_BILLING_URL=$VITE_BILLING_URL VITE_REPORT_URL=$VITE_REPORT_URL VITE_NOTIFICATION_URL=$VITE_NOTIFICATION_URL
RUN npm run build

# Stage 2: serve only the built files
FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
