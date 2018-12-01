const assert = require('assert');

const async = require('async');
const memoryCache = require('memory-cache');
const redis = require('redis');

const PettyCache = require('../index.js');

const pettyCache = new PettyCache();
var redisClient = redis.createClient();

describe('memory-cache', function() {
    it('memoryCache.put(key, \'\')', function(done) {
        var key = Math.random().toString();

        memoryCache.put(key, '', 1000);
        assert(memoryCache.keys().includes(key));
        assert.strictEqual(memoryCache.get(key), '');

        // Wait for memory cache to expire
        setTimeout(function() {
            assert(!memoryCache.keys().includes(key));
            assert.strictEqual(memoryCache.get(key), null);
            done();
        }, 1001);
    });

    it('memoryCache.put(key, 0)', function(done) {
        var key = Math.random().toString();

        memoryCache.put(key, 0, 1000);
        assert(memoryCache.keys().includes(key));
        assert.strictEqual(memoryCache.get(key), 0);

        // Wait for memory cache to expire
        setTimeout(function() {
            assert(!memoryCache.keys().includes(key));
            assert.strictEqual(memoryCache.get(key), null);
            done();
        }, 1001);
    });

    it('memoryCache.put(key, false)', function(done) {
        var key = Math.random().toString();

        memoryCache.put(key, false, 1000);
        assert(memoryCache.keys().includes(key));
        assert.strictEqual(memoryCache.get(key), false);

        // Wait for memory cache to expire
        setTimeout(function() {
            assert(!memoryCache.keys().includes(key));
            assert.strictEqual(memoryCache.get(key), null);
            done();
        }, 1001);
    });

    it('memoryCache.put(key, NaN)', function(done) {
        var key = Math.random().toString();

        memoryCache.put(key, NaN, 1000);
        assert(memoryCache.keys().includes(key));
        assert(isNaN(memoryCache.get(key)));

        // Wait for memory cache to expire
        setTimeout(function() {
            assert(!memoryCache.keys().includes(key));
            assert.strictEqual(memoryCache.get(key), null);
            done();
        }, 1001);
    });

    it('memoryCache.put(key, null)', function(done) {
        var key = Math.random().toString();

        memoryCache.put(key, null, 1000);
        assert(memoryCache.keys().includes(key));
        assert.strictEqual(memoryCache.get(key), null);

        // Wait for memory cache to expire
        setTimeout(function() {
            assert(!memoryCache.keys().includes(key));
            assert.strictEqual(memoryCache.get(key), null);
            done();
        }, 1001);
    });

    it('memoryCache.put(key, undefined)', function(done) {
        var key = Math.random().toString();

        memoryCache.put(key, undefined, 1000);
        assert(memoryCache.keys().includes(key));
        assert.strictEqual(memoryCache.get(key), undefined);

        // Wait for memory cache to expire
        setTimeout(function() {
            assert(!memoryCache.keys().includes(key));
            assert.strictEqual(memoryCache.get(key), null);
            done();
        }, 1001);
    });
});

describe('PettyCache.bulkFetch', function() {
    it('PettyCache.bulkFetch', function(done) {
        this.timeout(7000);

        pettyCache.set('a', 1, function() {
            pettyCache.set('b', '2', function() {
                pettyCache.bulkFetch(['a', 'b', 'c', 'd'], function(keys, callback) {
                    assert(keys.length === 2);

                    callback(null, { 'c': [3], 'd': { num: 4 } });
                }, function(err, values) {
                    assert.strictEqual(values.a, 1);
                    assert.strictEqual(values.b, '2');
                    assert.strictEqual(values.c[0], 3);
                    assert.strictEqual(values.d.num, 4);

                    // Call bulkFetch again to ensure memory serialization is working as expected.
                    pettyCache.bulkFetch(['a', 'b', 'c', 'd'], function() {
                        throw 'This function should not be called';
                    }, function(err, values) {
                        assert.strictEqual(values.a, 1);
                        assert.strictEqual(values.b, '2');
                        assert.strictEqual(values.c[0], 3);
                        assert.strictEqual(values.d.num, 4);

                        // Wait for memory cache to expire
                        setTimeout(function() {
                            pettyCache.bulkFetch(['a', 'b', 'c', 'd'], function() {
                                throw 'This function should not be called';
                            }, function(err, values) {
                                assert.strictEqual(values.a, 1);
                                assert.strictEqual(values.b, '2');
                                assert.strictEqual(values.c[0], 3);
                                assert.strictEqual(values.d.num, 4);

                                // Call bulkFetch again to ensure memory serialization is working as expected.
                                pettyCache.bulkFetch(['a', 'b', 'c', 'd'], function() {
                                    throw 'This function should not be called';
                                }, function(err, values) {
                                    assert.strictEqual(values.a, 1);
                                    assert.strictEqual(values.b, '2');
                                    assert.strictEqual(values.c[0], 3);
                                    assert.strictEqual(values.d.num, 4);
                                    done();
                                });
                            });
                        }, 5001);
                    });
                });
            });
        });
    });

    it('PettyCache.bulkFetch should cache null values returned by func', function(done) {
        this.timeout(7000);

        var key1 = Math.random().toString();
        var key2 = Math.random().toString();

        pettyCache.bulkFetch([key1, key2], function(keys, callback) {
            assert.strictEqual(keys.length, 2);
            assert(keys.some(k => k === key1));
            assert(keys.some(k => k === key2));

            var values = {};

            values[key1] = '1';
            values[key2] = null;

            callback(null, values);
        }, function(err) {
            assert.ifError(err);

            pettyCache.bulkFetch([key1, key2], function() {
                throw 'This function should not be called';
            }, function(err, data) {
                assert.strictEqual(Object.keys(data).length, 2);
                assert.strictEqual(data[key1], '1');
                assert.strictEqual(data[key2], null);

                // Wait for memory cache to expire
                setTimeout(function() {
                    pettyCache.bulkFetch([key1, key2], function() {
                        throw 'This function should not be called';
                    }, function(err, data) {
                        assert.strictEqual(Object.keys(data).length, 2);
                        assert.strictEqual(data[key1], '1');
                        assert.strictEqual(data[key2], null);

                        done();
                    });
                }, 6000);
            });
        });
    });

    it('PettyCache.bulkFetch should return empty object when no keys are passed', function(done) {
        pettyCache.bulkFetch([], function() {
            throw 'This function should not be called';
        }, function(err, values) {
            assert.ifError(err);
            assert.deepEqual(values, {});
            done();
        });
    });

    it('PettyCache.bulkFetch should return error if func returns error', function(done) {
        pettyCache.bulkFetch([Math.random().toString()], function(keys, callback) {
            callback(new Error('PettyCache.bulkFetch should return error if func returns error'));
        }, function(err, values) {
            assert(err);
            assert.strictEqual(err.message, 'PettyCache.bulkFetch should return error if func returns error');
            assert(!values);
            done();
        });
    });

    it.skip('PettyCache.bulkFetch should return error from Redis', function(done) {
        this.timeout(20000);

        var key = Math.random().toString();

        redisClient.debug('SEGFAULT', function() {
            pettyCache.bulkFetch([key], function(keys, callback) {
                assert.fail('func should not have been called');
                callback();
            }, function(err) {
                assert(err);

                // Give Redis a bit to recover from SEGFAULT
                setTimeout(function() {
                    redisClient = redis.createClient();
                    redisClient.ping(done);
                }, 10000);
            });
        });
    });
});

