'use strict' ;


var Emitter = require('events').EventEmitter ;
var util = require('util') ;
var _ = require('lodash') ;

module.exports = exports = Registrar ;

function Registrar(){

  if (!(this instanceof Registrar)) { return new Registrar(); }

  Emitter.call(this); 

  this.users = {} ;
  this.subscriptions = {} ;

}
util.inherits(Registrar, Emitter) ;

// Users 
Registrar.prototype.addUser = function( contact, obj ) {
  this.users[contact] = obj ;
  console.log('received a register for %s: %s, there are now %d users', contact, JSON.stringify(obj), _.size(this.users)) ;

} ;
Registrar.prototype.removeUser = function( contact ) {
  delete this.users[contact]  ;
  console.log('received an unregister for %s, there are now %d users', contact, _.size(this.users)) ;
}; 
Registrar.prototype.hasUser = function( contact ) {
  return contact in this.users ;
} ;
Registrar.prototype.getUser = function( contact ) {
  return this.users[contact] ;
}; 

// Subscriptions
Registrar.prototype.addSubscription = function( contact, obj ) {
  this.subscriptions[contact] = obj ;
  console.log('received a subscribe for %s: %s, there are now %d subscriptions', contact, JSON.stringify(obj), _.size(this.subscriptions)) ;
} ;
Registrar.prototype.removeSubscription = function( contact ) {
  delete this.subscriptions[contact]  ;
  console.log('received an unsubscribe for %s, there are now %d subscriptions', contact, _.size(this.subscriptions)) ;
}; 
Registrar.prototype.hasSubscription = function( contact ) {
  return contact in this.subscriptions ;
} ;
Registrar.prototype.getSubscription = function( contact ) {
  return this.subscriptions[contact] ;
}; 