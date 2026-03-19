import React, { useEffect, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import axios from "axios";
import "./App.css";

const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:8000";

interface Player {
  rank: number;
  user_id: string;
  score: number;
  highlight?: "up" | "down";
}

const COUNTRIES = ["ALL", "US", "DE", "JP", "FR", "BR", "IN", "GB", "AU", "CA", "KR"];

export default function App() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [country, setCountry] = useState("ALL");
  const [timespan, setTimespan] = useState<"all-time" | "7-day">("all-time");
  const [connected, setConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<string>("");

  const fetchLeaderboard = useCallback(async () => {
    try {
      let url = `${API_BASE}/api/leaderboard/global?limit=50`;
      if (timespan === "7-day") {
        url = `${API_BASE}/api/leaderboard/global/7-day?limit=50`;
      } else if (country !== "ALL") {
        url = `${API_BASE}/api/leaderboard/country/${country}?limit=50`;
      }
      const { data } = await axios.get<Player[]>(url);
      setPlayers(data);
    } catch (e) {
      console.error("Fetch error:", e);
    }
  }, [country, timespan]);

  // Refetch when filters change
  useEffect(() => {
    fetchLeaderboard();
  }, [fetchLeaderboard]);

  // WebSocket connection
  useEffect(() => {
    const socket: Socket = io(API_BASE, { path: "/socket.io" });

    socket.on("connect", () => {
      setConnected(true);
      console.log("WebSocket connected");
    });

    socket.on("disconnect", () => {
      setConnected(false);
    });

    socket.on("rank_update", ({ data }) => {
      setLastUpdate(`${data.user_id}: rank ${data.old_rank} → ${data.new_rank}`);

      setPlayers(prev =>
        prev.map(p => {
          if (p.user_id !== data.user_id) return p;
          const direction = data.new_rank < data.old_rank ? "up" : "down";
          // Remove highlight after 1.5s
          setTimeout(() => {
            setPlayers(cur =>
              cur.map(x =>
                x.user_id === data.user_id ? { ...x, highlight: undefined } : x
              )
            );
          }, 1500);
          return {
            ...p,
            rank: data.new_rank,
            score: data.score,
            highlight: direction,
          };
        })
      );
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <h1>🎮 Live Leaderboard</h1>
        <span className={`status ${connected ? "online" : "offline"}`}>
          {connected ? "● LIVE" : "○ Connecting..."}
        </span>
      </header>

      {lastUpdate && (
        <div className="update-banner">⚡ {lastUpdate}</div>
      )}

      <div className="controls">
        <label>
          Country:&nbsp;
          <select
            data-testid="country-filter"
            value={country}
            onChange={e => {
              setCountry(e.target.value);
              setTimespan("all-time");
            }}
          >
            {COUNTRIES.map(c => (
              <option key={c} value={c}>{c === "ALL" ? "🌍 All Countries" : c}</option>
            ))}
          </select>
        </label>

        <button
          data-testid="timespan-toggle"
          className={`toggle-btn ${timespan === "7-day" ? "active" : ""}`}
          onClick={() => {
            setTimespan(t => (t === "all-time" ? "7-day" : "all-time"));
            setCountry("ALL");
          }}
        >
          {timespan === "all-time" ? "📅 Switch to 7-Day" : "🏆 Switch to All-Time"}
        </button>

        <button className="refresh-btn" onClick={fetchLeaderboard}>
          🔄 Refresh
        </button>
      </div>

      <div className="table-wrapper">
        <table data-testid="leaderboard-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Player</th>
              <th>Score</th>
            </tr>
          </thead>
          <tbody>
            {players.length === 0 ? (
              <tr>
                <td colSpan={3} className="empty">Loading leaderboard...</td>
              </tr>
            ) : (
              players.map(p => (
                <tr
                  key={p.user_id}
                  data-testid={`leaderboard-row-${p.user_id}`}
                  className={p.highlight ? `rank-change-${p.highlight}` : ""}
                >
                  <td className="rank">
                    {p.rank === 1 ? "🥇" : p.rank === 2 ? "🥈" : p.rank === 3 ? "🥉" : p.rank}
                  </td>
                  <td className="username">{p.user_id}</td>
                  <td className="score">{p.score.toLocaleString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}