describe('PettyCache.bulkGet', function() {
    it('PettyCache.bulkGet should return values', function(done) {
        this.timeout(6000);

        var key1 = Math.random().toString();
        var key2 = Math.random().toString();
        var key3 = Math.random().toString();

        pettyCache.set(key1, '1', function() {
            pettyCache.set(key2, '2', function() {
                pettyCache.set(key3, '3', function() {
                    pettyCache.bulkGet([key1, key2, key3], function(err, values) {
                        assert.strictEqual(Object.keys(values).length, 3);
                        assert.strictEqual(values[key1], '1');
                        assert.strictEqual(values[key2], '2');
                        assert.strictEqual(values[key3], '3');

                        // Call bulkGet again while values are still in memory cache
                        pettyCache.bulkGet([key1, key2, key3], function(err, values) {
                            assert.strictEqual(Object.keys(values).length, 3);
                            assert.strictEqual(values[key1], '1');
                            assert.strictEqual(values[key2], '2');
                            assert.strictEqual(values[key3], '3');

                            // Wait for memory cache to expire
                            setTimeout(function() {
                                // Ensure keys are still in Redis
                                pettyCache.bulkGet([key1, key2, key3], function(err, values) {
                                    assert.strictEqual(Object.keys(values).length, 3);
                                    assert.strictEqual(values[key1], '1');
                                    assert.strictEqual(values[key2], '2');
                                    assert.strictEqual(values[key3], '3');
                                    done();
                                });
                            }, 5001);
                        });
                    });
                });
            });
        });
    });

    it('PettyCache.bulkGet should return null for missing keys', function(done) {
        this.timeout(6000);

        var key1 = Math.random().toString();
        var key2 = Math.random().toString();
        var key3 = Math.random().toString();

        pettyCache.set(key1, '1', function() {
            pettyCache.set(key2, '2', function() {
                pettyCache.bulkGet([key1, key2, key3], function(err, values) {
                    assert.strictEqual(Object.keys(values).length, 3);
                    assert.strictEqual(values[key1], '1');
                    assert.strictEqual(values[key2], '2');
                    assert.strictEqual(values[key3], null);

                    // Call bulkGet again while values are still in memory cache
                    pettyCache.bulkGet([key1, key2, key3], function(err, values) {
                        assert.strictEqual(Object.keys(values).length, 3);
                        assert.strictEqual(values[key1], '1');
                        assert.strictEqual(values[key2], '2');
                        assert.strictEqual(values[key3], null);

                        // Wait for memory cache to expire
                        setTimeout(function() {
                            // Ensure keys are still in Redis
                            pettyCache.bulkGet([key1, key2, key3], function(err, values) {
                                assert.strictEqual(Object.keys(values).length, 3);
                                assert.strictEqual(values[key1], '1');
                                assert.strictEqual(values[key2], '2');
                                assert.strictEqual(values[key3], null);
                                done();
                            });
                        }, 5001);
                    });
                });
            });
        });
    });

    it('PettyCache.bulkGet should correctly handle falsy values', function(done) {
        this.timeout(12000);

        var key1 = Math.random().toString();
        var key2 = Math.random().toString();
        var key3 = Math.random().toString();
        var key4 = Math.random().toString();
        var key5 = Math.random().toString();
        var key6 = Math.random().toString();
        var values = {};

        values[key1] = '';
        values[key2] = 0;
        values[key3] = false;
        values[key4] = NaN;
        values[key5] = null;
        values[key6] = undefined;

        async.each(Object.keys(values), function(key, callback) {
            pettyCache.set(key, values[key], { ttl: 6000 }, callback);
        }, function(err) {
            assert.ifError(err);

            var keys = Object.keys(values);

            // Add an additional key to check handling of missing keys
            var key7 = Math.random().toString();
            keys.push(key7);

            pettyCache.bulkGet(keys, function(err, data) {
                assert.ifError(err);
                assert.strictEqual(keys.length, 7);
                assert.strictEqual(Object.keys(data).length, 7);
                assert.strictEqual(data[key1], '');
                assert.strictEqual(data[key2], 0);
                assert.strictEqual(data[key3], false);
                assert.strictEqual(typeof data[key4], 'number');
                assert(isNaN(data[key4]));
                assert.strictEqual(data[key5], null);
                assert.strictEqual(data[key6], undefined);
                assert.strictEqual(data[key7], null);

                // Wait for memory cache to expire
                setTimeout(function() {
                    // Ensure keys are still in Redis
                    pettyCache.bulkGet(keys, function(err, data) {
                        assert.ifError(err);
                        assert.strictEqual(Object.keys(data).length, 7);
                        assert.strictEqual(data[key1], '');
                        assert.strictEqual(data[key2], 0);
                        assert.strictEqual(data[key3], false);
                        assert.strictEqual(typeof data[key4], 'number');
                        assert(isNaN(data[key4]));
                        assert.strictEqual(data[key5], null);
                        assert.strictEqual(data[key6], undefined);
                        assert.strictEqual(data[key7], null);

                        // Wait for Redis cache to expire
                        setTimeout(function() {
                            // Ensure keys are not in Redis
                            pettyCache.bulkGet(keys, function(err, data) {
                                assert.ifError(err);
                                assert.strictEqual(Object.keys(data).length, 7);
                                assert.strictEqual(data[key1], null);
                                assert.strictEqual(data[key2], null);
                                assert.strictEqual(data[key3], null);
                                assert.strictEqual(data[key4], null);
                                assert.strictEqual(data[key5], null);
                                assert.strictEqual(data[key6], null);
                                assert.strictEqual(data[key7], null);
                                done();
                            });
                        }, 6001);
                    });
                }, 5001);
            });
        });
    });

    it('PettyCache.bulkGet should return empty object when no keys are passed', function(done) {
        pettyCache.bulkGet([], function(err, values) {
            assert.ifError(err);
            assert.deepEqual(values, {});
            done();
        });
    });

    it.skip('PettyCache.bulkGet should return error from Redis', function(done) {
        this.timeout(20000);

        var key = Math.random().toString();

        redisClient.debug('SEGFAULT', function() {
            pettyCache.bulkGet([key], function(err) {
                assert(err);

                // Give Redis a bit to recover from SEGFAULT
                setTimeout(function() {
                    redisClient = redis.createClient();
                    redisClient.ping(done);
                }, 10000);
            });
        });
    });
});

