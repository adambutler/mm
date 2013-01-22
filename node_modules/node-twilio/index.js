var ent         = require('ent'),
    querystring = require('querystring'),
    events      = require('events'),
    nest        = require('nest'),
    util        = require('util');

/**
 * Start XML docs with this.
 */
exports.XML_HEAD = '<?xml version="1.0" encoding="UTF-8" ?>';

/**
 * Elements list.
 */
exports.CONTAINER_ELEMENTS = ['Gather', 'Dial'];
exports.TEXT_ELEMENTS      = ['Say', 'Sms', 'Play'];
exports.EMPTY_ELEMENTS     = ['Hangup', 'Reject', 'Pause', 'Record', 'Redirect'];

/**
 * Render a hash to an xml params list.
 *
 * @param {Object} params
 * @return {String}
 */
var renderParams = function (params) {
  if (!params) {
    return '';
  }

  var keys = Object.keys(params),
      ret  = [],
      key, value;

  if (0 === keys.length) {
    return '';
  }

  for (var i = 0, il = keys.length; i < il; i++) {
    key   = keys[i];
    value = ent.encode('' + params[key]);

    ret.push(key + '=' + '"' + value + '"');
  }

  return ' ' + ret.join(' ');
};

/**
 * A Twiml base element
 *
 * @constructor
 * @param {Object} params: The options
 * @param {String} elements
 */
var Element = function (name, params, elements) {
  this.name     = name;
  this.params   = params;
  this.elements = elements || [];
};

/**
 * Add an element.
 *
 * @constructor
 * @param {Mixed} element
 * @param {Boolean} no_encode: If a string element, do not encode entities?
 * @return {Element}
 */
Element.prototype.add = function (element, no_encode) {
  this._cache = null;

  if ('object' === typeof element || no_encode) {
    this.elements.push(element);
  } else {
    this.elements.push(ent.encode(element));
  }

  return this;
};

/**
 * Render the element.
 *
 * @return {String}
 */
Element.prototype.toString = function (not_root) {
  if (!this._cache) {
    var str = '',
        element;

    for (var i = 0, il = this.elements.length; i < il; i++) {
      element = this.elements[i];

      if ('object' === typeof element) {
        str += element.toString(true);
      } else {
        str += element;
      }
    }

    if ('' === str) {
      this._cache = '<' + this.name + renderParams(this.params) + ' />';
    } else {
      this._cache = '<' + this.name + renderParams(this.params) + '>' +
                    str +
                    '</' + this.name + '>';
    }
  }

  if (true === not_root) {
    return this._cache;
  }

  return exports.XML_HEAD + this._cache;
};

/**
 * For making a multi element response.
 *
 * @constructor
 * @extends {Element}
 * @param {Array} elements: The elements to add to the response.
 */
var Response = function (elements) {
  Element.call(this, 'Response', null, elements);
};

util.inherits(Response, Element);

/**
 * Export the elements.
 */
exports.Element  = Element;
exports.Response = Response;

(function () {
  var element, i;

  // Container elements.
  for (i = 0, il = exports.CONTAINER_ELEMENTS.length; i < il; i++) {
    element = exports.CONTAINER_ELEMENTS[i];

    exports[element] = (function (name) {
      return function (params, elements) {
        Element.call(this, name, params, elements);
      };
    })(element);

    util.inherits(exports[element], Element);
  }

  // Text elements
  for (i = 0, il = exports.TEXT_ELEMENTS.length; i < il; i++) {
    element = exports.TEXT_ELEMENTS[i];

    exports[element] = (function (name) {
      return function (params, text) {
        Element.call(this, name, params);

        if (text) {
          this.add(text);
        }
      };
    })(element);

    util.inherits(exports[element], Element);
  }

  // Empty elements
  for (i = 0, il = exports.EMPTY_ELEMENTS.length; i < il; i++) {
    element = exports.EMPTY_ELEMENTS[i];

    exports[element] = (function (name) {
      return function (params) {
        Element.call(this, name, params);
      };
    })(element);

    util.inherits(exports[element], Element);
  }
})();

/**
 * For creating converstations in twilio. A bunch of helpers to clean up
 * the process.
 *
 * @constructor
 * @extends {EventEmitter}
 * @param {Object} options: { path }
 */
