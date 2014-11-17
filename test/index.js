var assert = require('assert');
var Cache = require('../index.js');

var cache = new Cache();

describe('Cache.bulkFetch', function() {
    it('Cache.bulkFetch', function(done) {
        this.timeout(7000);

        cache.set('a', 1, function() {
            cache.set('b', '2', function() {
                cache.bulkFetch(['a', 'b', 'c', 'd'], function(keys, callback) {
                    assert(keys.length <= 2);
                    return callback(null, { 'c': [3], 'd': { num: 4 } });
                }, function(err, values) {
                    assert.strictEqual(values.a, 1);
                    assert.strictEqual(values.b, '2');
                    assert.strictEqual(values.c[0], 3);
                    assert.strictEqual(values.d.num, 4);
                    
                    // Wait for local cache to expire
                    setTimeout(function() {
                        cache.bulkFetch(['a', 'b', 'c', 'd'], function() {
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
});

describe('Cache.fetch', function() {
    it('Cache.fetch', function(done) {
        this.timeout(7000);

        var key = Math.random().toString();

        cache.fetch(key, function(callback) {
            return callback(null, { foo: 'bar' });
        }, function() {
            cache.fetch(key, function() {
                throw 'This function should not be called';
            }, function(err, data) {
                assert.equal(data.foo, 'bar');

                // Wait for local cache to expire
                setTimeout(function() {
                    cache.fetch(key, function() {
                        throw 'This function should not be called';
                    }, function(err, data) {
                        assert.equal(data.foo, 'bar');
                        done();
                    });
                }, 6000);
            });
        });
    });

    it('Cache.fetch should cache null values returned by func', function(done) {
        this.timeout(7000);

        var key = Math.random().toString();

        cache.fetch(key, function(callback) {
            return callback(null, null);
        }, function() {
            cache.fetch(key, function() {
                throw 'This function should not be called';
            }, function(err, data) {
                assert.equal(data, null);
                
                // Wait for local cache to expire
                setTimeout(function() {
                    cache.fetch(key, function() {
                        throw 'This function should not be called';
                    }, function(err, data) {
                        assert.equal(data, null);
                        done();
                    });
                }, 6000);
            });
        });
    });

    it('Cache.fetch should cache undefined values returned by func', function(done) {
        this.timeout(7000);

        var key = Math.random().toString();

        cache.fetch(key, function(callback) {
            return callback(null, undefined);
        }, function() {
            cache.fetch(key, function() {
                throw 'This function should not be called';
            }, function(err, data) {
                assert.equal(data, null);
                
                // Wait for local cache to expire
                setTimeout(function() {
                    cache.fetch(key, function() {
                        throw 'This function should not be called';
                    }, function(err, data) {
                        assert.equal(data, null);
                        done();
                    });
                }, 6000);
            });
        });
    });

    it('Cache.fetch should lock around func', function(done) {
        var key = Math.random().toString();
        var numberOfFuncCalls = 0;

        var func = function(callback) {
            setTimeout(function() {
                callback(null, ++numberOfFuncCalls);
            }, 100);
        }

        cache.fetch(key, func, function() {});
        cache.fetch(key, func, function() {});
        cache.fetch(key, func, function() {});
        cache.fetch(key, func, function() {});
        cache.fetch(key, func, function() {});
        cache.fetch(key, func, function() {});
        cache.fetch(key, func, function() {});
        cache.fetch(key, func, function() {});
        cache.fetch(key, func, function() {});
        
        cache.fetch(key, func, function(err, data) {
            assert.equal(data, 1);
            done();
        });
    });

    it('Cache.fetch should run func again after expire', function(done) {
        this.timeout(7000);

        var key = Math.random().toString();
        var numberOfFuncCalls = 0;

        var func = function(callback) {
            setTimeout(function() {
                callback(null, ++numberOfFuncCalls);
            }, 100);
        }

        cache.fetch(key, func, { expire: 6000 }, function() {});
        
        cache.fetch(key, func, { expire: 6000 }, function(err, data) {
            assert.equal(data, 1);

            setTimeout(function() {
                cache.fetch(key, func, { expire: 6000 }, function(err, data) {
                    assert.equal(data, 2);

                    cache.fetch(key, func, { expire: 6000 }, function(err, data) {
                        assert.equal(data, 2);
                        done();
                    });
                });
            }, 6000);
        });
    });
});

describe('Cache.lock', function() {
    it('Cache.lock should lock for 1 second by default', function(done) {
        this.timeout(2000);

        var key = Math.random().toString();

        cache.lock(key);

        cache.lock(key, function() {
            throw 'This function should not be called';
        });

        setTimeout(function() {
            cache.lock(key, function() {
                done();
            });
        }, 1001);
    });

    it('Cache.lock should lock for 2 seconds when expire parameter is specified', function(done) {
        this.timeout(3000);

        var key = Math.random().toString();

        cache.lock(key, { expire: 2000 });

        cache.lock(key, function() {
            throw 'This function should not be called';
        });

        setTimeout(function() {
            cache.lock(key, function() {
                throw 'This function should not be called';
            });
        }, 1001);

        setTimeout(function() {
            cache.lock(key, function() {
                done();
            });
        }, 2001);
    });
});