describe('PettyCache.bulkSet', function() {
    it('PettyCache.bulkSet should set values', function(done) {
        this.timeout(6000);

        var key1 = Math.random().toString();
        var key2 = Math.random().toString();
        var key3 = Math.random().toString();
        var values = {};

        values[key1] = '1';
        values[key2] = 2;
        values[key3] = '3';

        pettyCache.bulkSet(values, function(err) {
            assert.ifError(err);

            pettyCache.get(key1, function(err, value) {
                assert.ifError(err);
                assert.strictEqual(value, '1');

                pettyCache.get(key2, function(err, value) {
                    assert.ifError(err);
                    assert.strictEqual(value, 2);

                    pettyCache.get(key3, function(err, value) {
                        assert.ifError(err);
                        assert.strictEqual(value, '3');

                        // Wait for memory cache to expire
                        setTimeout(function() {
                            pettyCache.get(key1, function(err, value) {
                                assert.ifError(err);
                                assert.strictEqual(value, '1');

                                pettyCache.get(key2, function(err, value) {
                                    assert.ifError(err);
                                    assert.strictEqual(value, 2);

                                    pettyCache.get(key3, function(err, value) {
                                        assert.ifError(err);
                                        assert.strictEqual(value, '3');
                                        done();
                                    });
                                });
                            });
                        }, 5001);
                    });
                });
            });
        });
    });

    it('PettyCache.bulkSet should set values with the specified TTL option', function(done) {
        this.timeout(7000);

        var key1 = Math.random().toString();
        var key2 = Math.random().toString();
        var key3 = Math.random().toString();
        var values = {};

        values[key1] = '1';
        values[key2] = 2;
        values[key3] = '3';

        pettyCache.bulkSet(values, { ttl: 6000 }, function(err) {
            assert.ifError(err);

            pettyCache.get(key1, function(err, value) {
                assert.ifError(err);
                assert.strictEqual(value, '1');

                pettyCache.get(key2, function(err, value) {
                    assert.ifError(err);
                    assert.strictEqual(value, 2);

                    pettyCache.get(key3, function(err, value) {
                        assert.ifError(err);
                        assert.strictEqual(value, '3');

                        // Wait for Redis cache to expire
                        setTimeout(function() {
                            pettyCache.get(key1, function(err, value) {
                                assert.ifError(err);
                                assert.strictEqual(value, null);

                                pettyCache.get(key2, function(err, value) {
                                    assert.ifError(err);
                                    assert.strictEqual(value, null);

                                    pettyCache.get(key3, function(err, value) {
                                        assert.ifError(err);
                                        assert.strictEqual(value, null);
                                        done();
                                    });
                                });
                            });
                        }, 6001);
                    });
                });
            });
        });
    });

    it('PettyCache.bulkSet should set values with the specified TTL option using max and min', function(done) {
        this.timeout(10000);

        var key1 = Math.random().toString();
        var key2 = Math.random().toString();
        var key3 = Math.random().toString();
        var values = {};

        values[key1] = '1';
        values[key2] = 2;
        values[key3] = '3';

        pettyCache.bulkSet(values, { ttl: { max: 7000, min: 6000 } }, function(err) {
            assert.ifError(err);

            pettyCache.get(key1, function(err, value) {
                assert.ifError(err);
                assert.strictEqual(value, '1');

                pettyCache.get(key2, function(err, value) {
                    assert.ifError(err);
                    assert.strictEqual(value, 2);

                    pettyCache.get(key3, function(err, value) {
                        assert.ifError(err);
                        assert.strictEqual(value, '3');

                        // Wait for Redis cache to expire
                        setTimeout(function() {
                            pettyCache.get(key1, function(err, value) {
                                assert.ifError(err);
                                assert.strictEqual(value, null);

                                pettyCache.get(key2, function(err, value) {
                                    assert.ifError(err);
                                    assert.strictEqual(value, null);

                                    pettyCache.get(key3, function(err, value) {
                                        assert.ifError(err);
                                        assert.strictEqual(value, null);
                                        done();
                                    });
                                });
                            });
                        }, 7001);
                    });
                });
            });
        });
    });

    it('PettyCache.bulkSet should set values with the specified TTL option using max only', function(done) {
        this.timeout(10000);

        var key1 = Math.random().toString();
        var key2 = Math.random().toString();
        var key3 = Math.random().toString();
        var values = {};

        values[key1] = '1';
        values[key2] = 2;
        values[key3] = '3';

        pettyCache.bulkSet(values, { ttl: { max: 10000 } }, function(err) {
            assert.ifError(err);

            pettyCache.get(key1, function(err, value) {
                assert.ifError(err);
                assert.strictEqual(value, '1');

                done();
            });
        });
    });

    it('PettyCache.bulkSet should set values with the specified TTL option using min only', function(done) {
        this.timeout(10000);

        var key1 = Math.random().toString();
        var key2 = Math.random().toString();
        var key3 = Math.random().toString();
        var values = {};

        values[key1] = '1';
        values[key2] = 2;
        values[key3] = '3';

        pettyCache.bulkSet(values, { ttl: { min: 6000 } }, function(err) {
            assert.ifError(err);

            pettyCache.get(key1, function(err, value) {
                assert.ifError(err);
                assert.strictEqual(value, '1');

                done();
            });
        });
    });
});

describe('PettyCache.del', function() {
    it('PettyCache.del', function(done) {
        var key = Math.random().toString();

        pettyCache.set(key, key.split('').reverse().join(''), function(err) {
            assert.ifError(err);

            pettyCache.get(key, function(err, value) {
                assert.strictEqual(value, key.split('').reverse().join(''));

                pettyCache.del(key, function(err) {
                    assert.ifError(err);

                    pettyCache.get(key, function(err, value) {
                        assert.ifError(err);
                        assert.strictEqual(value, null);

                        pettyCache.del(key, function(err) {
                            assert.ifError(err);
                            done();
                        });
                    });
                });
            });
        });
    });

    it.skip('PettyCache.del should return error from Redis', function(done) {
        this.timeout(20000);

        var key = Math.random().toString();

        redisClient.debug('SEGFAULT', function() {
            pettyCache.del(key, function(err) {
                assert(err);

                // Give Redis a bit to recover from SEGFAULT
                setTimeout(function() {
                    redisClient = redis.createClient();
                    redisClient.ping(done);
                }, 10000);
            });
        });
    });
});

describe('PettyCache.fetch', function() {
    it('PettyCache.fetch', function(done) {
        this.timeout(7000);

        var key = Math.random().toString();

        pettyCache.fetch(key, function(callback) {
            return callback(null, { foo: 'bar' });
        }, function() {
            pettyCache.fetch(key, function() {
                throw 'This function should not be called';
            }, function(err, data) {
                assert.equal(data.foo, 'bar');

                // Wait for memory cache to expire
                setTimeout(function() {
                    pettyCache.fetch(key, function() {
                        throw 'This function should not be called';
                    }, function(err, data) {
                        assert.strictEqual(data.foo, 'bar');
                        done();
                    });
                }, 6000);
            });
        });
    });

    it('PettyCache.fetch should cache null values returned by func', function(done) {
        this.timeout(7000);

        var key = Math.random().toString();

        pettyCache.fetch(key, function(callback) {
            return callback(null, null);
        }, function() {
            pettyCache.fetch(key, function() {
                throw 'This function should not be called';
            }, function(err, data) {
                assert.strictEqual(data, null);

                // Wait for memory cache to expire
                setTimeout(function() {
                    pettyCache.fetch(key, function() {
                        throw 'This function should not be called';
                    }, function(err, data) {
                        assert.strictEqual(data, null);
                        done();
                    });
                }, 6000);
            });
        });
    });

    it('PettyCache.fetch should cache undefined values returned by func', function(done) {
        this.timeout(7000);

        var key = Math.random().toString();

        pettyCache.fetch(key, function(callback) {
            return callback(null, undefined);
        }, function() {
            pettyCache.fetch(key, function() {
                throw 'This function should not be called';
            }, function(err, data) {
                assert.strictEqual(data, undefined);

                // Wait for memory cache to expire
                setTimeout(function() {
                    pettyCache.fetch(key, function() {
                        throw 'This function should not be called';
                    }, function(err, data) {
                        assert.strictEqual(data, undefined);
                        done();
                    });
                }, 6000);
            });
        });
    });

    it('PettyCache.fetch should lock around func', function(done) {
        var key = Math.random().toString();
        var numberOfFuncCalls = 0;

        var func = function(callback) {
            setTimeout(function() {
                callback(null, ++numberOfFuncCalls);
            }, 100);
        };

        pettyCache.fetch(key, func, function() {});
        pettyCache.fetch(key, func, function() {});
        pettyCache.fetch(key, func, function() {});
        pettyCache.fetch(key, func, function() {});
        pettyCache.fetch(key, func, function() {});
        pettyCache.fetch(key, func, function() {});
        pettyCache.fetch(key, func, function() {});
        pettyCache.fetch(key, func, function() {});
        pettyCache.fetch(key, func, function() {});

        pettyCache.fetch(key, func, function(err, data) {
            assert.equal(data, 1);
            done();
        });
    });

    it('PettyCache.fetch should run func again after TTL', function(done) {
        this.timeout(7000);

        var key = Math.random().toString();
        var numberOfFuncCalls = 0;

        var func = function(callback) {
            setTimeout(function() {
                callback(null, ++numberOfFuncCalls);
            }, 100);
        };

        pettyCache.fetch(key, func, { ttl: 6000 }, function() {});

        pettyCache.fetch(key, func, { ttl: 6000 }, function(err, data) {
            assert.equal(data, 1);

            setTimeout(function() {
                pettyCache.fetch(key, func, { ttl: 6000 }, function(err, data) {
                    assert.equal(data, 2);

                    pettyCache.fetch(key, func, { ttl: 6000 }, function(err, data) {
                        assert.equal(data, 2);
                        done();
                    });
                });
            }, 6001);
        });
    });

    it('PettyCache.fetch should lock around Redis', function(done) {
        redisClient.info('commandstats', function(err, info) {
            var lineBefore = info.split('\n').find(i => i.startsWith('cmdstat_get:'));
            var tokenBefore = lineBefore.split(/:|,/).find(i => i.startsWith('calls='));
            var callsBefore = parseInt(tokenBefore.split('=')[1]);

            var key = Math.random().toString();
            var numberOfFuncCalls = 0;

            var func = function(callback) {
                setTimeout(function() {
                    callback(null, ++numberOfFuncCalls);
                }, 100);
            };

            pettyCache.fetch(key, func);
            pettyCache.fetch(key, func);
            pettyCache.fetch(key, func);
            pettyCache.fetch(key, func);
            pettyCache.fetch(key, func);
            pettyCache.fetch(key, func);
            pettyCache.fetch(key, func);
            pettyCache.fetch(key, func);
            pettyCache.fetch(key, func);

            pettyCache.fetch(key, func, function(err, data) {
                assert.equal(data, 1);

                redisClient.info('commandstats', function(err, info) {
                    var lineAfter = info.split('\n').find(i => i.startsWith('cmdstat_get:'));
                    var tokenAfter = lineAfter.split(/:|,/).find(i => i.startsWith('calls='));
                    var callsAfter = parseInt(tokenAfter.split('=')[1]);

                    assert.strictEqual(callsBefore + 2, callsAfter);

                    done();
                });
            });
        });
    });

    it('PettyCache.fetch should return error if func returns error', function(done) {
        pettyCache.fetch(Math.random().toString(), function(callback) {
            callback(new Error('PettyCache.fetch should return error if func returns error'));
        }, function(err, values) {
            assert(err);
            assert.strictEqual(err.message, 'PettyCache.fetch should return error if func returns error');
            assert(!values);
            done();
        });
    });

    it.skip('PettyCache.fetch should return error from Redis', function(done) {
        this.timeout(20000);

        var key = Math.random().toString();

        redisClient.debug('SEGFAULT', function() {
            pettyCache.fetch(key, function(callback) {
                assert.fail('func should not have been called');
                callback();
            }, function(err) {
                assert(err);

                // Give Redis a bit to recover from SEGFAULT
                setTimeout(function() {
                    redisClient = redis.createClient();
                    redisClient.ping(done);
                }, 10000);
            });
        });
    });
});

