'use strict' ;

var parseUri = require('drachtio-sip').parser.parseUri ;

module.exports = exports = Subscriber ;

function Subscriber( srf, registrar ){

  if (!(this instanceof Subscriber)) { return new Subscriber(srf, registrar); }

  this.srf = srf ;
  this.registrar = registrar ;
}

Subscriber.prototype.start = function() {

  this.srf.subscribe( ( req, res ) => {

    console.log('UAC subscribing: %s/%s:%d', req.protocol, req.source_address, req.source_port) ;

    // only registered users are allowed to subscribe
    var from = req.getParsedHeader('from') ;
    var fromUser = parseUri( from.uri ).user ;

    if( !this.registrar.hasUser( fromUser ) ) {
      console.log(`invalid user ${fromUser} attempting to subscribe`) ;
      return res.send(503);
    }

    this.srf.createBackToBackDialogs( req, res, req.uri, {
      method: 'SUBSCRIBE',
      proxyRequestHeaders: ['event','expires','allow'],
      proxyResponseHeaders: ['subscription-state','expires','allow-events']
    }, (err) => {
      if( err ) {
        return console.error('Error establishing subscribe dialog: ', err) ;
      }
    }) ;
  });
} ;
