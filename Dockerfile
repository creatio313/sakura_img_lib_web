FROM node:26 AS deps
WORKDIR /app
COPY img_lib_web/package.json img_lib_web/package-lock.json ./
RUN npm ci

FROM node:26 AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ARG NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
COPY --from=deps /app/node_modules ./node_modules
COPY img_lib_web/ ./
RUN npm run build

FROM gcr.io/distroless/nodejs26-debian13:nonroot-amd64
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=8080
ENV HOSTNAME=0.0.0.0
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
EXPOSE 8080
CMD ["server.js"]