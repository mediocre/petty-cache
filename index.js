const async = require('async');
const lock = require('lock').Lock();
const memoryCache = require('memory-cache');
const redis = require('redis');

function PettyCache(port, host, options) {
    const intervals = {};
    const redisClient = redis.createClient(port || 6379, host || '127.0.0.1', options);

    redisClient.on('error', err => console.warn(`Warning: Redis reported a client error: ${err}`));

    function bulkGetFromRedis(keys, callback) {
        // Try to get values from Redis
        redisClient.mget(keys, function(err, data) {
            if (err) {
                return callback(err);
            }

            const values = {};

            for (var i = 0; i < keys.length; i++) {
                var key = keys[i];
                var value = data[i];

                if (value === null) {
                    values[key] = { exists: false };
                    continue;
                }

                values[key] = { exists: true, value: PettyCache.parse(value) };
            }

            callback(null, values);
        });
    }

    function getFromMemoryCache(key) {
        // Try to get value from memory cache
        const value = memoryCache.get(key);

        // Return value from the memory cache if it's not null
        if (value !== null) {
            return { exists: true, value };
        }

        // If the key exists, the value in the memory cache is null
        if (memoryCache.keys().includes(key)) {
            return { exists: true, value: null };
        }

        // The key wasn't found in memory cache
        return { exists: false };
    }

    function getFromRedis(key, callback) {
        // Try to get value from Redis
        redisClient.get(key, function(err, data) {
            if (err) {
                return callback(err);
            }

            // Return if the key wasn't found in Redis
            if (data === null) {
                return callback(null, { exists: false });
            }

            callback(null, { exists: true, value: PettyCache.parse(data) });
        });
    }

    function getTtl(options) {
        // Default TTL is 30-60 seconds
        var ttl = {
            max: 60000,
            min: 30000
        };

        if (Object.prototype.hasOwnProperty.call(options, 'ttl')) {
            if (typeof options.ttl === 'number') {
                ttl.max = options.ttl;
                ttl.min = options.ttl;
            } else {
                if (Object.prototype.hasOwnProperty.call(options.ttl, 'max')) {
                    ttl.max = options.ttl.max;
                }

                if (Object.prototype.hasOwnProperty.call(options.ttl, 'min')) {
                    ttl.min = options.ttl.min;
                }
            }
        }

        return ttl;
    }

    /**
     * @param {Array} keys - An array of keys.
     */
    this.bulkFetch = function(keys, func, callback) {
        // If there aren't any keys, return
        if (!keys.length) {
            return callback(null, {});
        }

        const _keys = Array.from(new Set(keys));
        const values = {};

        // Try to get values from memory cache
        for (var i = _keys.length - 1; i >= 0; i--) {
            const key = _keys[i];
            const result = getFromMemoryCache(key);

            if (result.exists) {
                values[key] = result.value;
                _keys.splice(i, 1);
            }
        }

        // If there aren't any keys left, return
        if (!_keys.length) {
            return callback(null, values);
        }

        const _this = this;

        // Try to get values from Redis
        bulkGetFromRedis(_keys, function(err, results) {
            if (err) {
                return callback(err);
            }

            for (var i = _keys.length - 1; i >= 0; i--) {
                const key = _keys[i];
                const result = results[key];

                if (result.exists) {
                    _keys.splice(i, 1);
                    values[key] = result.value;

                    // Store value in memory cache with a short expiration
                    memoryCache.put(key, result.value, random(2000, 5000));
                }
            }

            // If there aren't any keys left, return
            if (!_keys.length) {
                return callback(null, values);
            }

            // Execute the specified function for remaining keys
            func(_keys, function(err, data) {
                if (err) {
                    return callback(err);
                }

                Object.keys(data).forEach(key => values[key] = data[key]);

                _this.bulkSet(data, err => callback(err, values));
            });
        });
    };

    /**
     * @param {Array} keys - An array of keys.
     */
    this.bulkGet = function(keys, callback) {
        // If there aren't any keys, return
        if (!keys.length) {
            return callback(null, {});
        }

        const _keys = Array.from(new Set(keys));
        const values = {};

        // Try to get values from memory cache
        for (var i = _keys.length - 1; i >= 0; i--) {
            const key = _keys[i];
            const result = getFromMemoryCache(key);

            if (result.exists) {
                values[key] = result.value;
                _keys.splice(i, 1);
            }
        }

        // If there aren't any keys left, return
        if (!_keys.length) {
            return callback(null, values);
        }

        // Try to get values from Redis
        bulkGetFromRedis(_keys, function(err, results) {
            if (err) {
                return callback(err);
            }

            for (var i = 0; i < _keys.length; i++) {
                var key = _keys[i];
                var result = results[key];

                if (!result.exists) {
                    values[key] = null;
                    continue;
                }

                values[key] = result.value;

                // Store value in memory cache with a short expiration
                memoryCache.put(key, result.value, random(2000, 5000));
            }

            callback(null, values);
        });
    };

    this.bulkSet = function(values, options, callback) {
        // Options are optional
        if (!callback) {
            callback = options;
            options = {};
        }

        // Redis does not have a MSETEX command so we batch commands: http://redis.js.org/#api-clientbatchcommands
        var batch = redisClient.batch();

        Object.keys(values).forEach(key => {
            var value = values[key];

            // Store value in memory cache with a short expiration
            memoryCache.put(key, value, random(2000, 5000));

            // Default TTL is 30-60 seconds
            var ttl = {
                max: 60000,
                min: 30000
            };

            if (Object.prototype.hasOwnProperty.call(options, 'ttl')) {
                if (typeof options.ttl === 'number') {
                    ttl.max = options.ttl;
                    ttl.min = options.ttl;
                } else {
                    if (Object.prototype.hasOwnProperty.call(options.ttl, 'max')) {
                        ttl.max = options.ttl.max;
                    }

                    if (Object.prototype.hasOwnProperty.call(options.ttl, 'min')) {
                        ttl.min = options.ttl.min;
                    }
                }
            }

            // Add Redis command
            batch.psetex(key, random(ttl.min, ttl.max), PettyCache.stringify(value));
        });

        batch.exec(function(err) {
            callback(err);
        });
    };

    this.del = function(key, callback) {
        redisClient.del(key, function(err) {
            if (err) {
                return callback(err);
            }

            memoryCache.del(key);
            callback();
        });
    };

    // Returns data from cache if available;
    // otherwise executes the specified function and places the results in cache before returning the data.
    this.fetch = function(key, func, options, callback) {
        options = options || {};

        if (typeof options === 'function') {
            callback = options;
            options = {};
        }

        // Default callback is a noop
        callback = callback || function() {};

        // Try to get value from memory cache
        var result = getFromMemoryCache(key);

        // Return value from memory cache if it exists
        if (result.exists) {
            return callback(null, result.value);
        }

        const _this = this;

        // Double-checked locking: http://en.wikipedia.org/wiki/Double-checked_locking
        lock(`fetch-memory-cache-lock-${key}`, function(releaseMemoryCacheLock) {
            async.reflect(function(callback) {
                // Try to get value from memory cache
                result = getFromMemoryCache(key);

                // Return value from memory cache if it exists
                if (result.exists) {
                    return callback(null, result.value);
                }

                // Try to get value from Redis
                getFromRedis(key, function(err, result) {
                    if (err) {
                        return callback(err);
                    }

                    // Return value from Redis if it exists
                    if (result.exists) {
                        memoryCache.put(key, result.value, random(2000, 5000));
                        return callback(null, result.value);
                    }

                    // Double-checked locking: http://en.wikipedia.org/wiki/Double-checked_locking
                    lock(`fetch-redis-lock-${key}`, function(releaseRedisLock) {
                        async.reflect(function(callback) {
                            // Try to get value from memory cache
                            result = getFromMemoryCache(key);

                            // Return value from memory cache if it exists
                            if (result.exists) {
                                return callback(null, result.value);
                            }

                            // Try to get value from Redis
                            getFromRedis(key, function(err, result) {
                                if (err) {
                                    return callback(err);
                                }

                                // Return value from Redis if it exists
                                if (result.exists) {
                                    memoryCache.put(key, result.value, random(2000, 5000));
                                    return callback(null, result.value);
                                }

                                // Execute the specified function and place the results in cache before returning the data
                                func(function(err, data) {
                                    if (err) {
                                        return callback(err);
                                    }

                                    _this.set(key, data, options, function(err) {
                                        callback(err, data);
                                    });
                                });
                            });
                        })(releaseRedisLock(function(err, result) {
                            if (result.error) {
                                return callback(result.error);
                            }

                            callback(null, result.value);
                        }));
                    });
                });
            })(releaseMemoryCacheLock(function(err, result) {
                if (result.error) {
                    return callback(result.error);
                }

                callback(null, result.value);
            }));
        });
    };

    this.fetchAndRefresh = function(key, func, options, callback) {
        options = options || {};

        if (typeof options === 'function') {
            callback = options;
            options = {};
        }

        // Default callback is a noop
        callback = callback || function() {};

        options.ttl = getTtl(options);

        const _this = this;

        if (!intervals[key]) {
            const delay = options.ttl.min / 2;

            intervals[key] = setInterval(function() {
                // This distributed lock prevents multiple clients from executing func at the same time
                _this.mutex.lock(`interval-${key}`, { ttl: delay - 100 }, function(err) {
                    if (err) {
                        return;
                    }

                    // Execute the specified function and update cache
                    func(function(err, data) {
                        if (err) {
                            return;
                        }

                        _this.set(key, data, options);
                    });
                });
            }, delay);
        }

        this.fetch(key, func, options, callback);
    };

    this.get = function(key, callback) {
        // Try to get value from memory cache
        var result = getFromMemoryCache(key);

        // Return value from memory cache if it exists
        if (result.exists) {
            return callback(null, result.value);
        }

        // Double-checked locking: http://en.wikipedia.org/wiki/Double-checked_locking
        lock(`get-memory-cache-lock-${key}`, function(releaseMemoryCacheLock) {
            async.reflect(function(callback) {
                // Try to get value from memory cache
                result = getFromMemoryCache(key);

                // Return value from memory cache if it exists
                if (result.exists) {
                    return callback(null, result.value);
                }

                getFromRedis(key, function(err, result) {
                    if (err) {
                        return callback(err);
                    }

                    if (!result.exists) {
                        return callback(null, null);
                    }

                    memoryCache.put(key, result.value, random(2000, 5000));
                    callback(null, result.value);
                });
            })(releaseMemoryCacheLock(function(err, result) {
                if (result.error) {
                    return callback(result.error);
                }

                callback(null, result.value);
            }));
        });
    };

    this.mutex = {
        lock: function(key, options, callback) {
            // Options are optional
            if (!callback && typeof options === 'function') {
                callback = options;
                options = {};
            }

            callback = callback || function() {};
            options = options || {};

            options.retry = Object.prototype.hasOwnProperty.call(options, 'retry') ? options.retry : {};
            options.retry.interval = Object.prototype.hasOwnProperty.call(options.retry, 'interval') ? options.retry.interval : 100;
            options.retry.times = Object.prototype.hasOwnProperty.call(options.retry, 'times') ? options.retry.times : 1;
            options.ttl = Object.prototype.hasOwnProperty.call(options, 'ttl') ? options.ttl : 1000;

            async.retry({ interval: options.retry.interval, times: options.retry.times }, function(callback) {
                redisClient.set(key, '1', 'NX', 'PX', options.ttl, function(err, res) {
                    if (err) {
                        return callback(err);
                    }

                    if (!res) {
                        return callback(new Error());
                    }

                    if (res !== 'OK') {
                        return callback(new Error(res));
                    }

                    callback();
                });
            }, callback);
        },
        unlock: function(key, callback) {
            callback = callback || function() {};
            redisClient.del(key, callback);
        }
    };

    this.patch = function(key, value, options, callback) {
        if (!callback) {
            callback = options;
            options = {};
        }

        const _this = this;

        this.get(key, function(err, data) {
            if (err) {
                return callback(err);
            }

            if (!data) {
                return callback(new Error(`Key ${key} does not exist`));
            }

            for (var k in value) {
                data[k] = value[k];
            }

            _this.set(key, data, options, callback);
        });
    };

    this.semaphore = {
        acquireLock: function(key, options, callback) {
            // Options are optional
            if (!callback && typeof options === 'function') {
                callback = options;
                options = {};
            }

            options = options || {};

            options.retry = Object.prototype.hasOwnProperty.call(options, 'retry') ? options.retry : {};
            options.retry.interval = Object.prototype.hasOwnProperty.call(options.retry, 'interval') ? options.retry.interval : 100;
            options.retry.times = Object.prototype.hasOwnProperty.call(options.retry, 'times') ? options.retry.times : 1;
            options.ttl = Object.prototype.hasOwnProperty.call(options, 'ttl') ? options.ttl : 1000;

            const _this = this;

            async.retry({ interval: options.retry.interval, times: options.retry.times }, function(callback) {
                // Mutex lock around semaphore
                _this.mutex.lock(`lock:${key}`, { retry: { times: 100 } }, function(err) {
                    if (err) {
                        return callback(err);
                    }

                    redisClient.get(key, function(err, data) {
                        // If we encountered an error, unlock the mutex lock and return error
                        if (err) {
                            return _this.mutex.unlock(`lock:${key}`, () => { callback(err); });
                        }

                        // If we don't have a previously created semaphore, unlock the mutex lock and return error
                        if (!data) {
                            return _this.mutex.unlock(`lock:${key}`, () => { callback(new Error(`Semaphore ${key} doesn't exist.`)); });
                        }

                        var pool = JSON.parse(data);

                        // Try to find a slot that's available.
                        var index = pool.findIndex(s => s.status === 'available');

                        if (index === -1) {
                            index = pool.findIndex(s => s.ttl <= Date.now());
                        }

                        // If we don't have a previously created semaphore, unlock the mutex lock and return error
                        if (index === -1) {
                            return _this.mutex.unlock(`lock:${key}`, () => { callback(new Error(`Semaphore ${key} doesn't have any available slots.`)); });
                        }

                        pool[index] = { status: 'acquired', ttl: Date.now() + options.ttl };

                        redisClient.set(key, JSON.stringify(pool), function(err) {
                            if (err) {
                                return _this.mutex.unlock(`lock:${key}`, () => { callback(err); });
                            }

                            _this.mutex.unlock(`lock:${key}`, () => { callback(null, index); });
                        });
                    });
                });
            }, callback);
        },
        consumeLock: function(key, index, callback) {
            callback = callback || function() {};

            const _this = this;

            // Mutex lock around semaphore
            _this.mutex.lock(`lock:${key}`, { retry: { times: 100 } }, function(err) {
                if (err) {
                    return callback(err);
                }

                redisClient.get(key, function(err, data) {
                    // If we encountered an error, unlock the mutex lock and return error
                    if (err) {
                        return _this.mutex.unlock(`lock:${key}`, () => { callback(err); });
                    }

                    // If we don't have a previously created semaphore, unlock the mutex lock and return error
                    if (!data) {
                        return _this.mutex.unlock(`lock:${key}`, () => { callback(new Error(`Semaphore ${key} doesn't exist.`)); });
                    }

                    var pool = JSON.parse(data);

                    // Ensure index exists.
                    if (pool.length <= index) {
                        return _this.mutex.unlock(`lock:${key}`, () => { callback(new Error(`Index ${index} for semaphore ${key} is invalid.`)); });
                    }

                    pool[index] = { status: 'consumed' };

                    // Ensure at least one slot isn't consumed
                    if (pool.every(s => s.status === 'consumed')) {
                        pool[index] = { status: 'available' };
                    }

                    redisClient.set(key, JSON.stringify(pool), function(err) {
                        if (err) {
                            return _this.mutex.unlock(`lock:${key}`, () => { callback(err); });
                        }

                        _this.mutex.unlock(`lock:${key}`, () => { callback(); });
                    });
                });
            });
        },
        expand: function(key, size, callback) {
            callback = callback || function() {};

            const _this = this;

            _this.mutex.lock(`lock:${key}`, { retry: { times: 100 } }, function(err) {
                if (err) {
                    return callback(err);
                }

                redisClient.get(key, function(err, data) {
                    // If we encountered an error, unlock the mutex lock and return error
                    if (err) {
                        return _this.mutex.unlock(`lock:${key}`, () => { callback(err); });
                    }

                    // If we don't have a previously created semaphore, unlock the mutex lock and return error
                    if (!data) {
                        return _this.mutex.unlock(`lock:${key}`, () => { callback(new Error(`Semaphore ${key} doesn't exist.`)); });
                    }

                    var pool = JSON.parse(data);

                    if (pool.length > size) {
                        return _this.mutex.unlock(`lock:${key}`, () => { callback(new Error(`Cannot shrink pool, size is ${pool.length} and you requested a size of ${size}.`)); });
                    }

                    if (pool.length === size) {
                        return _this.mutex.unlock(`lock:${key}`, () => callback());
                    }

                    pool = pool.concat(Array(size - pool.length).fill({ status: 'available' }));

                    redisClient.set(key, JSON.stringify(pool), function(err) {
                        if (err) {
                            return _this.mutex.unlock(`lock:${key}`, () => { callback(err); });
                        }

                        _this.mutex.unlock(`lock:${key}`, () => { callback(); });
                    });
                });
            });
        },
        releaseLock: function(key, index, callback) {
            callback = callback || function() {};

            const _this = this;

            // Mutex lock around semaphore
            _this.mutex.lock(`lock:${key}`, { retry: { times: 100 } }, function(err) {
                if (err) {
                    return callback(err);
                }

                redisClient.get(key, function(err, data) {
                    // If we encountered an error, unlock the mutex lock and return error
                    if (err) {
                        return _this.mutex.unlock(`lock:${key}`, () => { callback(err); });
                    }

                    // If we don't have a previously created semaphore, unlock the mutex lock and return error
                    if (!data) {
                        return _this.mutex.unlock(`lock:${key}`, () => { callback(new Error(`Semaphore ${key} doesn't exist.`)); });
                    }

                    var pool = JSON.parse(data);

                    // Ensure index exists.
                    if (pool.length <= index) {
                        return _this.mutex.unlock(`lock:${key}`, () => { callback(new Error(`Index ${index} for semaphore ${key} is invalid.`)); });
                    }

                    pool[index] = { status: 'available' };

                    redisClient.set(key, JSON.stringify(pool), function(err) {
                        if (err) {
                            return _this.mutex.unlock(`lock:${key}`, () => { callback(err); });
                        }

                        _this.mutex.unlock(`lock:${key}`, () => { callback(); });
                    });
                });
            });
        },
        reset: function(key, callback) {
            callback = callback || function() {};

            const _this = this;

            // Mutex lock around semaphore
            this.mutex.lock(`lock:${key}`, { retry: { times: 100 } }, function(err) {
                if (err) {
                    return callback(err);
                }

                // Try to get previously created semaphore
                redisClient.get(key, function(err, data) {
                    // If we encountered an error, unlock the mutex lock and return error
                    if (err) {
                        return _this.mutex.unlock(`lock:${key}`, () => { callback(err); });
                    }

                    // If we don't have a previously created semaphore, unlock the mutex lock and return error
                    if (!data) {
                        return _this.mutex.unlock(`lock:${key}`, () => { callback(new Error(`Semaphore ${key} doesn't exist.`)); });
                    }

                    var pool = JSON.parse(data);
                    pool = Array(pool.length).fill({ status: 'available' });

                    redisClient.set(key, JSON.stringify(pool), function(err) {
                        if (err) {
                            return _this.mutex.unlock(`lock:${key}`, () => { callback(err); });
                        }

                        _this.mutex.unlock(`lock:${key}`, () => { callback(null, pool); });
                    });
                });
            });
        },
        retrieveOrCreate: function(key, options, callback) {
            // Options are optional
            if (!callback && typeof options === 'function') {
                callback = options;
                options = {};
            }

            callback = callback || function() {};
            options = options || {};

            const _this = this;

            // Mutex lock around semaphore retrival or creation
            this.mutex.lock(`lock:${key}`, { retry: { times: 100 } }, function(err) {
                if (err) {
                    return callback(err);
                }

                // Try to get previously created semaphore
                redisClient.get(key, function(err, data) {
                    // If we encountered an error, unlock the mutex lock and return error
                    if (err) {
                        return _this.mutex.unlock(`lock:${key}`, () => { callback(err); });
                    }

                    // If we retreived a previously created semaphore, unlock the mutex lock and return
                    if (data) {
                        return _this.mutex.unlock(`lock:${key}`, () => { callback(null, JSON.parse(data)); });
                    }

                    var getSize = function(callback) {
                        if (typeof options.size === 'function') {
                            return options.size(callback);
                        }

                        callback(null, Object.prototype.hasOwnProperty.call(options, 'size') ? options.size : 1);
                    };

                    getSize(function(err, size) {
                        // If we encountered an error, unlock the mutex lock and return error
                        if (err) {
                            return _this.mutex.unlock(`lock:${key}`, () => { callback(err); });
                        }

                        var pool = Array(Math.max(size, 1)).fill({ status: 'available' });

                        redisClient.set(key, JSON.stringify(pool), function(err) {
                            if (err) {
                                return _this.mutex.unlock(`lock:${key}`, () => { callback(err); });
                            }

                            _this.mutex.unlock(`lock:${key}`, () => { callback(null, pool); });
                        });
                    });
                });
            });
        }
    };

    this.set = function(key, value, options, callback) {
        options = options || {};

        if (typeof options === 'function') {
            callback = options;
            options = {};
        }

        // Default callback is a noop
        callback = callback || function() {};

        // Store value in memory cache with a short expiration
        memoryCache.put(key, value, random(2000, 5000));

        // Get TTL based on specified options
        const ttl = getTtl(options);

        // Store value is Redis
        redisClient.psetex(key, random(ttl.min, ttl.max), PettyCache.stringify(value), callback);
    };

    // Semaphore functions need to be bound to the main PettyCache object
    for (var method in this.semaphore) {
        this.semaphore[method] = this.semaphore[method].bind(this);
    }
}

function random(min, max) {
    if (min === max) {
        return min;
    }

    return Math.floor(Math.random() * (max - min + 1) + min);
}

PettyCache.parse = function(text) {
    return JSON.parse(text, function(k, v) {
        if (v === '__NaN') {
            return NaN;
        } else if (v === '__null') {
            return null;
        } else if (v === '__undefined') {
            return undefined;
        }

        return v;
    });
};

PettyCache.stringify = function(value) {
    return JSON.stringify(value, function(k, v) {
        if (typeof v === 'number' && isNaN(v)) {
            return '__NaN';
        } else if (v === null) {
            return '__null';
        } else if (v === undefined) {
            return '__undefined';
        }

        return v;
    });
};

module.exports = PettyCache;
