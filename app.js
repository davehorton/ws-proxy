'use strict';

var drachtio = require('drachtio') ;
var app = drachtio() ;
var Srf = require('drachtio-srf') ;
var srf = new Srf(app) ;
var config = require('./lib/config') ;
app.transports = [] ;

exports = module.exports = app ;

srf.connect(config.drachtio) 
.on('connect', function(err, hostport) { console.log('connected to drachtio listening for SIP on %s', hostport) ; })
.on('error', function(err){ console.error('Error connecting to drachtio server: ', err.message ) ; })
.on('reconnecting', function(opts) { console.error('attempting to reconect: ', opts) ; }) ;

var Register = require('./lib/register') ;
var Registrar = require('./lib/registrar') ;
var CallProcessor = require('./lib/call-processor') ;
var Subscriber = require('./lib/subscriber') ;

var registrar = new Registrar() ;
var register = new Register(srf, registrar) ;
var callProcessor = new CallProcessor(srf, config.mediaServer, registrar) ;
var subscriber = new Subscriber(srf, registrar) ;

register.start() ;
subscriber.start() ;
callProcessor.start() ;
