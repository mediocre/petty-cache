const util = require('util');

const async = require('async');
const lock = require('lock')();
const memoryCache = require('memory-cache');
const redis = require('redis');

function PettyCache(port, host, options) {
    this.redisClient = redis.createClient(port || 6379, host || '127.0.0.1', options);

    // Mutex functions need to be bound to the main PettyCache object
    this.mutex = {};
    this.mutex.lock = (function(key, options, callback) {
        // Options are optional
        if (!options && !callback) {
            callback = () => {};
            options = {};
        } else if (!callback && typeof options === 'function') {
            callback = options;
            options = {};
        }

        options.retry = options.hasOwnProperty('retry') ? options.retry : {};
        options.retry.interval = options.retry.hasOwnProperty('interval') ? options.retry.interval : 1000;
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
    }).bind(this);
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
