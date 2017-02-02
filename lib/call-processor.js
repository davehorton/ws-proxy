'use strict' ;

var Emitter = require('events').EventEmitter ;
var util = require('util') ;
var outboundCallProcessor = require('./outbound-call-processor') ;
var inboundCallProcessor = require('./inbound-call-processor') ;
var spawn = require('child_process').spawn;
var iptables = require('iptables') ;
var parseUri = require('drachtio-sip').parser.parseUri ;
var ban = true ;
var chain = 'LOGDROP';

// verify the chain exists
var cmd = spawn('sudo', ['iptables','-S', chain]);
cmd.stderr.on('data', function(buf) {
    console.error('NB: blacklisting is disabled, error listing chain LOGs: ', chain, String(buf)) ;
    ban = false ;
}) ;

module.exports = exports = CallProcessor ;

function CallProcessor( srf, mediaServer, registrar ){

  if (!(this instanceof CallProcessor)) { return new CallProcessor(srf, mediaServer, registrar); }

  Emitter.call(this); 

  console.log('mediaServer: ', mediaServer); 

  this.srf = srf ;
  this.mediaServer = mediaServer ;
  this.registrar = registrar ;
  this.calls = new Map() ;

}
util.inherits(CallProcessor, Emitter) ;

CallProcessor.prototype.start = function() {
  this.srf.invite( ( req, res ) => {

    console.log(`received invite from ${req.protocol}/${req.source_address}:${req.uri} with request uri %s` ) ;

    var user = parseUri( req.uri ).user ;

    if( this.registrar.hasUser( user ) ) {
      var details = this.registrar.getUser( user ) ;
      console.log(`inbound call with details: ${JSON.stringify(details)}`) ;
      inboundCallProcessor( this.srf, req, res, details.uri, this.mediaServer, this.registrar, (err, uas, uac,  ms, ep1, ep2) => {
        if( err ) {
          console.error(`${req.get('Call-Id')}: error connecting call: ${err.message}`) ;
          return ;
        }
        this.setHandlers( uas, uac, ms, ep1, ep2 ) ;
      }) ;
    }
    else if( 'udp' === req.protocol ) {
      // outbound call, but it is coming via UDP.  We only allow outbound calls via WSS
      console.error(`banning ${req.source_address}:${req.source_port} due to unauthorized attempt to ${req.uri}`) ;
      if( ban ) {
        iptables.drop({
          chain: chain,
          src: req.source_address,
          sudo: true
        }) ;        
      }
    }
    else {
      outboundCallProcessor( this.srf, req, res, req.uri, this.mediaServer, this.registrar, (err, uas, uac, ms, ep1, ep2) => {
        if( err ) {
          if( err.status !== 401 && err.status !== 407 ) {
            console.error(`${req.get('Call-Id')}: error connecting call: ${err.status}`) ;
          }
          return ;
        }
        this.setHandlers( uas, uac, ms, ep1, ep2 ) ;
      }) ;
    }
  });  
} ;


CallProcessor.prototype.setHandlers = function( uas, uac, ms, ep1, ep2 ) {
  var key = makeReplacesStr(uas) ;
  var value = makeReplacesStr(uac) ;
  this.calls.set(key, value) ;

  console.log(`after adding call there are now ${this.calls.size} calls in progress`);

  uas.on('destroy', this._onDestroy.bind( this, uas, uac, ms, ep1, ep2 )) ;
  uac.on('destroy', this._onDestroy.bind( this, uac, uas, ms, ep1, ep2 )) ;

  uas.once('refer', this._handleRefer.bind( this, uas, uac ) ) ;
  uac.once('refer', this._handleRefer.bind( this, uac, uas ) ) ;

  uas.on('hold', this._hold.bind( this, uas, uac, ep1, ep2 )) ;
  uac.on('hold', this._hold.bind( this, uac, uas,  ep1, ep2 )) ;

  uas.on('unhold', this._unhold.bind( this, uas, uac, ep1, ep2 )) ;
  uac.on('unhold', this._unhold.bind( this, uac, uas, ep1, ep2 )) ;

  uas.on('info', this._handleInfo.bind( this, uas, uac, ep1, ep2 ) ) ;
  uac.on('info', this._handleInfo.bind( this, uac, uas, ep2, ep1 ) ) ;


} ;

CallProcessor.prototype._onDestroy = function( dlg, dlgOther, ms, ep1, ep2 ) {

  var key = makeReplacesStr(dlg) ;
  if( this.calls.has( key ) ) {
    this.calls.delete( key );
  }
  else {
    key = makeReplacesStr(dlgOther) ;
    if( this.calls.has( key ) ) {
      this.calls.delete( key );
    }
    else {
      console.error(`key ${key} not found`);
    }
  }
  [dlgOther, ep1, ep2].forEach( function(e) { e.destroy(); }) ;
  ms.disconnect() ;

  console.log(`after ending call there are now ${this.calls.size} calls in progress`);

} ;

CallProcessor.prototype._handleRefer = function( dlg, dlgOther, req, res  ) {
  var referTo = req.get('Refer-To') ;
  var arr = /(.*)Replaces=(.*)>/.exec(referTo) ;

  if( arr && arr.length > 1 ) {

    // attended transfer: fixup the Replaces part of the Refer-To header
    var key = arr[2] ;
    if( key in this._calls ) {
      referTo = arr[1] + 'Replaces=' + this._calls[key] + '>' ;
    }
    else {
      console.error(`attended transfer but we cant find ${key}`);
    }
  }

  dlgOther.request({
    method: 'REFER',
    headers: {
      'Refer-To': referTo
    }
  });

  res.send(202);
} ;

CallProcessor.prototype._hold = function( dlg, dlgOther, ep1 /*, ep2 */) {
  ep1.unbridge( function(err) {
    if( err ) {
      console.error(`Error unbridging endpoints when going on hold: ${err}`) ;
    }
  }); 
} ;

CallProcessor.prototype._unhold = function( dlg, dlgOther, ep1, ep2 ) {
  ep1.bridge( ep2, function(err) {
    if( err ) {
      console.error(`Error bridging endpoints back together after unhold: ${err}`) ;
    }
  }); 
} ;

CallProcessor.prototype._handleInfo = function( dlg, dlgOther, ep1, ep2, req, res ) {
  console.log('received info with content-type: %s', req.get('Content-Type'));
  res.send(200) ;

  if( req.get('Content-Type') === 'application/media_control+xml' ) {
    console.log('forwarding to freeswitch ');
    dlgOther.request({
      method: 'INFO',
      headers: {
        'Content-Type': req.get('Content-Type'),
      },
      body: req.body
    });
  }
} ;


function makeReplacesStr( dlg ) {
  var s = '';
  if( dlg.type === 'uas') {
    s = encodeURIComponent( dlg.sip.callId + ';to-tag=' + dlg.sip.localTag + ';from-tag=' + dlg.sip.remoteTag ) ;
  }
  else {
    s = encodeURIComponent( dlg.sip.callId  + ';to-tag=' + dlg.sip.remoteTag + ';from-tag=' + dlg.sip.localTag ) ;    
  }
  return s ;
}
