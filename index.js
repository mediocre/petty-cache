const async = require('async');
const lock = require('lock')();
const memoryCache = require('memory-cache');
const redis = require('redis');

function PettyCache(port, host, options) {
    const redisClient = redis.createClient(port || 6379, host || '127.0.0.1', options);

    redisClient.on('error', err => console.warn(`Warning: Redis reported a client error: ${err}`));

    function bulkGetFromRedis(keys, callback) {
        // If there aren't any keys, return
        if (!keys.length) {
            return callback(null, {});
        }

        // Try to get values from Redis cache
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
        // Try to get value from Redis cache
        redisClient.get(key, function(err, data) {
            if (err) {
                return callback(err);
            }

            // Return if the key wasn't found in Redis cache
            if (data === null) {
                return callback(null, { exists: false });
            }

            callback(null, { exists: true, value: PettyCache.parse(data) });
        });
    }

    /**
     * @param {Array} keys - An array of keys.
     */
    this.bulkGet = function(keys, options, callback) {
        // Options are optional
        if (!callback) {
            callback = options;
        }

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

        // Try to get values from Redis cache
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

            // Add Redis command
            batch.psetex(key, options.ttl || random(30000, 60000), PettyCache.stringify(value));
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

    this.get = function(key, callback) {
        // Try to get value from memory cache
        const result = getFromMemoryCache(key);

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

            options.retry = options.hasOwnProperty('retry') ? options.retry : {};
            options.retry.interval = options.retry.hasOwnProperty('interval') ? options.retry.interval : 100;
            options.retry.times = options.retry.hasOwnProperty('times') ? options.retry.times : 1;
            options.ttl = options.hasOwnProperty('ttl') ? options.ttl : 1000;

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

            options.retry = options.hasOwnProperty('retry') ? options.retry : {};
            options.retry.interval = options.retry.hasOwnProperty('interval') ? options.retry.interval : 100;
            options.retry.times = options.retry.hasOwnProperty('times') ? options.retry.times : 1;
            options.ttl = options.hasOwnProperty('ttl') ? options.ttl : 1000;

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

                        callback(null, options.hasOwnProperty('size') ? options.size : 1);
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
        // Options are optional
        if (!callback) {
            callback = options;
            options = {};
        }

        // Store value in memory cache with a short expiration
        memoryCache.put(key, value, random(2000, 5000));

        // Store value is Redis cache
        redisClient.psetex(key, options.ttl || random(30000, 60000), PettyCache.stringify(value), callback);
    };

    // Semaphore functions need to be bound to the main PettyCache object
    for (let method in this.semaphore) {
        if (typeof this.semaphore[method] === 'function') {
            this.semaphore[method] = this.semaphore[method].bind(this);
        }
    }
}

function random(min, max) {
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

/**
 * @param {Array} keys - An array of keys.
 */
PettyCache.prototype.bulkFetch = function(keys, func, options, callback) {
    // Options are optional
    if (!callback) {
        callback = options;
    }

    // If there aren't any keys, return
    if (!keys.length) {
        return callback(null, {});
    }

    const _this = this;

    this.bulkGet(keys, function(err, values) {
        const missedKeys = Object.keys(values).filter(k => values[k] === undefined);

        // If there aren't any keys missing values, return.
        if (!missedKeys.length) {
            return callback(null, values);
        }

        func(missedKeys, function(err, data) {
            if (err) {
                return callback(err);
            }

            Object.keys(data).forEach(key => values[key] = data[key]);

            _this.bulkSet(data, err => callback(err, values));
        });
    });
};

// Returns data from cache if available;
// otherwise executes the specified function and places the results in cache before returning the data.
PettyCache.prototype.fetch = function(key, func, options, callback) {
    // Options are optional
    if (!callback) {
        callback = options;
    }

    // Try to get value from memory cache
    var value = memoryCache.get(key);

    // Return value from memory cache if it's not null (or the key exists)
    if (value) {
        return callback(null, value);
    }

    var _this = this;

    this.redisClient.get(key, function(err, data) {
        if (err) {
            return callback(err);
        }

        if (data) {
            var result = _this.parse(data);
            memoryCache.put(key, data, random(2000, 5000));
            return callback(null, result);
        }

        // Double-checked locking: http://en.wikipedia.org/wiki/Double-checked_locking
        lock(key, function(release) {
            // Try to get value from memory cache
            value = memoryCache.get(key);

            // Return value from memory cache if it's not null (or the key exists)
            if (value !== null) {
                release()();
                return callback(null, value);
            }

            _this.redisClient.get(key, function(err, data) {
                if (err) {
                    release()();
                    return callback(err);
                }

                if (data) {
                    var result = this.parse(data);
                    memoryCache.put(key, data, random(2000, 5000));

                    release()();
                    return callback(null, result);
                }

                func(function(err, data) {
                    if (err) {
                        release()();
                        return callback(err);
                    }

                    _this.set(key, data, options, release(function(err) { callback(err, data); }));
                });
            });
        });
    });
};

module.exports = PettyCache;
