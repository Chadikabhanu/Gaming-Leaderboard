import redis
import os
import time
from datetime import datetime, timezone
from flask import Flask
from threading import Thread

app = Flask(__name__)

r = redis.Redis(
    host=os.getenv("REDIS_HOST", "redis"),
    port=int(os.getenv("REDIS_PORT", 6379)),
    decode_responses=True
)

script_sha = None

def load_lua():
    global script_sha
    with open("lua_script.lua", "r") as f:
        lua_code = f.read()
    script_sha = r.script_load(lua_code)
    print(f"Lua script loaded: {script_sha}")

def setup_consumer_group():
    try:
        r.xgroup_create("score_events", "leaderboard_group", id="0", mkstream=True)
        print("Consumer group created")
    except redis.exceptions.ResponseError:
        print("Consumer group already exists")

def process_events():
    # Wait for Redis to be ready
    while True:
        try:
            r.ping()
            break
        except Exception:
            print("Waiting for Redis...")
            time.sleep(1)

    setup_consumer_group()
    load_lua()
    print("Consumer started, processing events...")

    while True:
        try:
            messages = r.xreadgroup(
                "leaderboard_group",
                "consumer-1",
                {"score_events": ">"},
                count=10,
                block=1000
            )
            if not messages:
                continue

            for stream, events in messages:
                for msg_id, data in events:
                    try:
                        user_id = data["user_id"]
                        country = data["country_code"].upper()
                        score = data["score"]
                        timestamp = data["timestamp"]

                        # Parse date from timestamp
                        dt = datetime.fromisoformat(
                            timestamp.replace("Z", "+00:00")
                        )
                        date_str = dt.strftime("%Y-%m-%d")

                        keys = [
                            "leaderboard:global",
                            f"leaderboard:country:{country}",
                            f"leaderboard:daily:{date_str}"
                        ]

                        r.evalsha(script_sha, 3, *keys, user_id, score)
                        r.xack("score_events", "leaderboard_group", msg_id)

                    except Exception as e:
                        print(f"Error processing message {msg_id}: {e}")

        except redis.exceptions.ResponseError as e:
            print(f"Redis error: {e}")
            time.sleep(1)
        except Exception as e:
            print(f"Unexpected error: {e}")
            time.sleep(1)

@app.route("/health")
def health():
    return {"status": "ok"}, 200

if __name__ == "__main__":
    Thread(target=process_events, daemon=True).start()
    app.run(host="0.0.0.0", port=5002)