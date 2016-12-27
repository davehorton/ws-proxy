'use strict';

var drachtio = require('drachtio') ;
var app = drachtio() ;
var Srf = require('drachtio-srf') ;
var srf = new Srf(app) ;
var config = require('./lib/config') ;

exports = module.exports = app ;

srf
.connect(config.drachtio) 
.on('connect', function(err, hostport) {
  console.log('connected to drachtio listening for SIP on %s', hostport) ;
})
.on('error', function(err){
  console.error('Error connecting to drachtio server: ', err.message ) ;
})
.on('reconnecting', function(opts) {
  console.error('attempting to reconect: ', opts) ;
}) ;


var Register = require('./lib/register') ;
var Registrar = require('./lib/registrar') ;
var CallProcessor = require('./lib/call-processor') ;
var Subscriber = require('./lib/subscriber') ;
var Notifier = require('./lib/notifier') ;


var register = new Register(srf) ;
var registrar = new Registrar() ;
var callProcessor = new CallProcessor(srf, config.mediaServer) ;
var subscriber = new Subscriber(srf) ;
var notifier = new Notifier(srf, registrar) ;

register
.on('register', function(contact, obj) {
  registrar.addUser( contact, obj ) ;
}) 
.on('unregister', function(contact) {
  registrar.removeUser( contact ) ;
}) ;

subscriber
.on('subscribe', function(contact, obj) {
  registrar.addSubscription( contact, obj ) ;
}) 
.on('unsubscribe', function(contact) {
  registrar.removeSubscription( contact ) ;
}) ;

register.start() ;
subscriber.start() ;
notifier.start() ;
callProcessor.start() ;

callProcessor.on('connected-call', function( dlgWebRtc, dlgSbc) {
  dlgWebRtc.once('refer', handleRefer.bind( dlgWebRtc, dlgSbc ) ) ;
  dlgSbc.once('refer', handleRefer.bind( dlgSbc, dlgWebRtc ) ) ;
}) ;

function handleRefer( dlgOther, req, res ) {
  res.send(202) ;
  dlgOther.request({
    method: 'REFER',
    headers: {
      'Refer-To': req.get('Refer-To')
    }
  });
}
