# p2p-file-store

> Filesystem-based blob store that syncs to other fs-based blob stores.

## Usage

```js
var MediaStore = require('p2p-file-store')
var fs = require('fs')

var store1 = MediaStore('/tmp/media-one')
var store2 = MediaStore('/tmp/media-two')

var pending = 2

var ws1 = store1.createWriteStream('foo_bar.png', doneWriting)
ws1.end('hello')

var ws2 = store2.createWriteStream('baz_bax.png', doneWriting)
ws2.end('greetings')

function doneWriting () {
  if (--pending === 0) {
    replicate()
  }
}

function replicate () {
  store1.replicateStore(store2, function (err) {
    store2.createReadStream('foo_bar.png').pipe(process.stdout)
  })
}
```

outputs

```
hello
```

## API

```js
var MediaStore = require('p2p-file-store')
```

### var store = new MediaStore(dir)

Creates a new file store at the given directory path `dir`. This directory and
any needed subdirectories will be created automatically as needed.

### var rs = store.createReadStream(name)

Create a Readable stream of the contents of the file named `name`.

### var ws = store.createWriteStream(name[, cb])

Create a Writable stream that will store the file named `name`. The callback
`cb` is called when all filesystem operations are completed, or there was an
error, with the signature `function (err) { ... }`.

### store.replicateStore(otherStore[, cb])

Replicate this store with another store. All files in `store` that is not in
`otherStore` will be transferred to `otherStore`, and vice-versa.

The callback `cb` is called on completion or error, with the signature `function
(err) { ... }`.

## Install

With [npm](https://npmjs.org/) installed, run

```
$ npm install p2p-file-store
```

## License

ISC

