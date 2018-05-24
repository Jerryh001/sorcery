/**
 * Encodes a string as base64
 * @param {string} str - the string to encode
 * @returns {string}
 */
module.exports = function btoa(str) {
  return new Buffer(str).toString("base64");
};
