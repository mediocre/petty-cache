var assert = require('assert');
var PettyCache = require('../index.js');

var pettyCache = new PettyCache();

describe('PettyCache.bulkFetch', function() {
    it('PettyCache.bulkFetch', function(done) {
        this.timeout(7000);

        pettyCache.set('a', 1, function() {
            pettyCache.set('b', '2', function() {
                pettyCache.bulkFetch(['a', 'b', 'c', 'd'], function(keys, callback) {
                    assert(keys.length <= 2);
                    callback(null, { 'c': [3], 'd': { num: 4 } });
                }, function(err, values) {
                    assert.strictEqual(values.a, 1);
                    assert.strictEqual(values.b, '2');
                    assert.strictEqual(values.c[0], 3);
                    assert.strictEqual(values.d.num, 4);

                    // Wait for local cache to expire
                    setTimeout(function() {
                        pettyCache.bulkFetch(['a', 'b', 'c', 'd'], function() {
                            throw 'This function should not be called';
                        }, function(err, values) {
                            assert.strictEqual(values.a, 1);
                            assert.strictEqual(values.b, '2');
                            assert.strictEqual(values.c[0], 3);
                            assert.strictEqual(values.d.num, 4);
                            done();
                        });
                    }, 6000);
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

                // Wait for local cache to expire
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
});

describe('PettyCache.bulkGet', function() {
    it('PettyCache.bulkGet should return values', function(done) {
        this.timeout(7000);

        var key1 = Math.random().toString();
        var key2 = Math.random().toString();
        var key3 = Math.random().toString();

        pettyCache.set(key1, '1', function() {
            pettyCache.set(key2, '2', function() {
                pettyCache.set(key3, '3', function() {
                    pettyCache.bulkGet([key1, key2, key3], function(err, values) {
                        assert.equal(Object.keys(values).length, 3);
                        assert.equal(values[key1], '1');
                        assert.equal(values[key2], '2');
                        assert.equal(values[key3], '3');

                        // Call bulkGet again while values are still in memory cache
                        pettyCache.bulkGet([key1, key2, key3], function(err, values) {
                            assert.equal(Object.keys(values).length, 3);
                            assert.equal(values[key1], '1');
                            assert.equal(values[key2], '2');
                            assert.equal(values[key3], '3');

                            // Wait for memory cache to expire
                            setTimeout(function() {
                                // Ensure keys are still in Redis
                                pettyCache.bulkGet([key1, key2, key3], function(err, values) {
                                    assert.equal(Object.keys(values).length, 3);
                                    assert.equal(values[key1], '1');
                                    assert.equal(values[key2], '2');
                                    assert.equal(values[key3], '3');
                                    done();
                                });
                            }, 6000);
                        });
                    });
                });
            });
        });
    });

    it('PettyCache.bulkGet should return undefined for missing keys', function(done) {
        this.timeout(7000);

        var key1 = Math.random().toString();
        var key2 = Math.random().toString();
        var key3 = Math.random().toString();

        pettyCache.set(key1, '1', function() {
            pettyCache.set(key2, '2', function() {
                pettyCache.bulkGet([key1, key2, key3], function(err, values) {
                    assert.equal(Object.keys(values).length, 3);
                    assert.equal(values[key1], '1');
                    assert.equal(values[key2], '2');
                    assert.equal(values[key3], undefined);

                    // Call bulkGet again while values are still in memory cache
                    pettyCache.bulkGet([key1, key2, key3], function(err, values) {
                        assert.equal(Object.keys(values).length, 3);
                        assert.equal(values[key1], '1');
                        assert.equal(values[key2], '2');
                        assert.equal(values[key3], undefined);

                        // Wait for memory cache to expire
                        setTimeout(function() {
                            // Ensure keys are still in Redis
                            pettyCache.bulkGet([key1, key2, key3], function(err, values) {
                                assert.equal(Object.keys(values).length, 3);
                                assert.equal(values[key1], '1');
                                assert.equal(values[key2], '2');
                                assert.equal(values[key3], undefined);
                                done();
                            });
                        }, 6000);
                    });
                });
            });
        });
    });
});

describe('PettyCache.bulkSet', function() {
    it('PettyCache.bulkSet should set values', function(done) {
        this.timeout(7000);

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
                assert.strictEqual(value, '1');

                pettyCache.get(key2, function(err, value) {
                    assert.strictEqual(value, 2);

                    pettyCache.get(key3, function(err, value) {
                        assert.strictEqual(value, '3');

                        // Wait for local cache to expire
                        setTimeout(function() {
                            pettyCache.get(key1, function(err, value) {
                                assert.strictEqual(value, '1');

                                pettyCache.get(key2, function(err, value) {
                                    assert.strictEqual(value, 2);

                                    pettyCache.get(key3, function(err, value) {
                                        assert.strictEqual(value, '3');
                                        done();
                                    });
                                });
                            });
                        }, 6000);
                    });
                });
            });
        });
    });

    it('PettyCache.bulkSet should set values with the specified expire option', function(done) {
        this.timeout(7000);

        var key1 = Math.random().toString();
        var key2 = Math.random().toString();
        var key3 = Math.random().toString();
        var values = {};

        values[key1] = '1';
        values[key2] = 2;
        values[key3] = '3';

        pettyCache.bulkSet(values, { expire: 6000 }, function(err) {
            assert.ifError(err);

            pettyCache.get(key1, function(err, value) {
                assert.strictEqual(value, '1');

                pettyCache.get(key2, function(err, value) {
                    assert.strictEqual(value, 2);

                    pettyCache.get(key3, function(err, value) {
                        assert.strictEqual(value, '3');

                        // Wait for local cache to expire
                        setTimeout(function() {
                            pettyCache.get(key1, function(err, value) {
                                assert.strictEqual(value, null);

                                pettyCache.get(key2, function(err, value) {
                                    assert.strictEqual(value, null);

                                    pettyCache.get(key3, function(err, value) {
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

                // Wait for local cache to expire
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

                // Wait for local cache to expire
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
                assert.strictEqual(data, null);

                // Wait for local cache to expire
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

    it('PettyCache.fetch should run func again after expire', function(done) {
        this.timeout(7000);

        var key = Math.random().toString();
        var numberOfFuncCalls = 0;

        var func = function(callback) {
            setTimeout(function() {
                callback(null, ++numberOfFuncCalls);
            }, 100);
        };

        pettyCache.fetch(key, func, { expire: 6000 }, function() {});

        pettyCache.fetch(key, func, { expire: 6000 }, function(err, data) {
            assert.equal(data, 1);

            setTimeout(function() {
                pettyCache.fetch(key, func, { expire: 6000 }, function(err, data) {
                    assert.equal(data, 2);

                    pettyCache.fetch(key, func, { expire: 6000 }, function(err, data) {
                        assert.equal(data, 2);
                        done();
                    });
                });
            }, 6001);
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

                // Wait for local cache to expire
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
            assert.equal(value, null);

            pettyCache.get(key, function(err, value) {
                assert.equal(value, null);
                done();
            });
        });
    });
});

describe('PettyCache.lock', function() {
    it('PettyCache.lock should lock for 1 second by default', function(done) {
        this.timeout(2000);

        var key = Math.random().toString();

        pettyCache.lock(key);

        pettyCache.lock(key, function() {
            throw 'This function should not be called';
        });

        setTimeout(function() {
            pettyCache.lock(key, function() {
                done();
            });
        }, 1001);
    });

    it('PettyCache.lock should lock for 2 seconds when expire parameter is specified', function(done) {
        this.timeout(3000);

        var key = Math.random().toString();

        pettyCache.lock(key, { expire: 2000 });

        pettyCache.lock(key, function() {
            throw 'This function should not be called';
        });

        setTimeout(function() {
            pettyCache.lock(key, function() {
                throw 'This function should not be called';
            });
        }, 1001);

        setTimeout(function() {
            pettyCache.lock(key, function() {
                done();
            });
        }, 2001);
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
    });
});

describe('PettyCache.set', function() {
    it('PettyCache.set should set a value', function(done) {
        this.timeout(7000);

        var key = Math.random().toString();

        pettyCache.set(key, 'hello world', function() {
            pettyCache.get(key, function(err, value) {
                assert.equal(value, 'hello world');

                // Wait for local cache to expire
                setTimeout(function() {
                    pettyCache.get(key, function(err, value) {
                        assert.equal(value, 'hello world');
                        done();
                    });
                }, 6000);
            });
        });
    });

    it('PettyCache.set should set a value with the specified expire option', function(done) {
        this.timeout(7000);

        var key = Math.random().toString();

        pettyCache.set(key, 'hello world', { expire: 6000 },function() {
            pettyCache.get(key, function(err, value) {
                assert.equal(value, 'hello world');

                // Wait for cache to expire
                setTimeout(function() {
                    pettyCache.get(key, function(err, value) {
                        assert.equal(value, null);
                        done();
                    });
                }, 6001);
            });
        });
    });
});
