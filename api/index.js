const express = require("express");
const { createServer } = require("http");
const { Server } = require("socket.io");
const Redis = require("ioredis");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*" },
  path: "/socket.io"
});

const redis = new Redis({
  host: process.env.REDIS_HOST || "redis",
  port: parseInt(process.env.REDIS_PORT) || 6379,
  retryStrategy: (times) => Math.min(times * 100, 3000)
});

const subscriber = new Redis({
  host: process.env.REDIS_HOST || "redis",
  port: parseInt(process.env.REDIS_PORT) || 6379,
  retryStrategy: (times) => Math.min(times * 100, 3000)
});

// Health check
app.get("/health", (req, res) => res.json({ status: "ok" }));

// Helper: fetch top N from a sorted set
async function getLeaderboard(key, limit = 50) {
  const results = await redis.zrevrange(key, 0, limit - 1, "WITHSCORES");
  const entries = [];
  for (let i = 0; i < results.length; i += 2) {
    entries.push({
      rank: i / 2 + 1,
      user_id: results[i],
      score: parseFloat(results[i + 1])
    });
  }
  return entries;
}

// GET /api/leaderboard/global
app.get("/api/leaderboard/global", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const data = await getLeaderboard("leaderboard:global", limit);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/leaderboard/country/:country_code
app.get("/api/leaderboard/country/:country_code", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const key = `leaderboard:country:${req.params.country_code.toUpperCase()}`;
    const data = await getLeaderboard(key, limit);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/leaderboard/global/7-day
app.get("/api/leaderboard/global/7-day", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const keys = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - i);
      keys.push(`leaderboard:daily:${d.toISOString().split("T")[0]}`);
    }
    const tempKey = `leaderboard:7day:temp:${Date.now()}`;
    await redis.zunionstore(tempKey, keys.length, ...keys);
    await redis.expire(tempKey, 30);
    const data = await getLeaderboard(tempKey, limit);
    await redis.del(tempKey);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Subscribe to Redis Pub/Sub and forward to WebSocket clients
subscriber.subscribe("rank_updates", (err) => {
  if (err) console.error("Subscribe error:", err);
  else console.log("Subscribed to rank_updates channel");
});

subscriber.on("message", (channel, message) => {
  if (channel === "rank_updates") {
    try {
      const data = JSON.parse(message);
      io.emit("rank_update", { event: "RANK_UPDATE", data });
    } catch (e) {
      console.error("Parse error:", e);
    }
  }
});

io.on("connection", (socket) => {
  console.log("WebSocket client connected:", socket.id);
  socket.on("disconnect", () => {
    console.log("WebSocket client disconnected:", socket.id);
  });
});

const PORT = parseInt(process.env.API_PORT) || 8000;
httpServer.listen(PORT, () => {
  console.log(`API + WebSocket server running on port ${PORT}`);
});