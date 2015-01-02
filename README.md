petty-cache
===========

A cache module for node.js that uses a two-level cache (in-memory cache for recently accessed data plus Redis for distributed caching) with some extra features to avoid cache stampedes and thundering herds.

##Features

**Two-level cache**  
Data is cached for 2 to 5 seconds in memory to reduce the amount of calls to Redis.

**Jitter**  
By default, cache values expire from Redis at a random time between 30 and 60 seconds. This helps to prevent a large amount of keys from expiring at the same time in order to avoid thundering herds (http://en.wikipedia.org/wiki/Thundering_herd_problem).

**Double-checked locking**  
Functions executed on cache misses are wrapped in double-checked locking (http://en.wikipedia.org/wiki/Double-checked_locking). This ensures the function called on cache miss will only be executed once in order to prevent cache stampedes (http://en.wikipedia.org/wiki/Cache_stampede).

## Getting Started

```javascript
// Setup petty-cache
var PettyCache = require('petty-cache');
var pettyCache = new PettyCache();


// Fetch some data
cache.fetch('key', function(callback) {
    // This function is called on a cache miss
    fs.readFile('file.txt', callback);
}, function(err, value) {
    // This callback is called once petty-cache has loaded data from cache or executed the specified cache miss function
    console.log(value);
});
```

##API

###new Cache([port, [host, [options]]])

Creates a new petty-cache client. `port`, `host`, and `options` are passed directly to [redis.createClient()](https://www.npmjs.org/package/redis#redis-createclient-).

###Cache#bulkFetch(keys, cacheMissFunction, [options,] callback)

Attempts to retrieve the values of the keys specified in the `keys` array. Any keys that aren't found are passed to cacheMissFunction as an array along with a callback that takes an error and an object, expecting the keys of the object to be the keys passed to `cacheMissFunction` and the values to be the values that should be stored in cache for the corresponding key.  Either way, the resulting error or key-value hash of all requested keys is passed to `callback`.

**Example**

```javascript
// Let's assume a and b are already cached as 1 and 2
cache.bulkFetch(['a', 'b', 'c', 'd'], function(keys, callback) {
    var results = {};
    
    keys.forEach(function(key) {
        results[key] = key.toUpperCase();
    }
}, function(err, values) {
    console.log(values); // {a: 1, b: 2, c: 'C', d: 'D'}
});
```

**Options**

```javascript
{
    expire: 30000 // How long it should take for the cache entry to expire in milliseconds. Defaults to a random value between 30000 and 60000 (for jitter).
}
```

###Cache#fetch(key, cacheMissFunction, [options,] callback)

Attempts to retrieve the value from cache at the specified key. If it doesn't exist, it executes the specified cacheMissFunction that takes two parameters: an error and a value.  `cacheMissFunction` should retrieve the expected value for the key from another source and pass it to the given callback. Either way, the resulting error or value is passed to `callback`.

**Example**

```javascript
cache.fetch('key', function(callback) {
    // This function is called on a cache miss
    fs.readFile('file.txt', callback);
}, function(err, value) {
    // This callback is called once petty-cache has loaded data from cache or executed the specified cache miss function
    console.log(value);
});
```

**Options**

```javascript
{
    expire: 30000 // How long it should take for the cache entry to expire in milliseconds. Defaults to a random value between 30000 and 60000 (for jitter).
}
```

###Cache#get(key, callback)

Gets the value of key trying the in-memory cache first and Redis second. If the key does not exist `null` is returned.

**Example**

```javascript
cache.get('key', function(err, value) {
    // `value` contains the value of the key if it was found in the in-memory cache or Redis. `value` is `null` if the key was not found.
    console.log(value);
});
```

###Cache#lock(key, [options,] callback)

A simple distributed lock. The callback is only called if another entity has not acquired a lock on `key`.  Subsequent attempts to acquire the lock are not made; if you need to retry, you must implement that yourself.

**Example**

```javascript
cache.lock('resource', function() {
    console.log('did a thing'); //If multiple processes run simultaneously, only one should print 'did a thing'
});
```

**Options**

```javascript
{
    expire: 2000 // How long it should take for the lock acquisition to expire in milliseconds. Defaults to 1000.
}
```

###Cache#set(key, value, [options,] callback)

Unconditionally sets a value for a given key.

**Example**

```javascript
cache.set('key', { a: 'b' }, function(err) {
    if (err) {
        // Handle redis error
    }
});
```

**Options**

```javascript
{
    expire: 30000 // How long it should take for the cache entry to expire in milliseconds. Defaults to a random value between 30000 and 60000 (for jitter).
}
```

##License

Copyright 2014 A Mediocre Corporation

Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.  You may obtain a copy of the License at

http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.  See the License for the specific language governing permissions and limitations under the License.
