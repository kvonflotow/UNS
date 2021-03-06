const util = require( 'util' )

const dgram = require( 'dgram' )

const path = require( 'path' )

const root_dir = require( 'app-root-dir' ).get()

const noop = require( 'no-op' )

const UNS = require( path.join( root_dir, 'src' ) )

UNS.Connection.UDP = function ( conf )
{
  // allow overrides - provide defaults first
  conf = UNS.fn.mergeDeep(
    {
      transport: () => dgram.createSocket( 'udp4' )
    },

    conf || {}
  )

  // don't allow override of this value
  conf.type = 'udp'

  UNS.Connection.call( this, conf )
}

util.inherits( UNS.Connection.UDP, UNS.Connection )

UNS.Connection.UDP.prototype.init = function ()
{
  // call parent
  UNS.Connection.prototype.init.call( this )

  if ( !this.transport )
  {
    throw new Error( 'INVALID_TRANSPORT' )
  }

  this.transport.on( 'close', () => this.emit( 'disconnected' ) )

  this.transport.on( 'error', err => this.emit( 'error', err ) )

  this.transport.on( 'listening', () => this.emit( 'connected' ) )

  // parse the message
  this.transport.on( 'message', ( message, info ) =>
    {
      this.stack.in = Buffer.concat( [ this.stack.in, message ], this.stack.in.length + message.length )

      this.processIncomingStack( err =>
        {
          if ( err )
          {
            throw err
          }


        }
      )
    }
  )
}

UNS.Connection.UDP.prototype.connect = function ( callback = noop )
{
  if ( !this.transport )
  {
    return process.nextTick( callback.bind( null, [ new Error( 'INVALID_TRANSPORT' ) ] ) )
    // return callback( new Error( 'INVALID_TRANSPORT' ) )
  }

  this.transport.bind( this.getIncomingPort(), err =>
    {
      if ( err )
      {
        return callback( err )
      }

      this.stack.interval.out = setInterval( this.processOutgoingStack.bind( this ), this.conf.rate )
    }
  )
}

UNS.Connection.UDP.prototype.disconnect = function ( callback = noop )
{
  if ( !this.transport )
  {
    return process.nextTick( callback )
    // return callback()
  }

  this.transport.close( callback )
}

UNS.Connection.UDP.prototype.processOutgoingStack = function ( callback = noop )
{
  if ( !this.stack.out.length )
  {
    return process.nextTick( callback ) // stack is empty
  }

  this.transport.send( this.stack.out, this.getOutgoingPort(), this.getHost(), err =>
    {
      if ( err )
      {
        return callback( err )
      }

      this.stack.out = Buffer.alloc( 0 )

      callback()
    }
  )
}

UNS.Connection.UDP.prototype.send = function ( key, value, callback = noop )
{
  if ( !this.transport )
  {
    return process.nextTick( callback.bind( null, [ new Error( 'INVALID_TRANSPORT' ) ] ) )
    // return callback( new Error( 'INVALID_TRANSPORT' ) )
  }

  let obj = {}, message, err

  obj[ key ] = value

  try
  {
    message = JSON.stringify( obj )
  }

  catch ( e )
  {
    err = e
  }

  if ( err )
  {
    UNS.logger.error( err )

    return process.nextTick( callback.bind( null, [ new Error( 'INVALID_DATA' ) ] ) )
    // return callback( err )
  }

  if ( !message )
  {
    return process.nextTick( callback.bind( null, [ new Error( 'INVALID_DATA' ) ] ) )
    // return callback( new Error( 'INVALID_DATA' ) )
  }

  let message_bytes = Buffer.byteLength( message )

  let buf = Buffer.alloc( 4 + message_bytes )

  // write number of bytes to first 4 bytes
  buf.writeUInt32LE( message_bytes, 0, 4 )

  // write message to buffer
  buf.write( message, 4 )

  this.stack.out = Buffer.concat( [ this.stack.out, buf ], this.stack.out.length + buf.length )

  process.nextTick( callback )
}

module.exports = UNS.Connection.UDP
