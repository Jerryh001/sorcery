const btoa = require('./utils/btoa.js');

function SourceMap ( properties ) {
	this.version = 3;

	this.file           = properties.file;
	this.sources        = properties.sources;
	this.sourceRoot     = properties.sourceRoot;
	this.sourcesContent = properties.sourcesContent;
	this.names          = properties.names;
	this.mappings       = properties.mappings;
}

module.exports = SourceMap;

SourceMap.prototype = {
	toString () {
		return JSON.stringify( this );
	},

	toUrl () {
		return 'data:application/json;charset=utf-8;base64,' + btoa( this.toString() );
	}
};
