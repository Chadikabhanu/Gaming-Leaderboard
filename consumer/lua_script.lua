-- KEYS[1] = leaderboard:global
-- KEYS[2] = leaderboard:country:{code}
-- KEYS[3] = leaderboard:daily:{date}
-- ARGV[1] = user_id
-- ARGV[2] = score_increment

local old_rank = redis.call('ZREVRANK', KEYS[1], ARGV[1])

redis.call('ZINCRBY', KEYS[1], ARGV[2], ARGV[1])
redis.call('ZINCRBY', KEYS[2], ARGV[2], ARGV[1])
redis.call('ZINCRBY', KEYS[3], ARGV[2], ARGV[1])

local new_rank = redis.call('ZREVRANK', KEYS[1], ARGV[1])
local new_score = redis.call('ZSCORE', KEYS[1], ARGV[1])

if old_rank and new_rank and old_rank ~= new_rank then
    if old_rank < 100 and new_rank < 100 then
        local message = cjson.encode({
            user_id = ARGV[1],
            old_rank = old_rank + 1,
            new_rank = new_rank + 1,
            score = tonumber(new_score)
        })
        redis.call('PUBLISH', 'rank_updates', message)
    end
end

return new_rank