describe('PettyCache.fetchAndRefresh', function() {
    it('PettyCache.fetchAndRefresh', function(done) {
        this.timeout(7000);

        var key = Math.random().toString();

        pettyCache.fetchAndRefresh(key, function(callback) {
            return callback(null, { foo: 'bar' });
        }, function() {
            pettyCache.fetchAndRefresh(key, function() {
                throw 'This function should not be called';
            }, function(err, data) {
                assert.equal(data.foo, 'bar');

                // Wait for memory cache to expire
                setTimeout(function() {
                    pettyCache.fetchAndRefresh(key, function() {
                        throw 'This function should not be called';
                    }, function(err, data) {
                        assert.strictEqual(data.foo, 'bar');
                        done();
                    });
                }, 6000);
            });
        });
    });

    it('PettyCache.fetchAndRefresh should run func again to refresh', function(done) {
        this.timeout(7000);

        var key = Math.random().toString();
        var numberOfFuncCalls = 0;

        var func = function(callback) {
            setTimeout(function() {
                ++numberOfFuncCalls;
                callback(null, numberOfFuncCalls);
            }, 100);
        };

        pettyCache.fetchAndRefresh(key, func, { ttl: 6000 });

        pettyCache.fetchAndRefresh(key, func, { ttl: 6000 }, function(err, data) {
            assert.equal(data, 1);

            setTimeout(function() {
                pettyCache.fetchAndRefresh(key, func, { ttl: 6000 }, function(err, data) {
                    assert.equal(data, 2);

                    pettyCache.fetchAndRefresh(key, func, { ttl: 6000 }, function(err, data) {
                        assert.equal(data, 2);
                        done();
                    });
                });
            }, 4001);
        });
    });
});

describe('PettyCache.get', function() {
    it('PettyCache.get should return value', function(done) {
        this.timeout(7000);

        var key = Math.random().toString();

        pettyCache.set(key, 'hello world', function() {
            pettyCache.get(key, function(err, value) {
                assert.equal(value, 'hello world');

                // Wait for memory cache to expire
                setTimeout(function() {
                    pettyCache.get(key, function(err, value) {
                        assert.equal(value, 'hello world');
                        done();
                    });
                }, 6000);
            });
        });
    });

    it('PettyCache.get should return null for missing keys', function(done) {
        var key = Math.random().toString();

        pettyCache.get(key, function(err, value) {
            assert.strictEqual(value, null);

            pettyCache.get(key, function(err, value) {
                assert.strictEqual(value, null);
                done();
            });
        });
    });

    it.skip('PettyCache.get should return error from Redis', function(done) {
        this.timeout(20000);

        var key = Math.random().toString();

        redisClient.debug('SEGFAULT', function() {
            pettyCache.get(key, function(err) {
                assert(err);

                // Give Redis a bit to recover from SEGFAULT
                setTimeout(function() {
                    redisClient = redis.createClient();
                    redisClient.ping(done);
                }, 10000);
            });
        });
    });
});

describe('PettyCache.mutex', function() {
    describe('PettyCache.mutex.lock', function() {
        it('PettyCache.mutex.lock should lock for 1 second by default', function(done) {
            var key = Math.random().toString();

            pettyCache.mutex.lock(key);

            pettyCache.mutex.lock(key, (err) => {
                assert(err);
            });

            setTimeout(function() {
                pettyCache.mutex.lock(key, (err) => {
                    assert.ifError(err);
                    done();
                });
            }, 1001);
        });

        it('PettyCache.mutex.lock should lock for 2 seconds when ttl parameter is specified', function(done) {
            this.timeout(3000);

            var key = Math.random().toString();

            pettyCache.mutex.lock(key, { ttl: 2000 });

            pettyCache.mutex.lock(key, (err) => {
                assert(err);
            });

            setTimeout(function() {
                pettyCache.mutex.lock(key, (err) => {
                    assert(err);
                });
            }, 1001);

            setTimeout(function() {
                pettyCache.mutex.lock(key, (err) => {
                    assert.ifError(err);
                    done();
                });
            }, 2001);
        });

        it('PettyCache.mutex.lock should acquire a lock after retries', function(done) {
            this.timeout(3000);

            var key = Math.random().toString();

            pettyCache.mutex.lock(key, { ttl: 2000 });

            pettyCache.mutex.lock(key, (err) => {
                assert(err);
            });

            pettyCache.mutex.lock(key, { retry: { interval: 500, times: 10 } }, (err) => {
                assert.ifError(err);
                done();
            });
        });
    });

    describe('PettyCache.mutex.unlock', function() {
        it('PettyCache.mutex.unlock should unlock', function(done) {
            var key = Math.random().toString();

            pettyCache.mutex.lock(key, { ttl: 10000 }, function(err) {
                assert.ifError(err);

                pettyCache.mutex.lock(key, (err) => {
                    assert(err);

                    pettyCache.mutex.unlock(key, () => {
                        pettyCache.mutex.lock(key, function(err) {
                            assert.ifError(err);
                            done();
                        });
                    });
                });
            });
        });

        it('PettyCache.mutex.unlock should work without a callback', function(done) {
            var key = Math.random().toString();

            pettyCache.mutex.lock(key, { ttl: 10000 }, function(err) {
                assert.ifError(err);

                pettyCache.mutex.unlock(key);
                done();
            });
        });
    });
});

