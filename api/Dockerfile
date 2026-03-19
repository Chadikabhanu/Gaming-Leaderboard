FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
RUN apk add --no-cache curl
COPY . .
EXPOSE 8000
CMD ["node", "index.js"]