# Single app image: builds the client and server, the server serves both.
FROM node:22-alpine AS client-build
WORKDIR /client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

FROM node:22-alpine AS server-build
# Prisma's engines need OpenSSL on Alpine.
RUN apk add --no-cache openssl
WORKDIR /server
COPY server/package*.json ./
RUN npm ci
COPY server/ ./
# The TypeScript build needs the generated Prisma client types.
RUN npx prisma generate && npm run build

FROM node:22-alpine
ENV NODE_ENV=production
RUN apk add --no-cache openssl
WORKDIR /app
COPY server/package*.json ./
RUN npm ci --omit=dev
COPY --from=server-build /server/dist ./dist
# Generated Prisma client (the prisma CLI is a dev dependency, so it is not regenerated here).
COPY --from=server-build /server/node_modules/.prisma ./node_modules/.prisma
COPY --from=client-build /client/dist ./public
USER node
EXPOSE 3000
CMD ["node", "dist/index.js"]