var Conversation = function (options) {
  this.path = options.path;

  events.EventEmitter.call(this);
};

// Inherit from EventEmitter
util.inherits(Conversation, events.EventEmitter);

// Export it.
exports.Conversation = Conversation;

/**
 * Respond with some data.
 *
 * @param {ServerResponse} response
 * @param {Buffer|String} data
 * @param {Number} code: HTTP Status Code
 * @param {String} content: Content-Type
 */
Conversation.prototype.respond = function (response, data, code, content) {
  var headers = {
    'Server': 'node'
  };

  if (data) {
    headers['Content-Type']   = content || 'text/xml';
    headers['Content-Length'] = Buffer.isBuffer(data) ? data.length : Buffer.byteLength('' + data);
  }

  response.writeHead(code || 200, headers);
  return response.end(data);
};

/**
 * Quickly create a response with a Say.
 *
 * @param {String} text
 */
Conversation.prototype.responseSay = function (text, options) {
  var xml = new Response;
  xml.add(this.createSay(text, options));

  return xml.toString();
};

/**
 * Quickly create a response with a SMS.
 *
 * @param {String} text
 */
Conversation.prototype.responseSms = function (text) {
  var xml = new Response;
  xml.add(this.createSms(text));

  return xml.toString();
};

/**
 * Quickly create a say element
 *
 * @param {String} text
 */
Conversation.prototype.createSay = function (text, options) {
  options = options || {};

  return new exports.Say({
    voice:    options.voice || 'male',
    language: options.language || 'en'
  }, text);
};

/**
 * Quickly create a sms element
 *
 * @param {String} text
 */
Conversation.prototype.createSms = function (text) {
  return new exports.Sms(null, text);
};

/**
 * Handle an incoming Request and Response
 *
 * @param {HttpRequest} request
 * @param {HttpResponse} response
 */
Conversation.prototype.handleRequest = function (request, response, callback) {
  var self  = this,
      index = request.url.indexOf(this.path);

  if (0 !== index) {
    return this.respond(response, '404 Page Not Found', 404, 'text/plain');
  } else if ('POST' !== request.method) {
    return this.respond(response, 'Bad request.', 400, 'text/plain');
  }

  var path = request.url.slice(this.path.length).split('/')[0];

  request.setEncoding('utf8');
  var body = '';

  request.on('data', function (chunk) {
    body += chunk;
  });

  request.on('end', function () {
    try {
      body = querystring.parse(body);
    } catch (error) {
      return self.respond(response, 'Application error.', 500, 'text/plain');
    }

    // Is it from twilio?
    if (!body.From) {
      return self.respond(response, 'Bad request.', 400, 'text/plain');
    }

    body = {
      headers: request.headers,
      data:    body
    };

    self.emit('request', body, response);

    var args = [response, body];

    if ('' === path) {
      if (callback) {
        return callback(body, function (extra) {
          args.push.apply(args, extra)
          self.start.apply(self, args)
        });
      }
      self.start.apply(self, response, body);
    } else if ('function' === typeof self[path]) {
      if (callback) {
        return callback(body, function (extra) {
          args.push.apply(args, extra)
          self[path].apply(self, args);
        });
      }
      self[path].apply(self, response, body);
    }
  });

  request.on('error', function (error) {
    self.emit('error', error);
  });
};

/**
 * Provide a Twilio REST client for the REST api using `nest`.
 *
 * @constructor
 * @extends {nest.Client}
 * @param {Object} options
 */
var Client = function (options) {
  var auth;

  options || (options = {});

  auth = new Buffer(options.sid + ':' + options.token).toString('base64');

  nest.Client.call(this, {
    host:             'api.twilio.com',
    path:             '/2010-04-01/',
    secure:           true,
    headers: {
      Authorization: 'Basic ' + auth,
      Accept:        'application/json'
    },
    response:        'json'
  });
};

util.inherits(Client, nest.Client);

exports.Client = Client;

/**
 * Override the nest _request to add relevant logic.
 *
 * @param {Object} options: A hash of options for the request.
 * @param {Function} callback
 * @private
 */
Client.prototype._request = function (method, options, callback) {
  callback = callback || function () {};

  options.path = options.path + '.json';

  return nest.Client.prototype._request.call(this, method, options, function (error, response, data) {
    callback(error, data, response);
  });
};
