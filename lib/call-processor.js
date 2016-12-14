'use strict' ;

var Emitter = require('events').EventEmitter ;
var util = require('util') ;
var outboundCallProcessor = require('./outbound-call-processor') ;
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
      console.log('received incoming call for %s', contact) ;
      if( db.has( contact )) {
        var details = db.get( contact ) ;

        req.proxy({
          remainInDialog: true,
          followRedirects: false,
          destination: ['sip:' + details.source_address + ':' + details.source_port + ';transport=ws']
        }, function(err , results) {
          if( err ) {
            console.error('error proxying incoming invite: %s', err) ;
            return ;
          }

          console.log('result of proxying invite: %s', JSON.stringify(results)) ;
        }) ;
      }
    }
    else {
      if( !/sip.phone.com/.test( req.uri ) ) {
        return res.send(503) ;
      }
      outboundCallProcessor( self._srf, req, res, req.uri, self._mediaServer, function(err) {
        if( err ) {
          console.error('%s: error connecting call: %s', req.get('Call-Id'), err.message) ;
          return ;
        }
        console.log('%s: call successfully established') ;
      }) ;

/*
      console.log('attempting to connect to media server') ;
      self._mrf.connect({
        address: 'srf-qa-01.drachtio.org',
        port: 8021,
        secret: 'ClueCon'
      }, function(ms) {
        console.log('successfully connected to media server') ;
        ms.connectCaller( req, res, function(err, ep, dlg) {
          if( err ) {
            console.error('error creating endpoint: %s', JSON.stringify(err)) ;
            return ;
          }
          console.log('successfully connected to endpoint'); 

          setTimeout( function() {
            ep.play( 'ivr/48000/ivr-speak_to_a_customer_service_representative.wav', function(err, results) {
              if( err ) {
                console.log('error playing file: %s', err.message) ;
              }
              else {
                console.log('play results: %s', JSON.stringify(results)) ;
              }
              dlg.destroy() ;
              ep.destroy() ;
            }) ;
          }, 1000) ;
        }) ;
      }, function(err) {
        console.error('error connecting to media server: %s', JSON.stringify(err)) ;
        return res.send(503) ;
      }) ;
*/
    }
  });  
} ;
