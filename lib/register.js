'use strict' ;

var Emitter = require('events').EventEmitter ;
var util = require('util') ;
var mw = require('drachtio-mw-registration-parser') ;

module.exports = exports = Register ;

function Register( srf ){

  if (!(this instanceof Register)) { return new Register(srf); }

  Emitter.call(this); 

  this.srf = srf ;

}
util.inherits(Register, Emitter) ;

Register.prototype.start = function() {
  var self = this ;
  this.srf.register( mw, function( req /*, res */ ) {

    console.log('UAC registering: %s/%s:%d', req.protocol, req.source_address, req.source_port) ;

    req.proxy({
      remainInDialog: true,
      followRedirects: true,
      destination: ['sip.phone.com;transport=udp']
    }, function(err , results) {
      if( err ) {
        console.error( 'Error attempting to proxy: ', err ) ;
      }
      if( results.finalStatus === 200 ) {

        var arr = /^(sip:.*);transport=(.*)$/.exec( req.registration.contact[0].uri ) ;
        if( arr && arr.length > 1 ) {
          var contactName = arr[1] ;
          var transport = arr[2] ;

          if( 'register' === req.registration.type ) {
            self.emit('register', contactName, {
              expires: Date.now() + (req.registration.expires * 1000),
              transport: transport,
              source_address: req.source_address,
              source_port: req.source_port,
              instanceId: req.registration.contact[0].params['+sip.instance'],
              regId: req.registration.contact[0].params['reg-id'],
              aor: req.registration.aor
            }) ;            
          }
          else {
            self.emit('unregister', contactName) ;
          }
        }
      }
      else {
        console.log('register failed with %d', results.finalStatus) ;
      }
    }) ;  
  });  
} ;
