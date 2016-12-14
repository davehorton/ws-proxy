var Mrf = require('drachtio-fsmrf') ;
var app = require('../app'); 
var mrf = new Mrf(app) ;
var async = require('async') ;

// iterate through available media servers until we successfully connect and create two endpoints, or exhaust all media servers
function connectAndCreateEndpointPair( req, mediaServer, callback ) {
  var exhaustedMediaServers = false ;
  var idx = 0 ;
  var haveResources = false ;

  async.doUntil(
    function tryNext(callback) {
      async.waterfall([
        function connectToMs( callback ) {
          mrf.connect(mediaServer[idx++], 
            function(ms) {
              console.log('%s: successfully connected to ms #%d at %s', req.get('Call-Id'), idx, ms.address ) ;
              callback(null, req, ms) ;
            }, 
            function(err) {
              console.error('%s: Error connecting to media server #%d: %s', req.get('Call-Id'), idx, err.message ) ;
              callback(err) ;
            }
          );          
        }, 
        function allocateUas( req, ms, callback ) {
          ms.createEndpoint({
            remoteSdp: req.body
          }, function( err, ep ) {
            if( err ) {
              console.error('%s: Error creating UAS-facing endpoint: ', req.get('Call-Id'), err.message) ;
              return callback(err) ;
            }
            callback(null, ms, ep); 
          }); 
        }, 
        function allocateUac( ms, epUas, callback ) {
          ms.createEndpoint(function( err, ep ) {
            if( err ) {
              console.error('%s: Error creating UAC-facing endpoint: ', req.get('Call-Id'), err.message) ;
              epUas.destroy() ;
              return callback(err) ;
            }
            callback(null, ms, epUas, ep); 
          }); 
        }
      ], 
      function(err, ms, epUas, epUac) {
        if( err ) {

          // try next media server, if any
          if( idx === mediaServer.length ) {
            exhaustedMediaServers = true ;

          }
          callback(exhaustedMediaServers ? new Error('no available media servers') : null) ;
        }
        else {
          haveResources = true ;
          callback( null, ms, epUas, epUac ) ;
        }
      }); 
    }, 
    function test() {
      return haveResources || exhaustedMediaServers ;
    }, 
    function wrapUp(err, ms, epUas, epUac) {
      if( err ) {
        return callback(err) ;
      }
      return callback( null, ms, epUas, epUac ) ;
    }
  ) ;
}

module.exports = function( srf, req, res, sbc, mediaServer, callback ) {

  console.log('%s: received valid incoming call attempt', req.get('Call-Id')) ;

  async.waterfall([
    connectAndCreateEndpointPair.bind( this, req, mediaServer ),

    function bridgeEndpoints(ms, epUas, epUac, callback) {
      epUas.bridge( epUac, function(err) {
        if( err ) {
          console.error('%s: Error bridging endpoints: ', req.get('Call-Id'), err) ;
          epUac.destroy() ;
          epUas.destroy() ;
          return callback(err) ;
        }
        console.log('successfully bridged endpoints');
        callback(null, ms, epUas, epUac);         
      }) ;
    }
    ], function(err, ms, epUas, epUac) {
      if( err ) {
        return callback( err ) ;
      }

      console.log('%s: established media, outdialing SBC..', req.get('Call-Id')) ;

      var uacRemoteSdp ;

      srf.createBackToBackDialogs( req, res, sbc, {
        localSdpA: epUas.local.sdp,
        localSdpB: epUac.local.sdp, 
        proxyRequestHeaders: ['Proxy-Authorization','Supported','Allow','Content-Type','User-Agent'],
        proxyResponseHeaders: ['Proxy-Authenticate','Accept','Allow','Allow-Events'],
        onProvisional: function( provisionalResponse ) {
          if( provisionalResponse.body !== uacRemoteSdp ) {
            console.log('modifying freeswitch endpoint to stream to far end SBC endpoint returned in %d from SBC', provisionalResponse.status) ;
            epUac.modify( provisionalResponse.body ) ;
            uacRemoteSdp = provisionalResponse.body ;
          }
          else {
            console.log('received additional provisional response %d with no change in SDP, not modifying freeswitch endpoint', provisionalResponse.status) ;
          }
        }
      }, function( err, uasDialog, uacDialog ) {
        if( err ) {
          if( err.status === 487 ) {
            console.log('%s: caller hung up before answer', req.get('Call-Id')) ;
          }
          else if( err.status === 407 ) {
            console.log('%s: call was challenged for credentials', req.get('Call-Id')) ;
          }
          else {
            console.error('%s: error completing call: ', req.get('Call-Id'), err) ;
          }

          epUac.destroy() ;
          epUas.destroy() ;
          return callback(new Error(err));
        }
        console.log('%s: successfully connected call', uasDialog.sip.callId) ;
        
        epUac.modify( uacDialog.remote.sdp ) ;

        uasDialog.on('destroy', onDestroy.bind( uasDialog, uacDialog, ms, epUas, epUac )) ;
        uacDialog.on('destroy', onDestroy.bind( uacDialog, uasDialog, ms, epUas, epUac )) ;

        callback(null) ;

      }) ;
    }
  ) ;
} ;

function onDestroy( other, ms, epUas, epUac ) {
  var uas = this ;
  if('uas' === other.type ) { uas = other ; }
  if( ms.timeout ) {
    clearTimeout( ms.timeout ) ;
    delete ms.timeout ;
  }

  [other, epUac, epUas].forEach( function(e) { e.destroy(); }) ;
  ms.disconnect() ;
}
