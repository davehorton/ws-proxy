'use strict' ;

var Emitter = require('events').EventEmitter ;
var util = require('util') ;
var outboundCallProcessor = require('./outbound-call-processor') ;
var inboundCallProcessor = require('./inbound-call-processor') ;
var _ = require('lodash') ;

module.exports = exports = CallProcessor ;

function CallProcessor( srf, mediaServer ){

  if (!(this instanceof CallProcessor)) { return new CallProcessor(srf, mediaServer); }

  Emitter.call(this); 

  console.log('mediaServer: ', mediaServer); 

  this._srf = srf ;
  this._mediaServer = mediaServer ;
  this._calls = {} ;

}
util.inherits(CallProcessor, Emitter) ;

CallProcessor.prototype.start = function() {
  this._srf.invite( function( req, res ) {

    console.log('received invite from %s/%s:%s with request uri %s', req.protocol, req.source_address, req.source_port, req.uri) ;

    if( -1 !== req.uri.indexOf('.invalid') ) {
      inboundCallProcessor( this._srf, req, res, req.uri, this._mediaServer, function(err, uas, uac,  ms, ep1, ep2) {
        if( err ) {
          console.error('%s: error connecting call: %s', req.get('Call-Id'), err.message) ;
          return ;
        }

        this.emit('connected-call', uac, uas) ; //webrtc-facing dialog first
        this.setHandlers( uas, uac, ms, ep1, ep2 ) ;
      }.bind(this)) ;
    }
    else {
      outboundCallProcessor( this._srf, req, res, req.uri, this._mediaServer, function(err, uas, uac, ms, ep1, ep2) {
        if( err ) {
          console.error('%s: error connecting call: %s', req.get('Call-Id'), err.message) ;
          return ;
        }

        this.emit('connected-call', uas, uac) ; //webrtc-facing dialog first
        this.setHandlers( uas, uac, ms, ep1, ep2 ) ;
      }.bind(this)) ;
    }
  }.bind(this));  
} ;


CallProcessor.prototype.setHandlers = function( uas, uac, ms, ep1, ep2 ) {
  uas.on('destroy', this._onDestroy.bind( this, uas, uac, ms, ep1, ep2 )) ;
  uac.on('destroy', this._onDestroy.bind( this, uac, uas, ms, ep1, ep2 )) ;

  var key = makeReplacesStr(uas) ;
  var value = makeReplacesStr(uac) ;
  this._calls[key] = value ;

  console.log('after adding call there are now %d calls in progress: %s', _.size(this._calls), JSON.stringify(this._calls));

  uas.once('refer', this._handleRefer.bind( this, uas, uac ) ) ;
  uac.once('refer', this._handleRefer.bind( this, uac, uas ) ) ;

} ;

CallProcessor.prototype._onDestroy = function( dlg, dlgOther, ms, ep1, ep2 ) {

  var key = makeReplacesStr(dlg) ;
  if( key in this._calls ) {
    delete this._calls[key] ;
  }
  else {
    key = makeReplacesStr(dlgOther) ;
    if( key in this._calls ) {
      delete this._calls[key] ;
    }
    else {
      console.error('key %s not found in %s', key, JSON.stringify(this._calls));
    }
  }
  [dlgOther, ep1, ep2].forEach( function(e) { e.destroy(); }) ;
  ms.disconnect() ;

  console.log('after ending call there are now %d calls in progress: %s', _.size(this._calls), JSON.stringify(this._calls));

} ;

CallProcessor.prototype._handleRefer = function( dlg, dlgOther, req, res  ) {
  var referTo = req.get('Refer-To') ;
  var arr = /(.*)Replaces=(.*)>/.exec(referTo) ;

  if( arr && arr.length > 1 ) {

    // attended transfer: fixup the Replaces part of the Refer-To header
    var key = arr[2] ;
    if( key in this._calls ) {
      console.log('attended transfer, original refer-to %s', referTo) ;
      referTo = arr[1] + 'Replaces=' + this._calls[key] + '>' ;
      console.log('attended transfer, changed to %s', referTo) ;
    }
    else {
      console.error('attended transfer but we cant find %s in %s', key, JSON.stringify(this._calls));
    }
  }
  else {
    console.log('blind transfer to %s', referTo);
  }

  dlgOther.request({
    method: 'REFER',
    headers: {
      'Refer-To': referTo
    }
  });

  res.send(202);
} ;
function makeReplacesStr( dlg ) {
  var s = '';
  if( dlg.type === 'uas') {
    // split is a hack until we fix bug in drachtio-srf where somehow we are getting "callId,callId" as the dialog.sip.callId
    s = encodeURIComponent( dlg.sip.callId.split(',')[0] + ';to-tag=' + dlg.sip.localTag + ';from-tag=' + dlg.sip.remoteTag ) ;
  }
  else {
    s = encodeURIComponent( dlg.sip.callId.split(',')[0]  + ';to-tag=' + dlg.sip.remoteTag + ';from-tag=' + dlg.sip.localTag ) ;    
  }
  return s ;
}