describe('PettyCache.patch', function() {
    var key = Math.random().toString();

    before(function(done) {
        pettyCache.set(key, { a: 1, b: 2, c: 3 }, done);
    });

    it('PettyCache.patch should fail if the key does not exist', function(done) {
        pettyCache.patch('xyz', { b: 3 }, function(err) {
            assert(err, 'No error provided');
            done();
        });
    });

    it('PettyCache.patch should update the values of given object keys', function(done) {
        pettyCache.patch(key, { b: 4, c: 5 }, function(err) {
            assert(!err, 'Error: ' + err);

            pettyCache.get(key, function(err, data) {
                assert(!err, 'Error: ' + err);
                assert.deepEqual(data, { a: 1, b: 4, c: 5 });
                done();
            });
        });
    });

    it('PettyCache.patch should update the values of given object keys with options', function(done) {
        pettyCache.patch(key, { b: 5, c: 6 }, { ttl: 10000 }, function(err) {
            assert(!err, 'Error: ' + err);

            pettyCache.get(key, function(err, data) {
                assert(!err, 'Error: ' + err);
                assert.deepEqual(data, { a: 1, b: 5, c: 6 });
                done();
            });
        });
    });

    it.skip('PettyCache.patch should return error from Redis', function(done) {
        this.timeout(20000);

        var key = Math.random().toString();

        redisClient.debug('SEGFAULT', function() {
            pettyCache.patch(key, { b: 6, c: 7 }, function(err) {
                assert(err);

                // Give Redis a bit to recover from SEGFAULT
                setTimeout(function() {
                    redisClient = redis.createClient();
                    redisClient.ping(done);
                }, 10000);
            });
        });
    });
});

