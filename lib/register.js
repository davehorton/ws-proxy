'use strict' ;

var Emitter = require('events').EventEmitter ;
var util = require('util') ;
var mw = require('drachtio-mw-registration-parser') ;
var parseUri = require('drachtio-sip').parser.parseUri ;
var stringifyContact = require('./utils').stringifyContact ;
var isValidRegister = require('./utils').isValidRegister ;

module.exports = exports = Register ;

function Register( srf, registrar ){

  if (!(this instanceof Register)) { return new Register(srf); }

  Emitter.call(this); 

  this.srf = srf ;
  this.registrar = registrar ;

}
util.inherits(Register, Emitter) ;

Register.prototype.start = function() {
  this.srf.register( mw, function( req, res) {

    console.log('UAC registering: %s/%s:%d with uri %s', req.protocol, req.source_address, req.source_port, req.uri) ;

    var callid = req.get('Call-Id');

    if( !isValidRegister( req ) ) {
      console.log('invalid register request') ;
      return res.send(503);
    }
    var instanceId = req.registration.contact[0].params['+sip.instance'] ;
    var regId = req.registration.contact[0].params['reg-id'] ;
    var uri = parseUri( req.uri ) ;

    var headers = {} ;

    // check if we have a call-id / cseq that we are using for this transaction
    var obj = this.registrar.getNextCallIdAndCSeq( callid ) ;
    if( obj ) {
      Object.assign( headers, obj ) ;
    }
    else {
      Object.assign( headers, {'CSeq': '1 REGISTER'}) ;
    }

    ['from','to','authorization','supported','allow','user-agent'].forEach( function(hdr) { if( req.has(hdr) ) { headers[hdr] = req.get(hdr) ; }}) ;

    var uacContact = req.getParsedHeader('Contact') ;
    var from = req.getParsedHeader('From') ;
    console.log('From: %s', JSON.stringify(from));
    var user = parseUri( from.uri ).user ;

    headers.contact = '<sip:' + user + '@localhost>;expires=' + req.registration.expires ;

    this.srf.request({
        uri: req.uri,
        method: req.method,
        headers: headers
      },
      function( err, request ) {
        if( err ) { 
          return console.error('Error forwarding register to %s: ', uri.host, err );
        }
        request.on('response', function(response) { 
          headers = {} ;
          ['www-authenticate'].forEach( function(hdr) { if( response.has(hdr) ) { headers[hdr] = response.get(hdr) ; } }) ;

          // construct a contact header 
          var expires, contact ;
          if( response.has('Contact') ) {
            contact = response.getParsedHeader('Contact') ;
            expires = parseInt( contact[0].params.expires ) ;
            uacContact[0].params.expires = expires ;

            headers.contact = stringifyContact( uacContact ) ;            
          }

          res.send(response.status, response.reason, {
            headers: headers
          }) ;

          if( 200 === response.status ) {

            var arr = /^(sip:.*);transport=(.*)$/.exec( req.registration.contact[0].uri ) ;
            if( arr && arr.length > 1 ) {

              var via = req.getParsedHeader('Via') ;
              var transport = (via[0].protocol).toLowerCase() ;

              if( 'register' === req.registration.type ) {
                this.registrar.addUser( user, {
                  expires: Date.now() + (expires * 1000),
                  transport: transport,
                  source_address: req.source_address,
                  source_port: req.source_port,
                  uri: arr[1] ,
                  instanceId:instanceId,
                  regId: regId,
                  aor: req.registration.aor
                }) ;   
                if( !this.registrar.hasTransaction( callid ) ) {
                  this.registrar.addTransaction({
                    aCallId: callid,
                    bCallId: response.get('Call-Id'),
                    bCseq: response.get('CSeq')
                  }) ;
                }              
              }
              else {
                this.registrar.removeUser( user) ;
                this.registrar.removeTransaction( req.get('call-id') ) ;
              }
            }
          }
          else if( [401,407].indexOf( response.status ) !== -1 ) {
            this.registrar.addTransaction({
              aCallId: callid,
              bCallId: response.get('Call-Id'),
              bCseq: response.get('CSeq')
            }) ;
          }
          else {
            console.log(`register failed with ${response.status}`) ;
          }
        }.bind(this)) ;
      }.bind(this));
  }.bind(this));
} ;
