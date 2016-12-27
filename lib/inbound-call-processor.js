var Mrf = require('drachtio-fsmrf') ;
var app = require('../app'); 
var mrf = new Mrf(app) ;

var async = require('async') ;

function connectToMediaServer( mediaServer, callback ) {
  var idx = 0 ;
   mrf.connect(mediaServer[idx++], 
    function(ms) {
      console.log('inbound: successfully connected to ms #%d at %s', idx, ms.address ) ;
      callback(null, ms) ;
    }, 
    function(err) {
      console.error('inbound: Error connecting to media server #%d: %s', idx, err.message ) ;
      callback(err) ;
    }
  );          
}
function inviteToWebRtcClient( srf, req, res, uri, ms, callback ) {
  var from = req.getParsedHeader('From') ;

  var opts = {
    noAck: true,
    headers: {
      'From':  (from.name  || ' ') + '<' + from.uri + '>',    // removing tag
      'To': req.get('To')
    }
  } ;
  srf.createUacDialog( uri, opts, 
    function final( err, remoteSdp, ack ) {
      if( err ) {
        console.log('inbound: invite to WebRtcClient failed with: %s', err.status) ;
        return callback(err, srf, req, res, uri, ms, remoteSdp, ack) ;
      }
      console.log('inbound: invite to WebRtcClient succeeeded, now inviting media server') ;

      callback(null, srf, req, res, uri, ms, remoteSdp, ack) ;
    },
    function provisional(response) {
      console.log('inbound: got %d (provisional response) from WebRtcClient', response.status) ;
    }
  );
}
function createWebRtcFacingEndpoint( srf, req, res, uri, ms, remoteSdp, ack, callback ) {
  ms.createEndpoint({
    remoteSdp: remoteSdp
  }, function( err, epWebRtc ) {
    if( err ) {
      console.error('inbound: %s: Error creating client-facing endpoint: ', req.get('Call-Id'), err.message) ;
      return callback(err,  srf, req, res, uri, ms) ;
    }
    //console.log('inbound: successfully allocated DTLS endpoint, now sending ACK to webrtc client with sdp: %s', epWebRtc.local.sdp) ;
    ack( epWebRtc.local.sdp, function( err, uac ){
      if( err ) {
        return callback(err,  srf, req, res, uri, ms, uac) ;
      }
      callback(null, srf, req, res, uri, ms, uac, epWebRtc) ;
    }) ;
  });  
}

function createOtherEndpoint( srf, req, res, uri, ms, uac, epWebRtc, callback ) {
  ms.createEndpoint({
    remoteSdp: req.body
  }, function( err, epOther ) {
    if( err ) {
      console.error('inbound: %s: Error creating non-WebRTc-facing endpoint: ', req.get('Call-Id'), err.message) ;
      return callback(err, srf, req, res, uri, ms, uac, epWebRtc) ;
    }
    callback(null, srf, req, res, uri, ms, uac, epWebRtc, epOther); 
  });  
}
function bridgeEndpoints( srf, req, res, uri, ms, uac, epWebRtc, epOther, callback ) {
  epWebRtc.bridge( epOther, function(err) {
    if( err ) {
      console.error('inbound: %s: Error bridging endpoints: ', req.get('Call-Id'), err) ;
      return callback(err, srf, req, res, uri, ms, uac, epWebRtc, epOther) ;
    }
    callback(null, srf, req, res, uri, ms, uac, epWebRtc, epOther);           
  }) ;
}


module.exports = function( srf, req, res, uri, mediaServer, callback ) {

  console.log('inbound call to %s', uri);

  var canceled = false ;
  req.on('cancel',function() {
    canceled = true ;
  }) ;
  async.waterfall(
    [
      connectToMediaServer.bind(null, mediaServer),
      inviteToWebRtcClient.bind(null, srf, req, res, uri),
      createWebRtcFacingEndpoint,
      createOtherEndpoint,
      bridgeEndpoints
    ], function(err, srf, req, res, uri, ms, uac, epWebRtc, epOther) {
      if( err ) {
        res.send(err.status || 480) ;
        if( epWebRtc ) { epWebRtc.destroy(); }
        if( epOther ) { epOther.destroy(); }
        if( ms ) { ms.disconnect() ; }
        return callback(err) ;
      }

      if( canceled) {
        epWebRtc.destroy() ;
        epOther.destroy() ;
        uac.destroy() ;
        req.removeAllListeners('cancel') ;
        return callback( new Error({status:487})) ;
      }

      srf.createUasDialog(req, res, {localSdp: epOther.local.sdp}, function(err, uas) {
        if( err ) {
          console.log('inbound: error sending 200 ok back to caller: %s', err.message);
          return callback(err) ;
        }

        callback(null, uas, uac, ms, epWebRtc, epOther) ;

      }) ;
  }) ;
} ;