describe('PettyCache.semaphore', function() {
    describe('PettyCache.semaphore.acquireLock', function() {
        it('should aquire a lock', function(done) {
            var key = Math.random().toString();

            pettyCache.semaphore.retrieveOrCreate(key, { size: 10 }, function(err) {
                assert.ifError(err);

                pettyCache.semaphore.acquireLock(key, function(err, index) {
                    assert.ifError(err);
                    assert.equal(index, 0);

                    pettyCache.semaphore.acquireLock(key, function(err, index) {
                        assert.ifError(err);
                        assert.equal(index, 1);
                        done();
                    });
                });
            });
        });

        it('should not aquire a lock', function(done) {
            var key = Math.random().toString();

            pettyCache.semaphore.retrieveOrCreate(key, function(err) {
                assert.ifError(err);

                pettyCache.semaphore.acquireLock(key, function(err, index) {
                    assert.ifError(err);
                    assert.equal(index, 0);

                    pettyCache.semaphore.acquireLock(key, function(err) {
                        assert(err);
                        done();
                    });
                });
            });
        });

        it('should aquire a lock after ttl', function(done) {
            var key = Math.random().toString();

            pettyCache.semaphore.retrieveOrCreate(key, function(err) {
                assert.ifError(err);

                pettyCache.semaphore.acquireLock(key, function(err, index) {
                    assert.ifError(err);
                    assert.equal(index, 0);

                    pettyCache.semaphore.acquireLock(key, function(err) {
                        assert(err);

                        setTimeout(function() {
                            pettyCache.semaphore.acquireLock(key, function(err, index) {
                                assert.ifError(err);
                                assert.equal(index, 0);
                                done();
                            });
                        }, 1001);
                    });
                });
            });
        });

        it('should aquire a lock with specified options', function(done) {
            this.timeout(5000);

            var key = Math.random().toString();

            pettyCache.semaphore.retrieveOrCreate(key, { size: 10 }, function(err) {
                assert.ifError(err);

                // callback is optional
                pettyCache.semaphore.acquireLock(key);

                setTimeout(function() {
                    pettyCache.semaphore.acquireLock(key, { retry: { interval: 500, times: 10 }, ttl: 500 }, function(err, index) {
                        assert.ifError(err);
                        assert.equal(index, 1);
                        done();
                    });
                }, 1000);
            });
        });

        it('should fail if the semaphore does not exist', function(done) {
            var key = Math.random().toString();

            pettyCache.semaphore.acquireLock(key, 0, function(err) {
                assert(err);
                assert.strictEqual(err.message, `Semaphore ${key} doesn't exist.`);
                done();
            });
        });
    });

    describe('PettyCache.semaphore.consumeLock', function() {
        it('should consume a lock', function(done) {
            var key = Math.random().toString();

            pettyCache.semaphore.retrieveOrCreate(key, { size: 2 }, function(err) {
                assert.ifError(err);

                pettyCache.semaphore.acquireLock(key, function(err, index) {
                    assert.ifError(err);
                    assert.equal(index, 0);

                    pettyCache.semaphore.acquireLock(key, function(err, index) {
                        assert.ifError(err);
                        assert.equal(index, 1);

                        pettyCache.semaphore.acquireLock(key, function(err) {
                            assert(err);

                            pettyCache.semaphore.consumeLock(key, 0, function(err) {
                                assert.ifError(err);

                                pettyCache.semaphore.acquireLock(key, function(err) {
                                    assert(err);
                                    done();
                                });
                            });
                        });
                    });
                });
            });
        });

        it('should ensure at least one lock is not consumed', function(done) {
            var key = Math.random().toString();

            pettyCache.semaphore.retrieveOrCreate(key, { size: 2 }, function(err) {
                assert.ifError(err);

                pettyCache.semaphore.acquireLock(key, function(err, index) {
                    assert.ifError(err);
                    assert.equal(index, 0);

                    pettyCache.semaphore.acquireLock(key, function(err, index) {
                        assert.ifError(err);
                        assert.equal(index, 1);

                        pettyCache.semaphore.acquireLock(key, function(err) {
                            assert(err);

                            pettyCache.semaphore.consumeLock(key, 0, function(err) {
                                assert.ifError(err);

                                pettyCache.semaphore.consumeLock(key, 1, function(err) {
                                    assert.ifError(err);

                                    pettyCache.semaphore.acquireLock(key, function(err) {
                                        assert.ifError(err);
                                        assert.equal(index, 1);
                                        done();
                                    });
                                });
                            });
                        });
                    });
                });
            });
        });

        it('should fail if the semaphore does not exist', function(done) {
            var key = Math.random().toString();

            pettyCache.semaphore.consumeLock(key, 0, function(err) {
                assert(err);
                assert.strictEqual(err.message, `Semaphore ${key} doesn't exist.`);
                done();
            });
        });

        it('should fail if index is larger than semaphore', function(done) {
            var key = Math.random().toString();

            pettyCache.semaphore.retrieveOrCreate(key, { size: 2 }, function(err) {
                assert.ifError(err);

                pettyCache.semaphore.acquireLock(key, function(err, index) {
                    assert.ifError(err);
                    assert.equal(index, 0);

                    pettyCache.semaphore.consumeLock(key, 10, function(err) {
                        assert(err);
                        assert.strictEqual(err.message, `Index 10 for semaphore ${key} is invalid.`);
                        done();
                    });
                });
            });
        });

        it('callback is optional', function(done) {
            var key = Math.random().toString();

            pettyCache.semaphore.retrieveOrCreate(key, { size: 2 }, function(err) {
                assert.ifError(err);

                pettyCache.semaphore.acquireLock(key, function(err, index) {
                    assert.ifError(err);
                    assert.equal(index, 0);

                    pettyCache.semaphore.acquireLock(key, function(err, index) {
                        assert.ifError(err);
                        assert.equal(index, 1);

                        pettyCache.semaphore.acquireLock(key, function(err) {
                            assert(err);

                            pettyCache.semaphore.consumeLock(key, 0);

                            pettyCache.semaphore.acquireLock(key, function(err) {
                                assert(err);
                                done();
                            });
                        });
                    });
                });
            });
        });
    });

    describe('PettyCache.semaphore.expand', function() {
        it('should increase the size of a semaphore pool', function(done) {
            var key = Math.random().toString();

            pettyCache.semaphore.retrieveOrCreate(key, { size: 2 }, function(err, pool) {
                assert.ifError(err);
                assert.strictEqual(pool.length, 2);

                pettyCache.semaphore.expand(key, 3, function(err) {
                    assert.ifError(err);

                    pettyCache.semaphore.retrieveOrCreate(key, { size: 2 }, function(err, pool) {
                        assert.ifError(err);
                        assert.strictEqual(pool.length, 3);
                        done();
                    });
                });
            });
        });

        it('should refuse to shrink a pool', function(done) {
            var key = Math.random().toString();

            pettyCache.semaphore.retrieveOrCreate(key, { size: 2 }, function(err, pool) {
                assert.ifError(err);
                assert.strictEqual(pool.length, 2);

                pettyCache.semaphore.expand(key, 1, function(err) {
                    assert(err);
                    assert.strictEqual(err.message, 'Cannot shrink pool, size is 2 and you requested a size of 1.');
                    done();
                });
            });
        });

        it('should succeed if pool size is already equal to the specified size', function(done) {
            var key = Math.random().toString();

            pettyCache.semaphore.retrieveOrCreate(key, { size: 2 }, function(err, pool) {
                assert.ifError(err);
                assert.strictEqual(pool.length, 2);

                pettyCache.semaphore.expand(key, 2, function(err) {
                    assert.ifError(err);

                    pettyCache.semaphore.retrieveOrCreate(key, { size: 2 }, function(err, pool) {
                        assert.ifError(err);
                        assert.strictEqual(pool.length, 2);
                        done();
                    });
                });
            });
        });

        it('callback is optional', function(done) {
            var key = Math.random().toString();

            pettyCache.semaphore.retrieveOrCreate(key, { size: 2 }, function(err, pool) {
                assert.ifError(err);
                assert.strictEqual(pool.length, 2);

                pettyCache.semaphore.expand(key, 3);

                pettyCache.semaphore.retrieveOrCreate(key, { size: 2 }, function(err, pool) {
                    assert.ifError(err);
                    assert.strictEqual(pool.length, 3);
                    done();
                });
            });
        });

        it('should fail if the semaphore does not exist', function(done) {
            var key = Math.random().toString();

            pettyCache.semaphore.expand(key, 10, function(err) {
                assert(err);
                assert.strictEqual(err.message, `Semaphore ${key} doesn't exist.`);
                done();
            });
        });
    });

    describe('PettyCache.semaphore.releaseLock', function() {
        it('should release a lock', function(done) {
            var key = Math.random().toString();

            pettyCache.semaphore.retrieveOrCreate(key, function(err) {
                assert.ifError(err);

                pettyCache.semaphore.acquireLock(key, function(err, index) {
                    assert.ifError(err);
                    assert.equal(index, 0);

                    pettyCache.semaphore.acquireLock(key, function(err) {
                        assert(err);

                        pettyCache.semaphore.releaseLock(key, 0, function(err) {
                            assert.ifError(err);

                            pettyCache.semaphore.acquireLock(key, function(err, index) {
                                assert.ifError(err);
                                assert.equal(index, 0);
                                done();
                            });
                        });
                    });
                });
            });
        });

        it('should fail to release a lock outside of the semaphore size', function(done) {
            var key = Math.random().toString();

            pettyCache.semaphore.retrieveOrCreate(key, function(err) {
                assert.ifError(err);

                pettyCache.semaphore.acquireLock(key, function(err, index) {
                    assert.ifError(err);
                    assert.equal(index, 0);

                    pettyCache.semaphore.releaseLock(key, 10, function(err) {
                        assert(err);
                        assert.strictEqual(err.message, `Index 10 for semaphore ${key} is invalid.`);
                        done();
                    });
                });
            });
        });

        it('callback is optional', function(done) {
            var key = Math.random().toString();

            pettyCache.semaphore.retrieveOrCreate(key, function(err) {
                assert.ifError(err);

                pettyCache.semaphore.acquireLock(key, function(err, index) {
                    assert.ifError(err);
                    assert.equal(index, 0);

                    pettyCache.semaphore.acquireLock(key, function(err) {
                        assert(err);

                        pettyCache.semaphore.releaseLock(key, 0);

                        pettyCache.semaphore.acquireLock(key, function(err, index) {
                            assert.ifError(err);
                            assert.equal(index, 0);
                            done();
                        });
                    });
                });
            });
        });

        it('should fail if the semaphore does not exist', function(done) {
            var key = Math.random().toString();

            pettyCache.semaphore.releaseLock(key, 10, function(err) {
                assert(err);
                assert.strictEqual(err.message, `Semaphore ${key} doesn't exist.`);
                done();
            });
        });
    });

    describe('PettyCache.semaphore.reset', function() {
        it('should reset all locks', function(done) {
            var key = Math.random().toString();

            pettyCache.semaphore.retrieveOrCreate(key, { size: 2 }, function(err) {
                assert.ifError(err);

                pettyCache.semaphore.acquireLock(key, function(err, index) {
                    assert.ifError(err);
                    assert.equal(index, 0);

                    pettyCache.semaphore.acquireLock(key, function(err, index) {
                        assert.ifError(err);
                        assert.equal(index, 1);

                        pettyCache.semaphore.acquireLock(key, function(err) {
                            assert(err);

                            pettyCache.semaphore.reset(key, function(err) {
                                assert.ifError(err);

                                pettyCache.semaphore.acquireLock(key, function(err, index) {
                                    assert.ifError(err);
                                    assert.equal(index, 0);
                                    done();
                                });
                            });
                        });
                    });
                });
            });
        });

        it('callback is optional', function(done) {
            var key = Math.random().toString();

            pettyCache.semaphore.retrieveOrCreate(key, { size: 2 }, function(err) {
                assert.ifError(err);

                pettyCache.semaphore.acquireLock(key, function(err, index) {
                    assert.ifError(err);
                    assert.equal(index, 0);

                    pettyCache.semaphore.acquireLock(key, function(err, index) {
                        assert.ifError(err);
                        assert.equal(index, 1);

                        pettyCache.semaphore.acquireLock(key, function(err) {
                            assert(err);

                            pettyCache.semaphore.reset(key);

                            pettyCache.semaphore.acquireLock(key, function(err, index) {
                                assert.ifError(err);
                                assert.equal(index, 0);
                                done();
                            });
                        });
                    });
                });
            });
        });

        it('should fail if the semaphore does not exist', function(done) {
            var key = Math.random().toString();

            pettyCache.semaphore.reset(key, function(err) {
                assert(err);
                assert.strictEqual(err.message, `Semaphore ${key} doesn't exist.`);
                done();
            });
        });
    });

    describe('PettyCache.semaphore.retrieveOrCreate', function() {
        it('should create a new semaphore', function(done) {
            var key = Math.random().toString();

            pettyCache.semaphore.retrieveOrCreate(key, { size: 100 }, function(err, semaphore) {
                assert.ifError(err);
                assert(semaphore);
                assert.equal(semaphore.length, 100);
                assert(semaphore.every(s => s.status === 'available'));

                pettyCache.semaphore.retrieveOrCreate(key, function(err, semaphore) {
                    assert.ifError(err);
                    assert(semaphore);
                    assert.equal(semaphore.length, 100);
                    assert(semaphore.every(s => s.status === 'available'));
                    done();
                });
            });
        });

        it('should have a min size of 1', function(done) {
            var key = Math.random().toString();

            pettyCache.semaphore.retrieveOrCreate(key, { size: 0 }, function(err, semaphore) {
                assert.ifError(err);
                assert(semaphore);
                assert.equal(semaphore.length, 1);
                assert(semaphore.every(s => s.status === 'available'));

                pettyCache.semaphore.retrieveOrCreate(key, function(err, semaphore) {
                    assert.ifError(err);
                    assert(semaphore);
                    assert.equal(semaphore.length, 1);
                    assert(semaphore.every(s => s.status === 'available'));
                    done();
                });
            });
        });

        it('should allow options.size to provide a function', function(done) {
            var key = Math.random().toString();

            pettyCache.semaphore.retrieveOrCreate(key, { size: (callback) => callback(null, 1 + 1) }, function(err, semaphore) {
                assert.ifError(err);
                assert(semaphore);
                assert.equal(semaphore.length, 2);
                assert(semaphore.every(s => s.status === 'available'));

                pettyCache.semaphore.retrieveOrCreate(key, function(err, semaphore) {
                    assert.ifError(err);
                    assert(semaphore);
                    assert.equal(semaphore.length, 2);
                    assert(semaphore.every(s => s.status === 'available'));
                    done();
                });
            });
        });

        it('callback is optional', function(done) {
            var key = Math.random().toString();

            pettyCache.semaphore.retrieveOrCreate(key);

            pettyCache.semaphore.retrieveOrCreate(key, { size: 100 }, function(err, semaphore) {
                assert.ifError(err);
                assert(semaphore);
                assert.equal(semaphore.length, 1);
                assert(semaphore.every(s => s.status === 'available'));
                done();
            });
        });
    });
});

