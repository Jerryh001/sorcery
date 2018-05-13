/**
 * Decodes a base64 string
 * @param {string} base64 - the string to decode
 * @returns {string}
 */
module.exports = function atob ( base64 ) {
	return new Buffer( base64, 'base64' ).toString( 'utf8' );
};
