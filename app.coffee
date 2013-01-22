# Github + required libs

GitHubApi = require 'github'
prettyjson = require 'prettyjson'
timeago = require 'timeago'
sys = require 'sys'
exec = require 'exec'
express = require("express")
app = express()
twilioAPI = require("twilio-api")

cli = new twilioAPI.Client('ACf39e1b04d08f9909f36742fa6eacefbc', 'd95dbd5ac2495abcb055783cede32837')
app.use cli.middleware()
app.listen 1337


# Arduino + required libs
five = require './lib/johnny-five.js'

# Other libs
prompt = require 'prompt'
prompt.start()

fs = require 'fs'

# Default Vars
github = undefined
lastTrackedEvent = undefined
board = undefined
servo = undefined
auth = undefined
queue = 0
servoBusy = false
red   = '\u001b[31m'
blue  = '\u001b[34m'
reset = '\u001b[0m'

users = {
  "adambutler": "Adam Butler"
  "coatezy": "Tom Coates"
  "daleanthony": "Dale Anthony"
  "hecticjeff": " Chris Mytton"
  "jegtnes": "Alexander Jegtnes"
  "markjs": "Mark J Smith"
  "paulspringett": "Paul Springett"
  "redeye": "Mark Panay"
  "snez": "Christos Constantinou"
  "tholder": "Tom Holder"
  "paulmasri": "Paul Masri"
}

# Settings
settings = {
  printJSON: false
  poll: 12000
  logLevel: 3
  fake: false
  method: 'timer' # photo | timer
  servoTimeoutDefault: 1400
  servoTimeoutIfMethodIsPhoto: 5000
  servoEnabled: true
}

log = (msg, level = 1) ->
  if settings.logLevel >= level
    console.log msg

init = ->
  setupTwillio()

setupTwillio = ->

  cli.account.getApplication 'APfcc463968ea11abfbcf4756dbdfc563b', (err, app) ->
    app.register()
    app.on "incomingSMSMessage", (sms) ->
      console.log 'Got SMS'
        triggerServo()
      if settings.servoEnabled
        initBoard()
      else
        initGithub()

initBoard = ->
  board = new five.Board()

  board.on "ready", ->
    setupServo()
    #if settings.method == 'photo'
    #  setupPhotoresistor()
    initGithub()

setupPhotoresistor = ->
  photoresistor = new five.Sensor
    pin: 'A2'
    freq: 250

  photoresistor.on "read", (err, val) ->
    #log "photoresistor = #{val}", 3

    if val >= 250
      servo.stop()

setupServo = ->
  servo = new five.Servo
    pin: 10
    range: [-180,180]
    type: "continuous"

  servo.stop()

triggerServo = (extendQueue = true) ->

  if extendQueue
    log "#{blue}+1 Queue#{reset}", 2
    queue++

  if !servoBusy

    servoBusy = true

    log "#{red}Dispense M&M#{reset}", 1

    servo.move(180) if settings.servoEnabled

    timeout = settings.servoTimeoutDefault

    if settings.method == 'photo'
      timeout = settings.servoTimeoutIfMethodIsPhoto

    setTimeout ->
      queue--
      servoBusy = false

      servo.stop() if settings.servoEnabled

      triggerServo(false) if queue != 0
    , timeout

initGithub = ->
  github = new GitHubApi
    version: "3.0.0"
    timeout: 5000

  githubAuth()

githubAuth = ->

  fs.readFile 'auth', 'utf8', (err,data) ->
    if err
      console.log "\n\nYou have not authenticated yet:\n===============================\n\nYou will be asked once for your GitHub username and password.\nProviding this will allow the app to generate a OAuth token with permisions to access notifications only.\nThe token will be saved in the application directory, be careful not to check your token into source control.\n"

      prompt.get
        properties:
          username:
            required: true
            message: 'GitHub Username'
          password:
            required: true
            hidden: true
            message: 'GitHub Password'
          org:
            required: false
            message: 'Organization (leave blank to track your own activity)'
      , (err, result) ->
        if err
          console.log err
        else
          githubGenerateToken(result.username, result.password, result.org)
    else
      auth = JSON.parse(data)

      github.authenticate
        type: 'oauth',
        token: auth.token # oauth token required

      githubPoll()

githubGenerateToken = (username, password, org) ->

  github.authenticate
    type: 'basic'
    username: username
    password: password

  github.authorization.create
    note: 'GitHubApi M&M'
    scopes: ['repo']
  , (err, res) ->
    if err
      console.log err
    else
      fs.writeFile(
        'auth'
        ,"{ \"username\": \"#{username}\", \"org\": \"#{org}\", \"token\": \"#{res.token}\" }"
        , (err) ->
          if err
            console.log err
          else
            githubAuth()
      )

githubPoll = ->

  if settings.fake
    fakePoll()
  else
    log "Polling", 2
    github.events.getFromUserOrg
      org: auth.org
      user: auth.username
      type: 'PushEvent'
    , (err, res) =>

      if err
        log "ERROR: #{err}", 1
        setTimeout githubPoll, settings.poll
      else
        handleResponse(res)

getName = (username) ->
  if users[username]?
    return users[username]
  else
    return username

handleResponse = (events) ->

  console.log(prettyjson.render(events)) if settings.printJSON

  if lastTrackedEvent == events[0].id
    log "No new events will poll again in #{settings.poll/1000}s", 2

  else
    for event in events
      break if event.id == lastTrackedEvent

      log "Checking new event #{event.id}", 2

      if event.type == "PullRequestEvent" and event.payload.action == "closed" and event.payload.pull_request.base.ref == "master"

        log "A pull request was merged #{timeago(event.created_at)} by #{getName(event.actor.login)}", 1

        triggerServo()

  lastTrackedEvent = events[0].id

  setTimeout githubPoll, settings.poll

fakePoll = ->
  console.log 'Warning: In fake mode'
  triggerServo()
  setTimeout githubPoll, settings.poll

init()