describe('PettyCache.set', function() {
    it('PettyCache.set should set a value', function(done) {
        this.timeout(7000);

        var key = Math.random().toString();

        pettyCache.set(key, 'hello world', function() {
            pettyCache.get(key, function(err, value) {
                assert.equal(value, 'hello world');

                // Wait for memory cache to expire
                setTimeout(function() {
                    pettyCache.get(key, function(err, value) {
                        assert.equal(value, 'hello world');
                        done();
                    });
                }, 6000);
            });
        });
    });

    it('PettyCache.set should work without a callback', function(done) {
        pettyCache.set(Math.random().toString(), 'hello world');
        done();
    });

    it('PettyCache.set should set a value with the specified TTL option', function(done) {
        this.timeout(7000);

        var key = Math.random().toString();

        pettyCache.set(key, 'hello world', { ttl: 6000 },function() {
            pettyCache.get(key, function(err, value) {
                assert.equal(value, 'hello world');

                // Wait for memory cache to expire
                setTimeout(function() {
                    pettyCache.get(key, function(err, value) {
                        assert.equal(value, null);
                        done();
                    });
                }, 6001);
            });
        });
    });

    it('PettyCache.set should set a value with the specified TTL option using max and min', function(done) {
        this.timeout(10000);

        var key = Math.random().toString();

        pettyCache.set(key, 'hello world', { ttl: { max: 7000, min: 6000 } },function() {
            pettyCache.get(key, function(err, value) {
                assert.strictEqual(value, 'hello world');

                // Get again before cache expires
                setTimeout(function() {
                    pettyCache.get(key, function(err, value) {
                        assert.strictEqual(value, 'hello world');

                        // Wait for memory cache to expire
                        setTimeout(function() {
                            pettyCache.get(key, function(err, value) {
                                assert.strictEqual(value, null);
                                done();
                            });
                        }, 6001);
                    });
                }, 1000);
            });
        });
    });

    it('PettyCache.set should set a value with the specified TTL option using min only', function(done) {
        this.timeout(10000);

        var key = Math.random().toString();

        pettyCache.set(key, 'hello world', { ttl: { min: 6000 } },function() {
            pettyCache.get(key, function(err, value) {
                assert.strictEqual(value, 'hello world');
                done();
            });
        });
    });

    it('PettyCache.set should set a value with the specified TTL option using max only', function(done) {
        this.timeout(10000);

        var key = Math.random().toString();

        pettyCache.set(key, 'hello world', { ttl: { max: 10000 } },function() {
            pettyCache.get(key, function(err, value) {
                assert.strictEqual(value, 'hello world');
                done();
            });
        });
    });

    it('PettyCache.set(key, \'\')', function(done) {
        this.timeout(11000);

        var key = Math.random().toString();

        pettyCache.set(key, '', { ttl: 7000 }, function(err) {
            assert.ifError(err);

            pettyCache.get(key, function(err, value) {
                assert.ifError(err);
                assert.strictEqual(value, '');

                // Wait for memory cache to expire
                setTimeout(function() {
                    pettyCache.get(key, function(err, value) {
                        assert.ifError(err);
                        assert.strictEqual(value, '');

                        // Wait for memory cache and Redis cache to expire
                        setTimeout(function() {
                            pettyCache.get(key, function(err, value) {
                                assert.ifError(err);
                                assert.strictEqual(value, null);
                                done();
                            });
                        }, 5001);
                    });
                }, 5001);
            });
        });
    });

    it('PettyCache.set(key, 0)', function(done) {
        this.timeout(11000);

        var key = Math.random().toString();

        pettyCache.set(key, 0, { ttl: 7000 }, function(err) {
            assert.ifError(err);

            pettyCache.get(key, function(err, value) {
                assert.ifError(err);
                assert.strictEqual(value, 0);

                // Wait for memory cache to expire
                setTimeout(function() {
                    pettyCache.get(key, function(err, value) {
                        assert.ifError(err);
                        assert.strictEqual(value, 0);

                        // Wait for memory cache and Redis cache to expire
                        setTimeout(function() {
                            pettyCache.get(key, function(err, value) {
                                assert.ifError(err);
                                assert.strictEqual(value, null);
                                done();
                            });
                        }, 5001);
                    });
                }, 5001);
            });
        });
    });

    it('PettyCache.set(key, false)', function(done) {
        this.timeout(11000);

        var key = Math.random().toString();

        pettyCache.set(key, false, { ttl: 7000 }, function(err) {
            assert.ifError(err);

            pettyCache.get(key, function(err, value) {
                assert.ifError(err);
                assert.strictEqual(value, false);

                // Wait for memory cache to expire
                setTimeout(function() {
                    pettyCache.get(key, function(err, value) {
                        assert.ifError(err);
                        assert.strictEqual(value, false);

                        // Wait for memory cache and Redis cache to expire
                        setTimeout(function() {
                            pettyCache.get(key, function(err, value) {
                                assert.ifError(err);
                                assert.strictEqual(value, null);
                                done();
                            });
                        }, 5001);
                    });
                }, 5001);
            });
        });
    });

    it('PettyCache.set(key, NaN)', function(done) {
        this.timeout(11000);

        var key = Math.random().toString();

        pettyCache.set(key, NaN, { ttl: 7000 }, function(err) {
            assert.ifError(err);

            pettyCache.get(key, function(err, value) {
                assert.ifError(err);
                assert(typeof value === 'number' && isNaN(value));

                // Wait for memory cache to expire
                setTimeout(function() {
                    pettyCache.get(key, function(err, value) {
                        assert.ifError(err);
                        assert(typeof value === 'number' && isNaN(value));

                        // Wait for memory cache and Redis cache to expire
                        setTimeout(function() {
                            pettyCache.get(key, function(err, value) {
                                assert.ifError(err);
                                assert.strictEqual(value, null);
                                done();
                            });
                        }, 5001);
                    });
                }, 5001);
            });
        });
    });

    it('PettyCache.set(key, null)', function(done) {
        this.timeout(11000);

        var key = Math.random().toString();

        pettyCache.set(key, null, { ttl: 7000 }, function(err) {
            assert.ifError(err);

            pettyCache.get(key, function(err, value) {
                assert.ifError(err);
                assert.strictEqual(value, null);

                // Wait for memory cache to expire
                setTimeout(function() {
                    pettyCache.get(key, function(err, value) {
                        assert.ifError(err);
                        assert.strictEqual(value, null);

                        // Wait for memory cache and Redis cache to expire
                        setTimeout(function() {
                            pettyCache.get(key, function(err, value) {
                                assert.ifError(err);
                                assert.strictEqual(value, null);
                                done();
                            });
                        }, 5001);
                    });
                }, 5001);
            });
        });
    });

    it('PettyCache.set(key, undefined)', function(done) {
        this.timeout(11000);

        var key = Math.random().toString();

        pettyCache.set(key, undefined, { ttl: 7000 }, function(err) {
            assert.ifError(err);

            pettyCache.get(key, function(err, value) {
                assert.ifError(err);
                assert.strictEqual(value, undefined);

                // Wait for memory cache to expire
                setTimeout(function() {
                    pettyCache.get(key, function(err, value) {
                        assert.ifError(err);
                        assert.strictEqual(value, undefined);

                        // Wait for memory cache and Redis cache to expire
                        setTimeout(function() {
                            pettyCache.get(key, function(err, value) {
                                assert.ifError(err);
                                assert.strictEqual(value, null);
                                done();
                            });
                        }, 5001);
                    });
                }, 5001);
            });
        });
    });
});

