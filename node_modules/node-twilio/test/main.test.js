var twilio = require('../'),
    assert = require('assert'),
    creds  = require('./creds');

var c = new twilio.Client(creds);

module.exports = {
  "test get Accounts/sid/Sandbox": function (next) {
    c.get('Accounts/' + creds.sid + '/Sandbox', function (error, data) {
      assert.ok(!error);
      assert.equal(creds.sid, data.account_sid);
      next();
    });
  },
  "test get Calls": function (next) {
    c.get('Accounts/' + creds.sid + '/Calls', function (error, calls) {
      assert.ok(!error);
      assert.equal(50, calls.calls.length);
      next();
    });
  }
};
