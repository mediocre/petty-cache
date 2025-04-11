# petty-cache

[![Build Status](https://github.com/mediocre/petty-cache/actions/workflows/test.yml/badge.svg?branch=main)](https://github.com/mediocre/petty-cache/actions?query=workflow%3Abuild+branch%3Amain)
[![Coverage Status](https://coveralls.io/repos/github/mediocre/petty-cache/badge.svg?branch=main)](https://coveralls.io/github/mediocre/petty-cache?branch=main)

A cache module for Node.js that uses a two-level cache (in-memory cache for recently accessed data plus Redis for distributed caching) with automatic serialization plus some extra features to avoid cache stampedes and thundering herds.

Also includes mutex and semaphore distributed locking primitives.

## Features

**Two-level cache**
Data is cached for 2 to 5 seconds in memory to reduce the amount of calls to Redis.

**Jitter**
By default, cache values expire from Redis at a random time between 30 and 60 seconds. This helps to prevent a large amount of keys from expiring at the same time in order to avoid thundering herds (http://en.wikipedia.org/wiki/Thundering_herd_problem).

**Double-checked locking**
Functions executed on cache misses are wrapped in double-checked locking (http://en.wikipedia.org/wiki/Double-checked_locking). This ensures the function called on cache miss will only be executed once in order to prevent cache stampedes (http://en.wikipedia.org/wiki/Cache_stampede).

**Mutex**
Provides a distributed lock (mutex) with the ability to retry a specified number of times after a specified interval of time when acquiring a lock.

**Semaphore**
Provides a pool of distributed locks with the ability to release a slot back to the pool or remove the slot from the pool so that it's not used again.

## Getting Started

```javascript
// Setup petty-cache
var PettyCache = require('petty-cache');
var pettyCache = new PettyCache();

// Fetch some data
pettyCache.fetch('key', function(callback) {
    // This function is called on a cache miss
    fs.readFile('file.txt', callback);
}, function(err, value) {
    // This callback is called once petty-cache has loaded data from cache or executed the specified cache miss function
    console.log(value);
});
```

## API

### new PettyCache([port, [host, [options]]])

Creates a new petty-cache client. `port`, `host`, and `options` are passed directly to [redis.createClient()](https://www.npmjs.com/package/redis#rediscreateclient).

**Example**
```javascript
const pettyCache = new PettyCache(6379, 'localhost', { auth_pass: 'secret' });
```

### new PettyCache(RedisClient)

Alternatively, you can inject your own [RedisClient](https://www.npmjs.com/package/redis) into Petty Cache.

**Example**
```javascript
const redisClient = redis.createClient();
const pettyCache = new PettyCache(redisClient);
```

### pettyCache.bulkFetch(keys, cacheMissFunction, [options,] callback)

Attempts to retrieve the values of the keys specified in the `keys` array. Any keys that aren't found are passed to cacheMissFunction as an array along with a callback that takes an error and an object, expecting the keys of the object to be the keys passed to `cacheMissFunction` and the values to be the values that should be stored in cache for the corresponding key.  Either way, the resulting error or key-value hash of all requested keys is passed to `callback`.

**Example**

```javascript
// Let's assume a and b are already cached as 1 and 2
pettyCache.bulkFetch(['a', 'b', 'c', 'd'], function(keys, callback) {
    var results = {};

    keys.forEach(function(key) {
        results[key] = key.toUpperCase();
    });

    callback(null, results);
}, function(err, values) {
    console.log(values); // {a: 1, b: 2, c: 'C', d: 'D'}
});
```

**Options**

```
{
    ttl: 30000 // How long it should take for the cache entry to expire in milliseconds. Defaults to a random value between 30000 and 60000 (for jitter).
}
```

```
{
    // TTL can optional be specified with a range to pick a random value between `min` and `max` (for jitter).
    ttl: {
        min: 5000,
        max: 10000
    }
}
```

### pettyCache.bulkGet(keys, callback)

Attempts to retrieve the values of the keys specified in the `keys` array. Returns a key-value hash of all specified keys with either the corresponding values from cache or `undefined` if a key was not found.

**Example**

```javascript
pettyCache.get(['key1', 'key2', 'key3'], function(err, values) {
    console.log(values);
});
```

### pettyCache.bulkSet(values, [options,] callback)

Unconditionally sets the values for the specified keys.

**Example**

```javascript
pettyCache.set({ key1: 'one', key2: 2, key3: 'three' }, function(err) {
    if (err) {
        // Handle error
    }
});
```

**Options**

```
{
    ttl: 30000 // How long it should take for the cache entries to expire in milliseconds. Defaults to a random value between 30000 and 60000 (for jitter).
}
```

```
{
    // TTL can optional be specified with a range to pick a random value between `min` and `max` (for jitter).
    ttl: {
        min: 5000,
        max: 10000
    }
}
```

### pettyCache.fetch(key, cacheMissFunction, [options,] callback)

Attempts to retrieve the value from cache at the specified key. If it doesn't exist, it executes the specified cacheMissFunction that takes two parameters: an error and a value. `cacheMissFunction` should retrieve the expected value for the key from another source and pass it to the given callback. Either way, the resulting error or value is passed to `callback`.

**Example**

```javascript
pettyCache.fetch('key', function(callback) {
    // This function is called on a cache miss
    fs.readFile('file.txt', callback);
}, function(err, value) {
    // This callback is called once petty-cache has loaded data from cache or executed the specified cache miss function
    console.log(value);
});
```

```javascript
pettyCache.fetch('key', async () => {
    // This function is called on a cache miss
    return await fs.readFile('file.txt');
}, function(err, value) {
    // This callback is called once petty-cache has loaded data from cache or executed the specified cache miss function
    console.log(value);
});
```

**Options**

```
{
    ttl: 30000 // How long it should take for the cache entry to expire in milliseconds. Defaults to a random value between 30000 and 60000 (for jitter).
}
```

```
{
    // TTL can optional be specified with a range to pick a random value between `min` and `max` (for jitter).
    ttl: {
        min: 5000,
        max: 10000
    }
}
```

### pettyCache.fetchAndRefresh(key, cacheMissFunction, [options,] callback)

Similar to `pettyCache.fetch` but this method continually refreshes the data in cache by executing the specified cacheMissFunction before the TTL expires. 

**Example**

```javascript
pettyCache.fetchAndRefresh('key', function(callback) {
    // This function is called on a cache miss and every TTL/2 milliseconds
    fs.readFile('file.txt', callback);
}, function(err, value) {
    console.log(value);
});
```

**Options**

```
{
    ttl: 30000 // How long it should take for the cache entry to expire in milliseconds. Defaults to a random value between 30000 and 60000 (for jitter).
}
```

```
{
    // TTL can optional be specified with a range to pick a random value between `min` and `max` (for jitter).
    ttl: {
        min: 5000,
        max: 10000
    }
}
```

### pettyCache.get(key, callback)

Attempts to retrieve the value from cache at the specified key. Returns `null` if the key doesn't exist.

**Example**

```javascript
pettyCache.get('key', function(err, value) {
    // `value` contains the value of the key if it was found in the in-memory cache or Redis. `value` is `null` if the key was not found.
    console.log(value);
});
```

### pettyCache.patch(key, value, [options,] callback)

Updates an object at the given key with the property values provided. Sends an error to the callback if the key does not exist.

**Example**

```javascript
pettyCache.patch('key', { a: 1 }, function(callback) {
    if (err) {
        // Handle redis or key not found error
    }

    // The object stored at 'key' now has a property 'a' with the value 1. Its other values are intact.
});
```

**Options**

```
{
    ttl: 30000 // How long it should take for the cache entry to expire in milliseconds. Defaults to a random value between 30000 and 60000 (for jitter).
}
```

```
{
    // TTL can optional be specified with a range to pick a random value between `min` and `max` (for jitter).
    ttl: {
        min: 5000,
        max: 10000
    }
}
```

### pettyCache.set(key, value, [options,] callback)

Unconditionally sets a value for a given key.

**Example**

```javascript
pettyCache.set('key', { a: 'b' }, function(err) {
    if (err) {
        // Handle redis error
    }
});
```

**Options**

```
{
    ttl: 30000 // How long it should take for the cache entry to expire in milliseconds. Defaults to a random value between 30000 and 60000 (for jitter).
}
```

```
{
    // TTL can optional be specified with a range to pick a random value between `min` and `max` (for jitter).
    ttl: {
        min: 5000,
        max: 10000
    }
}
```

## Mutex

### pettyCache.mutex.lock(key, [options, [callback]])

Attempts to acquire a distributed lock for the specified key. Optionally retries a specified number of times by waiting a specified amount of time between attempts.

```javascript
pettyCache.mutex.lock('key', { retry: { interval: 100, times: 5 }, ttl: 1000 }, function(err) {
    if (err) {
        // We weren't able to acquire the lock (even after trying 5 times every 100 milliseconds).
    }

    // We were able to acquire the lock. Do work and then unlock.
    pettyCache.mutex.unlock('key');
});
```

**Options**

```javascript
{
    retry: {
        interval: 100, // The time in milliseconds between attempts to acquire the lock.
        times: 1 // The number of attempts to acquire the lock.
    },
    ttl: 1000 // The maximum amount of time to keep the lock locked before automatically being unlocked.
}
```

### pettyCache.mutex.unlock(key, [callback])

Releases the distributed lock for the specified key.

```javascript
pettyCache.mutex.unlock('key', function(err) {
    if (err) {
        // We weren't able to reach Redis. Your lock will expire after its TTL, but you might want to log this error.
    }
});
```

## Semaphore

Provides a pool of distributed locks. Once a consumer acquires a lock they have the ability to release the lock back to the pool or mark the lock as "consumed" so that it's not used again.

**Example**

```javascript
// Create a new semaphore
pettyCache.semaphore.retrieveOrCreate('key', { size: 10 }, function(err) {
    if (err) {
        // Aw, snap! We couldn't create the semaphore
    }

    // Acquire a lock from the semaphore's pool
    pettyCache.semaphore.acquireLock('key', { retry: { interval: 100, times: 5 }, ttl: 1000 }, function(err, index) {
        if (err) {
            // We couldn't acquire a lock from the semaphore's pool (even after trying 5 times every 100 milliseconds).
        }

        // We were able to acquire a lock from the semaphore's pool. Do work and then release the lock.
        pettyCache.semaphore.releaseLock('key', index, function(err) {
            if (err) {
                // We weren't able to reach Redis. Your lock will expire after its TTL, but you might want to log this error.
            }
        });

        // Or, rather than releasing the lock back to the semaphore's pool you can mark the lock as "consumed" to prevent it from being used again.
        pettyCache.semaphore.consumeLock('key', index, function(err) {
            if (err) {
                // We weren't able to reach Redis. Your lock will expire after its TTL, but you might want to log this error.
            }
        });
    });
});
```

### pettyCache.semaphore.acquireLock(key, [options, [callback]])

Attempts to acquire a lock from the semaphore's pool. Optionally retries a specified number of times by waiting a specified amount of time between attempts.

```javascript
// Acquire a lock from the semaphore's pool
pettyCache.semaphore.acquireLock('key', { retry: { interval: 100, times: 5 }, ttl: 1000 }, function(err, index) {
    if (err) {
        // We couldn't acquire a lock from the semaphore's pool (even after trying 5 times every 100 milliseconds).
    }

    // We were able to acquire a lock from the semaphore's pool. Do work and then release the lock.
});
```

**Options**

```javascript
{
    retry: {
        interval: 100, // The time in milliseconds between attempts to acquire the lock.
        times: 1 // The number of attempts to acquire the lock.
    },
    ttl: 1000 // The maximum amount of time to keep the lock locked before automatically being unlocked.
}
```

### pettyCache.semaphore.consumeLock(key, index, [callback])

Mark the lock at the specified index as "consumed" to prevent it from being used again.

```javascript
pettyCache.semaphore.consumeLock('key', index, function(err) {
    if (err) {
        // We weren't able to reach Redis. Your lock will expire after its TTL, but you might want to log this error.
    }
});
```

### pettyCache.semaphore.expand(key, size, [callback])

Expand the number of locks in the specified semaphore's pool.

```javascript
pettyCache.semaphore.expand(key, 100, function(err) {
    if (err) {
        // We weren't able to expand the semaphore.
    }
});
```

### pettyCache.semaphore.releaseLock(key, index, [callback])

Releases the lock at the specified index back to the semaphore's pool so that it can be used again.

```javascript
pettyCache.semaphore.releaseLock('key', index, function(err) {
    if (err) {
        // We weren't able to reach Redis. Your lock will expire after its TTL, but you might want to log this error.
    }
});
```

### pettyCache.semaphore.reset(key, [callback])

Resets the semaphore to its initial state effectively releasing all locks (even those that have been marked as "consumed").

```javascript
pettyCache.semaphore.reset('key', function(err) {
    if (err) {
        // We weren't able to reset the semaphore.
    }
});
```

### pettyCache.semaphore.retrieveOrCreate(key, [options, [callback]])

Retrieves a previously created semaphore or creates a new semaphore with the optionally specified number of locks in its pool.

```javascript
// Create a new semaphore
pettyCache.semaphore.retrieveOrCreate('key', { size: 10 }, function(err) {
    if (err) {
        // Aw, snap! We couldn't create the semaphore
    }

    // Your semaphore was created.
});
```
**Options**

```javascript
{
    size: 1 || function() { var x = 1 + 1; callback(null, x); } // The number of locks to create in the semaphore's pool. Optionally, size can be a `callback(err, size)` function.
}
```
