'use strict' ;

var Emitter = require('events').EventEmitter ;
var util = require('util') ;
var outboundCallProcessor = require('./outbound-call-processor') ;
var inboundCallProcessor = require('./inbound-call-processor') ;
module.exports = exports = CallProcessor ;

function CallProcessor( srf, mediaServer ){

  if (!(this instanceof CallProcessor)) { return new CallProcessor(srf, mediaServer); }

  Emitter.call(this); 

  console.log('mediaServer: ', mediaServer); 

  this._srf = srf ;
  this._mediaServer = mediaServer ;

}
util.inherits(CallProcessor, Emitter) ;

CallProcessor.prototype.start = function( db ) {
  var self = this ;
  this._srf.invite( function( req, res ) {

    console.log('received invite from %s/%s:%s with request uri %s', req.protocol, req.source_address, req.source_port, req.uri) ;

    var arr = /^(sip:.*);transport=(.*)$/.exec( req.uri ) ;
    if( arr && arr.length > 2 ) {
      var contact = arr[1] ;
      if( db.hasUser( contact )) {
        inboundCallProcessor( self._srf, req, res, req.uri, self._mediaServer, function(err) {
          if( err ) {
            console.error('%s: error connecting call: %s', req.get('Call-Id'), err.message) ;
            return ;
          }
          console.log('%s: incoming call successfully established') ;
        }) ;
      }
    }
    else {
      //if( !/sip.phone.com/.test( req.uri ) ) {
      //  return res.send(503) ;
      //}
      outboundCallProcessor( self._srf, req, res, req.uri, self._mediaServer, function(err) {
        if( err ) {
          console.error('%s: error connecting call: %s', req.get('Call-Id'), err.message) ;
          return ;
        }
        console.log('%s: outbound call successfully established') ;
      }) ;
    }
  });  
} ;
