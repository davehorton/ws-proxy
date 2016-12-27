'use strict' ;

var Emitter = require('events').EventEmitter ;
var util = require('util') ;

module.exports = exports = Notifier ;

function Notifier( srf, registrar ){

  if (!(this instanceof Notifier)) { return new Notifier(srf, registrar); }

  Emitter.call(this); 

  this.srf = srf ;
  this.registrar = registrar ;

}
util.inherits(Notifier, Emitter) ;

Notifier.prototype.start = function() {
  var self = this ;
  this.srf.notify( function( req , res ) {

    console.log('received a notify: %s from %s/%s:%d', req.uri, req.protocol, req.source_address, req.source_port) ;


    if( self.registrar.hasSubscription( req.uri ) ) {
      console.log('found subscription') ;
    }
    else {
      console.log('could not find subscription') ;
    }
    res.send(200) ;


  }); 
} ;
