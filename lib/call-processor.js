'use strict' ;

var Emitter = require('events').EventEmitter ;
var util = require('util') ;
var outboundCallProcessor = require('./outbound-call-processor') ;
var inboundCallProcessor = require('./inbound-call-processor') ;
var callCount = 0 ;

module.exports = exports = CallProcessor ;

function CallProcessor( srf, mediaServer ){

  if (!(this instanceof CallProcessor)) { return new CallProcessor(srf, mediaServer); }

  Emitter.call(this); 

  console.log('mediaServer: ', mediaServer); 

  this._srf = srf ;
  this._mediaServer = mediaServer ;

}
util.inherits(CallProcessor, Emitter) ;

CallProcessor.prototype.start = function() {
  var self = this ;
  this._srf.invite( function( req, res ) {

    console.log('received invite from %s/%s:%s with request uri %s', req.protocol, req.source_address, req.source_port, req.uri) ;

    if( -1 !== req.uri.indexOf('.invalid') ) {
      inboundCallProcessor( self._srf, req, res, req.uri, self._mediaServer, function(err, uas, uac,  ms, ep1, ep2) {
        if( err ) {
          console.error('%s: error connecting call: %s', req.get('Call-Id'), err.message) ;
          return ;
        }

        self.emit('connected-call', uac, uas) ; //webrtc-facing dialog first
        cleanup( uas, uac, ms, ep1, ep2 ) ;
      }) ;
    }
    else {
      outboundCallProcessor( self._srf, req, res, req.uri, self._mediaServer, function(err, uas, uac, ms, ep1, ep2) {
        if( err ) {
          console.error('%s: error connecting call: %s', req.get('Call-Id'), err.message) ;
          return ;
        }

        self.emit('connected-call', uas, uac) ; //webrtc-facing dialog first
        cleanup( uas, uac, ms, ep1, ep2 ) ;
      }) ;
    }
  });  
} ;


function cleanup( dlg1, dlg2, ms, ep1, ep2 ) {
  console.log('call connected, number of calls now %d', ++callCount) ;
  dlg1.on('destroy', onDestroy.bind( dlg1, dlg2, ms, ep1, ep2 )) ;
  dlg2.on('destroy', onDestroy.bind( dlg2, dlg1, ms, ep1, ep2 )) ;

}

function onDestroy( dlg, ms, ep1, ep2 ) {
  console.log('call ended, number of calls now %d', --callCount) ;
  [dlg, ep1, ep2].forEach( function(e) { e.destroy(); }) ;
  ms.disconnect() ;
}