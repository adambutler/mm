// Generated by CoffeeScript 1.4.0
var GitHubApi, app, auth, blue, board, cli, exec, express, fakePoll, five, fs, getName, github, githubAuth, githubGenerateToken, githubPoll, handleResponse, init, initBoard, initGithub, lastTrackedEvent, log, prettyjson, prompt, queue, red, reset, servo, servoBusy, settings, setupPhotoresistor, setupServo, setupTwillio, sys, timeago, triggerServo, twilioAPI, users;

GitHubApi = require('github');

prettyjson = require('prettyjson');

timeago = require('timeago');

sys = require('sys');

exec = require('exec');

express = require("express");

app = express();

twilioAPI = require("twilio-api");

cli = new twilioAPI.Client('ACf39e1b04d08f9909f36742fa6eacefbc', 'd95dbd5ac2495abcb055783cede32837');

app.use(cli.middleware());

app.listen(1337);

five = require('./lib/johnny-five.js');

prompt = require('prompt');

prompt.start();

fs = require('fs');

github = void 0;

lastTrackedEvent = void 0;

board = void 0;

servo = void 0;

auth = void 0;

queue = 0;

servoBusy = false;

red = '\u001b[31m';

blue = '\u001b[34m';

reset = '\u001b[0m';

users = {
  "adambutler": "Adam Butler",
  "coatezy": "Tom Coates",
  "daleanthony": "Dale Anthony",
  "hecticjeff": " Chris Mytton",
  "jegtnes": "Alexander Jegtnes",
  "markjs": "Mark J Smith",
  "paulspringett": "Paul Springett",
  "redeye": "Mark Panay",
  "snez": "Christos Constantinou",
  "tholder": "Tom Holder",
  "paulmasri": "Paul Masri"
};

settings = {
  printJSON: false,
  poll: 12000,
  logLevel: 3,
  fake: false,
  method: 'timer',
  servoTimeoutDefault: 1400,
  servoTimeoutIfMethodIsPhoto: 5000,
  servoEnabled: true
};

log = function(msg, level) {
  if (level == null) {
    level = 1;
  }
  if (settings.logLevel >= level) {
    return console.log(msg);
  }
};

init = function() {
  return setupTwillio();
};

setupTwillio = function() {
  return cli.account.getApplication('APfcc463968ea11abfbcf4756dbdfc563b', function(err, app) {
    app.register();
    return app.on("incomingSMSMessage", function(sms) {
      console.log('Got SMS');
      triggerServo();
      if (settings.servoEnabled) {
        return initBoard();
      } else {
        return initGithub();
      }
    });
  });
};

initBoard = function() {
  board = new five.Board();
  return board.on("ready", function() {
    setupServo();
    return initGithub();
  });
};

setupPhotoresistor = function() {
  var photoresistor;
  photoresistor = new five.Sensor({
    pin: 'A2',
    freq: 250
  });
  return photoresistor.on("read", function(err, val) {
    if (val >= 250) {
      return servo.stop();
    }
  });
};

setupServo = function() {
  servo = new five.Servo({
    pin: 10,
    range: [-180, 180],
    type: "continuous"
  });
  return servo.stop();
};

triggerServo = function(extendQueue) {
  var timeout;
  if (extendQueue == null) {
    extendQueue = true;
  }
  if (extendQueue) {
    log("" + blue + "+1 Queue" + reset, 2);
    queue++;
  }
  if (!servoBusy) {
    servoBusy = true;
    log("" + red + "Dispense M&M" + reset, 1);
    if (settings.servoEnabled) {
      servo.move(180);
    }
    timeout = settings.servoTimeoutDefault;
    if (settings.method === 'photo') {
      timeout = settings.servoTimeoutIfMethodIsPhoto;
    }
    return setTimeout(function() {
      queue--;
      servoBusy = false;
      if (settings.servoEnabled) {
        servo.stop();
      }
      if (queue !== 0) {
        return triggerServo(false);
      }
    }, timeout);
  }
};

initGithub = function() {
  github = new GitHubApi({
    version: "3.0.0",
    timeout: 5000
  });
  return githubAuth();
};

githubAuth = function() {
  return fs.readFile('auth', 'utf8', function(err, data) {
    if (err) {
      console.log("\n\nYou have not authenticated yet:\n===============================\n\nYou will be asked once for your GitHub username and password.\nProviding this will allow the app to generate a OAuth token with permisions to access notifications only.\nThe token will be saved in the application directory, be careful not to check your token into source control.\n");
      return prompt.get({
        properties: {
          username: {
            required: true,
            message: 'GitHub Username'
          },
          password: {
            required: true,
            hidden: true,
            message: 'GitHub Password'
          },
          org: {
            required: false,
            message: 'Organization (leave blank to track your own activity)'
          }
        }
      }, function(err, result) {
        if (err) {
          return console.log(err);
        } else {
          return githubGenerateToken(result.username, result.password, result.org);
        }
      });
    } else {
      auth = JSON.parse(data);
      github.authenticate({
        type: 'oauth',
        token: auth.token
      });
      return githubPoll();
    }
  });
};

githubGenerateToken = function(username, password, org) {
  github.authenticate({
    type: 'basic',
    username: username,
    password: password
  });
  return github.authorization.create({
    note: 'GitHubApi M&M',
    scopes: ['repo']
  }, function(err, res) {
    if (err) {
      return console.log(err);
    } else {
      return fs.writeFile('auth', "{ \"username\": \"" + username + "\", \"org\": \"" + org + "\", \"token\": \"" + res.token + "\" }", function(err) {
        if (err) {
          return console.log(err);
        } else {
          return githubAuth();
        }
      });
    }
  });
};

githubPoll = function() {
  var _this = this;
  if (settings.fake) {
    return fakePoll();
  } else {
    log("Polling", 2);
    return github.events.getFromUserOrg({
      org: auth.org,
      user: auth.username,
      type: 'PushEvent'
    }, function(err, res) {
      if (err) {
        log("ERROR: " + err, 1);
        return setTimeout(githubPoll, settings.poll);
      } else {
        return handleResponse(res);
      }
    });
  }
};

getName = function(username) {
  if (users[username] != null) {
    return users[username];
  } else {
    return username;
  }
};

handleResponse = function(events) {
  var event, _i, _len;
  if (settings.printJSON) {
    console.log(prettyjson.render(events));
  }
  if (lastTrackedEvent === events[0].id) {
    log("No new events will poll again in " + (settings.poll / 1000) + "s", 2);
  } else {
    for (_i = 0, _len = events.length; _i < _len; _i++) {
      event = events[_i];
      if (event.id === lastTrackedEvent) {
        break;
      }
      log("Checking new event " + event.id, 2);
      if (event.type === "PullRequestEvent" && event.payload.action === "closed" && event.payload.pull_request.base.ref === "master") {
        log("A pull request was merged " + (timeago(event.created_at)) + " by " + (getName(event.actor.login)), 1);
        triggerServo();
      }
    }
  }
  lastTrackedEvent = events[0].id;
  return setTimeout(githubPoll, settings.poll);
};

fakePoll = function() {
  console.log('Warning: In fake mode');
  triggerServo();
  return setTimeout(githubPoll, settings.poll);
};

init();
