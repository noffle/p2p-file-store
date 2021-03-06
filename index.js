module.exports = MediaStore

var Store = require('fs-blob-store')
var path = require('path')
var walk = require('fs-walk')
var fs = require('fs')
var mkdirp = require('mkdirp')
var debug = require('debug')('p2p-file-store')

var missing = require('./missing')
var replication = require('./replication')

function noop () {}

function MediaStore (dir, opts) {
  if (!(this instanceof MediaStore)) return new MediaStore(dir, opts)

  // TODO: expose whether to use subdirs opt
  // TODO: expose subdir prefix length opt
  // TODO: expose whether to use a 'staging' subdir

  this._dir = dir
  this._stores = {}
}

MediaStore.prototype._getStore = function (subdir) {
  if (!this._stores[subdir]) {
    this._stores[subdir] = Store(path.join(this._dir, subdir))
  }
  return this._stores[subdir]
}

MediaStore.prototype._list = function (cb) {
  var names = []
  walk.files(this._dir, function (basedir, filename, stat, next) {
    if (!basedir.endsWith('staging')) names.push(filename)
    next()
  }, function (err) {
    if (err && err.code === 'ENOENT') cb(null, [])
    else cb(err, names)
  })
}

MediaStore.prototype.createReadStream = function (name) {
  var subdir = filenamePrefix(name, 7)
  var store = this._getStore(subdir)
  return store.createReadStream(name)
}

// TODO: opts to choose whether to use staging area
MediaStore.prototype.createWriteStream = function (name, done) {
  var self = this
  done = done || noop

  var stagingStore = this._getStore('staging')
  var ws = stagingStore.createWriteStream(name)
  ws.on('finish', onFinish)
  ws.on('error', done || noop)
  return ws

  function onFinish () {
    var subdir = filenamePrefix(name, 7)

    // write result to destination
    var from = path.join(self._dir, 'staging', name)
    var to = path.join(self._dir, subdir, name)

    debug('gonna rename', from, to)
    mkdirp(path.join(self._dir, subdir), function (err) {
      if (err) return done(err)
      fs.rename(from, to, function (err) {
        debug('renamed')
        done(err)
      })
    })
  }
}

MediaStore.prototype.replicateStore = function (otherStore, opts, done) {
  if (typeof opts === 'function' && !done) {
    done = opts
    opts = null
  }
  opts = opts || {}

  var pending = 2
  var self = this
  done = done || noop

  var progressFn = opts.progressFn || noop
  var filesLeftToXfer = 0
  var filesToXfer = 0

  this._list(function (err, myNames) {
    if (err) return done(err)
    filesToXfer += myNames.length
    otherStore._list(function (err, yourNames) {
      if (err) return done(err)
      filesToXfer += yourNames.length
      filesLeftToXfer = filesToXfer

      var myWant = missing(myNames, yourNames)
      debug('I want', myWant)
      xferAll(otherStore, self, myWant, function (err) {
        // TODO: catch + return error(s)
        if (--pending === 0) return done(err)
      })

      var yourWant = missing(yourNames, myNames)
      debug('you want', yourWant)
      xferAll(self, otherStore, yourWant, function (err) {
        // TODO: catch + return error(s)
        if (--pending === 0) return done(err)
      })
    })
  })

  function xfer (from, to, name, fin) {
    debug('gonna xfer', name)

    var ws = to.createWriteStream(name, onFinish)
    from.createReadStream(name).pipe(ws)

    debug('xferring', name)

    function onFinish (err) {
      debug('xferred', name, err)
      fin(err)
    }
  }

  function xferAll (from, to, names, fin) {
    if (names.length === 0) {
      debug('done xferring')
      return fin()
    }

    var next = names.pop()
    xfer(from, to, next, function (err) {
      filesLeftToXfer--
      progressFn(1 - filesLeftToXfer / filesToXfer)

      if (err) fin(err)
      else xferAll(from, to, names, fin)
    })
  }
}

MediaStore.prototype.replicateStream = function (opts) {
  return replication(this, opts)
}

// String, Number -> String
function filenamePrefix (name, prefixLen) {
  return name.substring(0, Math.min(prefixLen, name.lastIndexOf('.')))
}
