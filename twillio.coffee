#'82.46.0.57:1337'

express = require("express")
app = express()
twilioAPI = require("twilio-api")
cli = new twilioAPI.Client('ACf39e1b04d08f9909f36742fa6eacefbc', 'd95dbd5ac2495abcb055783cede32837')
app.use cli.middleware()
app.listen 1337

#Get a Twilio application and register it
cli.account.getApplication 'APfcc463968ea11abfbcf4756dbdfc563b', (err, app) ->
  throw err  if err
  app.register()
  app.on "incomingSMSMessage", (sms) ->
    console.log sms.Body