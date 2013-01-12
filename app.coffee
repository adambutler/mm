# Github + required libs

GitHubApi = require 'github'
prettyjson = require 'prettyjson'
timeago = require 'timeago'
sys = require 'sys'
exec = require 'exec'

# Arduino + required libs
five = require './lib/johnny-five.js'

# Default Vars
github = undefined
lastTrackedEvent = undefined
board = undefined
servo = undefined

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
  poll: 5000
  logLevel: 3
  fake: true
  method: 'timer' # photo | timer
  servoTimeoutDefault: 1600
  servoTimeoutIfMethodIsPhoto: 5000
}

log = (msg, level = 1) ->
  if settings.logLevel >= level
    console.log msg

init = ->
  initBoard()

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


  servo.on "move", (err, degrees) ->
    #if degrees == 180
      #servo.stop()

triggerServo = ->
  servo.move(1)

  timeout = settings.servoTimeoutDefault
  if settings.method == 'photo'
    timeout = settings.servoTimeoutIfMethodIsPhoto

  setTimeout ->
    servo.stop()
  , timeout

initGithub = ->
  github = new GitHubApi
    version: "3.0.0"
    timeout: 5000

  githubAuth()

githubAuth = ->

  github.authenticate
    type: 'oauth',
    token: '' # oauth token required

  githubPoll()

githubGenerateToken = ->

  github.authenticate
    type: 'basic'
    username: 'adambutler'
    password: ''

  github.authorization.create
    note: 'GitHubApi M&M'
    scopes: ['gist','user','public_repo','repo','repo:status','delete_repo','notifications']
  , (err, res) ->
    console.log(prettyjson.render(res))

githubPoll = ->

  log 'About to poll GitHub Events', 2

  if settings.fake
    console.log 'fake'
    triggerServo()
    setTimeout githubPoll, settings.poll
  else
    github.events.getFromUserOrg
      org: 'simpleweb'
      user: 'adambutler'
      type: 'PushEvent'
    , (err, res) =>

      if err
        log "ERROR: #{err}", 1
      else if res.message == "Server Error"
        log "Server Error", 1
        setTimeout githubPoll, settings.poll
      else
        newResults = false

        if settings.printJSON
          console.log(prettyjson.render(res))

        for ghevent in res
          if ghevent.created_at == lastTrackedEvent
            break
          else
            newResults = true
            log "Checking new event #{ghevent.created_at}", 2
            if ghevent.type == "PullRequestEvent" and ghevent.payload.action == "closed"
              
              log "A pull request was merged #{timeago(ghevent.created_at)} by #{ghevent.actor.login}", 1
              
              # Determine if this is the first run
              if lastTrackedEvent?
                #exec("say 'One M and M for #{users[ghevent.actor.login]}")
                log "Dispense an M&M", 1
                triggerServo()
              else
                log "Sorry no M&M for you, we're just booting up!"

        if !newResults
          triggerServo()
          log "No new events to test will poll again in #{settings.poll/1000} seconds", 2

        lastTrackedEvent = res[0].created_at

        setTimeout githubPoll, settings.poll

init()