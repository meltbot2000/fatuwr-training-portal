FROM node:20-alpine
# Pin pnpm to the version in package.json's packageManager field.
# Unpinned, this installs whatever pnpm is newest at build time. A pnpm
# release added strict verification of packageManager identity against the
# lockfile, and pnpm-lock.yaml (written by 10.4.1) has no @pnpm/exe.* entry,
# so every build began failing with ERR_PNPM_PNPM_ENGINE_IDENTITY_UNVERIFIABLE
# with no repo change to explain it. Keep this in step with packageManager.
RUN npm install -g pnpm@10.4.1
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
# Copy patches before install — pnpm applies them during install
COPY patches ./patches
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build
EXPOSE 3000
CMD ["node", "dist/index.js"]
