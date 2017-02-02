'use strict' ;


var Emitter = require('events').EventEmitter ;
var util = require('util') ;

module.exports = exports = Registrar ;

function Registrar(){

  if (!(this instanceof Registrar)) { return new Registrar(); }

  Emitter.call(this); 

  this.users = new Map() ;
  this.transactions = new Map() ;

}
util.inherits(Registrar, Emitter) ;

// Users 
Registrar.prototype.addUser = function( user, obj ) {
  this.users.set( user, obj ) ;
  console.log(`added user ${user}, there are now ${this.users.size} users`) ;
} ;
Registrar.prototype.removeUser = function( user ) {
  this.users.delete( user )  ;
  console.log(`received an unregister for user ${user}, there are now ${this.users.size} users`) ;
}; 
Registrar.prototype.hasUser = function( user ) {
  return this.users.has( user ) ;
} ;
Registrar.prototype.getUser = function( user ) {
  return this.users.get( user ) ;
}; 

// SIP transactions; tracked for the purpose of setting proper cseq and call-id on challenged requests
Registrar.prototype.addTransaction = function(c) {
  this.transactions.set(c.aCallId, c) ;
  console.log(`added transaction ${c.aCallId}, now have ${this.transactions.size}`) ;
};
Registrar.prototype.getNextCallIdAndCSeq = function(callid) {
  var obj = this.transactions.get(callid) ;
  if( obj ) {
    var arr = /^(\d+)\s+(.*)$/.exec( obj.bCseq ) ;
    if( arr ) {
      obj.bCseq = (++arr[1]) + ' ' + (arr[2] ) ;
      return {
        'Call-Id': obj.bCallId,
        'CSeq': obj.bCseq 
      };
    }
  }
} ;
Registrar.prototype.hasTransaction = function(callid) {
  return this.transactions.has(callid) ;
} ;
Registrar.prototype.removeTransaction = function(callid) {
  this.transactions.delete( callid ) ;
  console.log(`removed transaction ${callid}, now have ${this.transactions.size}`) ;
} ;
 