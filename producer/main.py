import redis
import random
import time
import os
from datetime import datetime, timezone
from faker import Faker
from flask import Flask
from threading import Thread

fake = Faker()
app = Flask(__name__)

COUNTRIES = ["US", "DE", "JP", "FR", "BR", "IN", "GB", "AU", "CA", "KR"]

r = redis.Redis(
    host=os.getenv("REDIS_HOST", "redis"),
    port=int(os.getenv("REDIS_PORT", 6379)),
    decode_responses=True
)

@app.route("/health")
def health():
    return {"status": "ok"}, 200

def produce_events():
    # Create a fixed pool of 200 users so leaderboard is meaningful
    user_ids = [fake.user_name() + str(random.randint(1, 1000)) for _ in range(200)]
    while True:
        try:
            event = {
                "user_id": random.choice(user_ids),
                "country_code": random.choice(COUNTRIES),
                "score": str(random.randint(10, 500)),
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
            r.xadd("score_events", event)
            time.sleep(0.1)
        except Exception as e:
            print(f"Producer error: {e}")
            time.sleep(1)

if __name__ == "__main__":
    Thread(target=produce_events, daemon=True).start()
    app.run(host="0.0.0.0", port=5001)