describe('redisClient', function() {
    it('redisClient.mget(falsy keys)', function(done) {
        var key1 = Math.random().toString();
        var key2 = Math.random().toString();
        var key3 = Math.random().toString();
        var key4 = Math.random().toString();
        var key5 = Math.random().toString();
        var key6 = Math.random().toString();
        var values = {};

        values[key1] = '';
        values[key2] = 0;
        values[key3] = false;
        values[key4] = NaN;
        values[key5] = null;
        values[key6] = undefined;

        async.each(Object.keys(values), function(key, callback) {
            redisClient.psetex(key, 1000, PettyCache.stringify(values[key]), callback);
        }, function(err) {
            assert.ifError(err);

            var keys = Object.keys(values);

            // Add an additional key to check handling of missing keys
            keys.push(Math.random().toString());

            redisClient.mget(keys, function(err, data) {
                assert.ifError(err);
                assert.strictEqual(data.length, 7);
                assert.strictEqual(data[0], '""');
                assert.strictEqual(PettyCache.parse(data[0]), '');
                assert.strictEqual(data[1], '0');
                assert.strictEqual(PettyCache.parse(data[1]), 0);
                assert.strictEqual(data[2], 'false');
                assert.strictEqual(PettyCache.parse(data[2]), false);
                assert.strictEqual(data[3], '"__NaN"');
                assert.strictEqual(typeof PettyCache.parse(data[3]), 'number');
                assert(isNaN(PettyCache.parse(data[3])));
                assert.strictEqual(data[4], '"__null"');
                assert.strictEqual(PettyCache.parse(data[4]), null);
                assert.strictEqual(data[5], '"__undefined"');
                assert.strictEqual(PettyCache.parse(data[5]), undefined);
                assert.strictEqual(data[6], null);
                done();
            });
        });
    });

    it('redisClient.psetex(key, \'\')', function(done) {
        var key = Math.random().toString();

        redisClient.psetex(key, 1000, PettyCache.stringify(''), function(err) {
            assert.ifError(err);

            redisClient.get(key, function(err, data) {
                assert.ifError(err);
                assert.strictEqual(data, '""');
                assert.strictEqual(PettyCache.parse(data), '');

                // Wait for Redis cache to expire
                setTimeout(function() {
                    redisClient.get(key, function(err, data) {
                        assert.ifError(err);
                        assert.strictEqual(data, null);
                        done();
                    });
                }, 1001);
            });
        });
    });

    it('redisClient.psetex(key, 0)', function(done) {
        var key = Math.random().toString();

        redisClient.psetex(key, 1000, PettyCache.stringify(0), function(err) {
            assert.ifError(err);

            redisClient.get(key, function(err, data) {
                assert.ifError(err);
                assert.strictEqual(data, '0');
                assert.strictEqual(PettyCache.parse(data), 0);

                // Wait for Redis cache to expire
                setTimeout(function() {
                    redisClient.get(key, function(err, data) {
                        assert.ifError(err);
                        assert.strictEqual(data, null);
                        done();
                    });
                }, 1001);
            });
        });
    });

    it('redisClient.psetex(key, false)', function(done) {
        var key = Math.random().toString();

        redisClient.psetex(key, 1000, PettyCache.stringify(false), function(err) {
            assert.ifError(err);

            redisClient.get(key, function(err, data) {
                assert.ifError(err);
                assert.strictEqual(data, 'false');
                assert.strictEqual(PettyCache.parse(data), false);

                // Wait for Redis cache to expire
                setTimeout(function() {
                    redisClient.get(key, function(err, data) {
                        assert.ifError(err);
                        assert.strictEqual(data, null);
                        done();
                    });
                }, 1001);
            });
        });
    });

    it('redisClient.psetex(key, NaN)', function(done) {
        var key = Math.random().toString();

        redisClient.psetex(key, 1000, PettyCache.stringify(NaN), function(err) {
            assert.ifError(err);

            redisClient.get(key, function(err, data) {
                assert.ifError(err);
                assert.strictEqual(data, '"__NaN"');
                assert(isNaN(PettyCache.parse(data)));

                // Wait for Redis cache to expire
                setTimeout(function() {
                    redisClient.get(key, function(err, data) {
                        assert.ifError(err);
                        assert.strictEqual(data, null);
                        done();
                    });
                }, 1001);
            });
        });
    });

    it('redisClient.psetex(key, null)', function(done) {
        var key = Math.random().toString();

        redisClient.psetex(key, 1000, PettyCache.stringify(null), function(err) {
            assert.ifError(err);

            redisClient.get(key, function(err, data) {
                assert.ifError(err);
                assert.strictEqual(data, '"__null"');
                assert.strictEqual(PettyCache.parse(data), null);

                // Wait for Redis cache to expire
                setTimeout(function() {
                    redisClient.get(key, function(err, data) {
                        assert.ifError(err);
                        assert.strictEqual(data, null);
                        done();
                    });
                }, 1001);
            });
        });
    });

    it('redisClient.psetex(key, undefined)', function(done) {
        var key = Math.random().toString();

        redisClient.psetex(key, 1000, PettyCache.stringify(undefined), function(err) {
            assert.ifError(err);

            redisClient.get(key, function(err, data) {
                assert.ifError(err);
                assert.strictEqual(data, '"__undefined"');
                assert.strictEqual(PettyCache.parse(data), undefined);

                // Wait for Redis cache to expire
                setTimeout(function() {
                    redisClient.get(key, function(err, data) {
                        assert.ifError(err);
                        assert.strictEqual(data, null);
                        done();
                    });
                }, 1001);
            });
        });
    });
});

describe('Benchmark', function() {
    const emojis = require('./emojis.json');

    it('PettyCache should be faster than node-redis', function(done) {
        var pettyCacheEnd;
        var pettyCacheKey = Math.random().toString();
        var pettyCacheStart;
        var redisEnd;
        var redisKey = Math.random().toString();
        var redisStart = Date.now();

        redisClient.psetex(redisKey, 30000, JSON.stringify(emojis), function(err) {
            assert.ifError(err);

            async.times(500, function(n, callback) {
                redisClient.get(redisKey, function(err, data) {
                    if (err) {
                        return callback(err);
                    }

                    callback(null, JSON.parse(data));
                });
            }, function(err) {
                redisEnd = Date.now();
                assert.ifError(err);
                pettyCacheStart = Date.now();

                pettyCache.set(pettyCacheKey, emojis, function(err) {
                    assert.ifError(err);

                    async.times(500, function(n, callback) {
                        pettyCache.get(pettyCacheKey, function(err, data) {
                            if (err) {
                                return callback(err);
                            }

                            callback(null, data);
                        });
                    }, function(err) {
                        pettyCacheEnd = Date.now();
                        assert.ifError(err);
                        assert(pettyCacheEnd - pettyCacheStart < redisEnd - redisStart);
                        done();
                    });
                });
            });
        });
    });
});
