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
                    return callback(null, { 'c': [3], 'd': { num: 4 } });
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
                        assert.equal(data.foo, 'bar');
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
                assert.equal(data, null);
                
                // Wait for local cache to expire
                setTimeout(function() {
                    pettyCache.fetch(key, function() {
                        throw 'This function should not be called';
                    }, function(err, data) {
                        assert.equal(data, null);
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
                assert.equal(data, null);
                
                // Wait for local cache to expire
                setTimeout(function() {
                    pettyCache.fetch(key, function() {
                        throw 'This function should not be called';
                    }, function(err, data) {
                        assert.equal(data, null);
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
        }

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
        }

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
            }, 6000);
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
