'use strict' ;

var Emitter = require('events').EventEmitter ;
var util = require('util') ;

module.exports = exports = Subscriber ;

function Subscriber( srf ){

  if (!(this instanceof Subscriber)) { return new Subscriber(srf); }

  Emitter.call(this); 

  this.srf = srf ;

}
util.inherits(Subscriber, Emitter) ;

Subscriber.prototype.start = function() {
  var self = this ;
  this.srf.subscribe( function( req /*, res */ ) {

    console.log('UAC subscribing: %s/%s:%d', req.protocol, req.source_address, req.source_port) ;

    req.proxy({
      remainInDialog: true,
      followRedirects: true,
      destination: ['sip.phone.com;transport=udp']
    }, function(err , results) {
      if( err ) {
        console.error( 'Error attempting to proxy subscribe: ', err ) ;
      }
      if( results.finalStatus === 202 ) {

        var contactName = req.uri ;
        var transport = 'ws' ;
        var contact = req.getParsedHeader('Contact') ;
        console.log('parsed contact header from request: ', contact) ;
        var arr = /^(sip:.*);transport=(.*)$/.exec( contact[0].uri ) ;
        if( arr && arr.length > 1 ) {
          contactName = arr[1] ;
          transport = arr[2] ;
        }

        // parse subscription-state header to determine if this is a subscribe or unsubscribe
        arr = /^(.+);expires=(\d+)$/.exec( results.finalResponse.msg.headers['subscription-state'] ) ;
        var subscribe = arr && arr.length > 2 && arr[1] === 'active';
        var expires = 0 ;
        if( subscribe ) {
          expires = parseInt( arr[2] ) ;
          self.emit('subscribe', contactName, {
            uri: req.uri,
            transport: transport,
            source_address: req.source_address,
            source_port: req.source_port,
            expires: Date.now() + (expires * 1000),
            event: req.get('Event')
          }) ;
        }
        else {
          self.emit('unsubscribe', contactName) ;
        }
      }
      else {
        console.log('subscribe failed with %d', results.finalStatus) ;
      }
    }) ;  
  }); 
} ;
