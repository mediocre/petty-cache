const util = require('util');

const async = require('async');
const lock = require('lock')();
const memoryCache = require('memory-cache');
const redis = require('redis');

function PettyCache(port, host, options) {
    this.redisClient = redis.createClient(port || 6379, host || '127.0.0.1', options);

    // Mutex functions need to be bound to the main PettyCache object
    for (let method in this.mutex) {
        if (typeof this.mutex[method] === 'function') {
            this.mutex[method] = this.mutex[method].bind(this);
        }
    }

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

/**
 * @param {Array} keys - An array of keys.
 */
PettyCache.prototype.bulkFetch = function(keys, func, options, callback) {
    // Options are optional
    if (!callback) {
        callback = options;
    }

    var values = {};

    // If there aren't any keys, return
    if (!keys.length) {
        return callback(null, values);
    }

    // Try to get values from local cache
    for (var i = keys.length - 1; i >= 0; i--) {
        var value = memoryCache.get(keys[i]);

        if (value) {
            values[keys[i]] = JSON.parse(value);
            keys.splice(i, 1);
        }
    }

    // If there aren't any keys left, return
    if (!keys.length) {
        return callback(null, values);
    }

    var self = this;

    // Try to get values from remote cache
    this.redisClient.mget(keys, function(err, data) {
        if (err) {
            return callback(err);
        }

        for (var i = keys.length - 1; i >= 0; i--) {
            var value = data[i];

            if (value) {
                values[keys[i]] = JSON.parse(value);
                keys.splice(i, 1);
            }
        }

        // If there aren't any keys left, return
        if (!keys.length) {
            return callback(null, values);
        }

        func(keys, function(err, data) {
            if (err) {
                return callback(err);
            }

            async.each(Object.keys(data), function(key, callback) {
                values[key] = data[key];
                self.set(key, values[key], options, callback);
            }, function(err) {
                if (err) {
                    return callback(err);
                }

                callback(null, values);
            });
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

    // Try to get value from local memory cache
    var value = memoryCache.get(key);

    // Return value from local memory cache if it's not null (or the key exists)
    if (value) {
        return callback(null, JSON.parse(value));
    }

    var _this = this;

    this.redisClient.get(key, function(err, data) {
        if (err) {
            return callback(err);
        }

        if (data) {
            var result = JSON.parse(data);
            memoryCache.put(key, data, random(2000, 5000));
            return callback(null, result);
        }

        // Double-checked locking: http://en.wikipedia.org/wiki/Double-checked_locking
        lock(key, function(release) {
            // Try to get value from local memory cache
            value = memoryCache.get(key);

            // Return value from local memory cache if it's not null (or the key exists)
            if (value) {
                release()();
                return callback(null, JSON.parse(value));
            }

            _this.redisClient.get(key, function(err, data) {
                if (err) {
                    release()();
                    return callback(err);
                }

                if (data) {
                    var result = JSON.parse(data);
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

PettyCache.prototype.get = function(key, callback) {
    // Try to get value from local memory cache
    var value = memoryCache.get(key);

    // Return value from local memory cache if it's not null (or the key exists)
    if (value) {
        return callback(null, JSON.parse(value));
    }

    this.redisClient.get(key, function(err, data) {
        if (err || data === null) {
            return callback(err, data);
        }

        memoryCache.put(key, data, random(2000, 5000));
        callback(null, JSON.parse(data));
    });
};

PettyCache.prototype.lock = util.deprecate(function(key, options, callback) {
    // Options are optional
    if (!callback && typeof options === 'function') {
        callback = options;
    }

    var expire = (options && options.expire) ? options.expire : 1000;

    this.redisClient.set(key, '1', 'NX', 'PX', expire, function(err, res) {
        if (!err && res === 'OK' && callback) {
            callback();
        }
    });
}, 'PettyCache.lock is deprecated. Use PettyCache.mutex.lock.');

PettyCache.prototype.mutex = {
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

        const _this = this;

        async.retry({ interval: options.retry.interval, times: options.retry.times }, function(callback) {
            _this.redisClient.set(key, '1', 'NX', 'PX', options.ttl, function(err, res) {
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
        this.redisClient.del(key, callback);
    }
};

PettyCache.prototype.patch = function(key, value, options, callback) {
    var _this = this;

    if (!callback) {
        callback = options;
        options = {};
    }

    this.get(key, function(err, data) {
        if (err) {
            return callback(err);
        }

        if (!data) {
            return callback(new Error('Key ' + key + ' does not exist'));
        }

        for (var k in value) {
            data[k] = value[k];
        }

        _this.set(key, data, options, callback);
    });
};

PettyCache.prototype.semaphore = {
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
            _this.mutex.lock(`lock:${key}`, { retry: { times: 25 } }, function(err) {
                if (err) {
                    return callback(err);
                }

                _this.redisClient.get(key, function(err, data) {
                    // If we encountered an error, unlock the mutext lock and return error
                    if (err) {
                        return _this.mutex.unlock(`lock:${key}`, () => { callback(err); });
                    }

                    // If we don't have a previously created semaphore, unlock the mutext lock and return error
                    if (!data) {
                        return _this.mutex.unlock(`lock:${key}`, () => { callback(new Error(`Semaphore ${key} doesn't exist.`)); });
                    }

                    var pool = JSON.parse(data);

                    // Try to find a slot that's available.
                    var index = pool.findIndex(s => s.status === 'available');

                    if (index === -1) {
                        index = pool.findIndex(s => s.ttl <= Date.now());
                    }

                    // If we don't have a previously created semaphore, unlock the mutext lock and return error
                    if (index === -1) {
                        return _this.mutex.unlock(`lock:${key}`, () => { callback(new Error(`Semaphore ${key} doesn't have any available slots.`)); });
                    }

                    pool[index] = { status: 'acquired', ttl: Date.now() + options.ttl };

                    _this.redisClient.set(key, JSON.stringify(pool), function(err) {
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
        _this.mutex.lock(`lock:${key}`, { retry: { times: 25 } }, function(err) {
            if (err) {
                return callback(err);
            }

            _this.redisClient.get(key, function(err, data) {
                // If we encountered an error, unlock the mutext lock and return error
                if (err) {
                    return _this.mutex.unlock(`lock:${key}`, () => { callback(err); });
                }

                // If we don't have a previously created semaphore, unlock the mutext lock and return error
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

                _this.redisClient.set(key, JSON.stringify(pool), function(err) {
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
        _this.mutex.lock(`lock:${key}`, { retry: { times: 25 } }, function(err) {
            if (err) {
                return callback(err);
            }

            _this.redisClient.get(key, function(err, data) {
                // If we encountered an error, unlock the mutext lock and return error
                if (err) {
                    return _this.mutex.unlock(`lock:${key}`, () => { callback(err); });
                }

                // If we don't have a previously created semaphore, unlock the mutext lock and return error
                if (!data) {
                    return _this.mutex.unlock(`lock:${key}`, () => { callback(new Error(`Semaphore ${key} doesn't exist.`)); });
                }

                var pool = JSON.parse(data);

                // Ensure index exists.
                if (pool.length <= index) {
                    return _this.mutex.unlock(`lock:${key}`, () => { callback(new Error(`Index ${index} for semaphore ${key} is invalid.`)); });
                }

                pool[index] = { status: 'available' };

                _this.redisClient.set(key, JSON.stringify(pool), function(err) {
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
        this.mutex.lock(`lock:${key}`, { retry: { times: 25 } }, function(err) {
            if (err) {
                return callback(err);
            }

            // Try to get previously created semaphore
            _this.redisClient.get(key, function(err, data) {
                // If we encountered an error, unlock the mutext lock and return error
                if (err) {
                    return _this.mutex.unlock(`lock:${key}`, () => { callback(err); });
                }

                // If we don't have a previously created semaphore, unlock the mutext lock and return error
                if (!data) {
                    return _this.mutex.unlock(`lock:${key}`, () => { callback(new Error(`Semaphore ${key} doesn't exist.`)); });
                }

                var pool = JSON.parse(data);
                pool = Array(pool.length).fill({ status: 'available' });

                _this.redisClient.set(key, JSON.stringify(pool), function(err) {
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
        this.mutex.lock(`lock:${key}`, { retry: { times: 25 } }, function(err) {
            if (err) {
                return callback(err);
            }

            // Try to get previously created semaphore
            _this.redisClient.get(key, function(err, data) {
                // If we encountered an error, unlock the mutext lock and return error
                if (err) {
                    return _this.mutex.unlock(`lock:${key}`, () => { callback(err); });
                }

                // If we retreived a previously created semaphore, unlock the mutext lock and return
                if (data) {
                    return _this.mutex.unlock(`lock:${key}`, () => { callback(null, JSON.parse(data)); });
                }

                options.size = options.hasOwnProperty('size') ? Math.max(options.size, 1) : 1;

                var pool = Array(options.size).fill({ status: 'available' });

                _this.redisClient.set(key, JSON.stringify(pool), function(err) {
                    if (err) {
                        return _this.mutex.unlock(`lock:${key}`, () => { callback(err); });
                    }

                    _this.mutex.unlock(`lock:${key}`, () => { callback(null, pool); });
                });
            });
        });
    }
};

PettyCache.prototype.set = function(key, value, options, callback) {
    // Options are optional
    if (!callback) {
        callback = options;
        options = {};
    }

    // Store value in local cache with a short expiration
    memoryCache.put(key, JSON.stringify(value), random(2000, 5000));

    // Cache undefined as null. Prevents: ERR wrong number of arguments for 'psetex' command
    if (value === undefined) {
        value = null;
    }

    this.redisClient.psetex(key, options.expire || random(30000, 60000), JSON.stringify(value), callback);
};

module.exports = PettyCache;
