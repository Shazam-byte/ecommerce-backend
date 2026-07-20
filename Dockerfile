FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

# Compiles src/ -> dist/ using tsconfig.json
RUN npm run build

EXPOSE 5000

# Runs node dist/index.js (or configured start script)
CMD ["npm", "start"]