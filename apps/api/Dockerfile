FROM node:20-alpine AS deps
WORKDIR /app

COPY package.json yarn.lock ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN (corepack enable && corepack prepare yarn@1.22.22 --activate) || npm i -g yarn@1.22.22
RUN yarn install --frozen-lockfile

FROM deps AS build
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN yarn workspace @afm/shared build && yarn workspace @afm/api build

FROM node:20-alpine AS run
WORKDIR /app
ENV NODE_ENV=production

# node_modules contain workspace links; keep workspace folders in place
COPY --from=deps /app/node_modules /app/node_modules
COPY packages/shared/package.json packages/shared/package.json
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY apps/api/package.json apps/api/package.json
COPY --from=build /app/apps/api/dist apps/api/dist
COPY apps/api/scripts apps/api/scripts
COPY apps/api/db/migrations apps/api/db/migrations

EXPOSE 3000
CMD ["node", "apps/api/dist/server.js"]


