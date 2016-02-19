var app = require('express')();
var server = require('http').Server(app);
var io = require('socket.io')(server);
var path = require('path');
var fs = require('fs');
var favicon = require('serve-favicon');
var uni = require(path.resolve(__dirname + '/helper/universal.js'));
var goog = require(path.resolve(__dirname + '/webservices/google.js'));
var config = {};

var log = uni.log;

//Just a debugging helper
function pl(msg){
  console.log('DEBUG->'+msg);
}

app.use(favicon(__dirname + '/public/images/favicon.ico'));

app.get('/', function (req, res) {
    res.sendFile(path.resolve(__dirname 
                           + '/public/html/index.html'));
});

//This will had out requests to the public directory, on
//get requests
app.get('/:resource_type/:resource', function (req, res) {
    var resourceFilePath = path.resolve(__dirname 
                            + '/public/'
                            + req.params.resource_type
                            + '/' 
                            + req.params.resource);
    if(fs.existsSync(resourceFilePath)){
      res.sendFile(resourceFilePath);
    }else{
      res.status(404).send('404: Page not Found');
    }
});



var userList = [];
var userIdSeq = {
  currVal : 0,
  nextVal : function(){
    this.currVal++;
    return this.currVal;
  }
};
var banList = [];
var specMsgRegEx = /\/([^\:\/][^\/\s]*)/g;//////TODO:HANDLE SPACES USING QUOTES

function nameExistsIn(name, set){
  var matches = set.filter(function (entry){
                  return entry.name === name;
                });
  if(matches && matches.length > 0)
    return true;
  else
    return false;
}

function addUser(user, callback){
  var response = { "reason" : "", "failed" : true };
  if(nameExistsIn(user.name, userList)){
    response.failed = true;
    response.reason = 'duplicate';
  }else{
    userList.push(user);
    response.failed = false;
  }
  callback(response);
}

function getUserNameList(set){
  var nameList = [];
  for(var i = 0; i < set.length; i++){
    nameList.push(set[i].name);
  }
  return nameList;
}

function getUserData(set){
  var userData = [];
  var clientSafeData = [ 'id', 'name', 'img' ];
  
  set.forEach(function(user){
    var userObj = {};
    clientSafeData.forEach(function(key){
      userObj[key] = user[key];
    });
    userData.push(userObj);
  });
  return userData;
}

function removeUserName(set, name){
  userList = set.filter(function(entry){
                    var ans = entry.name !== name;
                    return ans;
                   });
}

//'actions' is a list of actions to be taken that are
//in this kind of format  /func:arg1:arg2:etc
function findSpecFuncs(actions, msg, callback){
  if(actions){
    var uniqActions = uni.uniq(actions);
    //Replacing the actions in the msg with placeholders TODO:REMEMEBER TO REPLACE WITH OLD ACTION IF IT IS NOT AN ACTION
    var newMsg = msg;
    uniqActions.forEach(function(action, actionI){
      newMsg = newMsg.replace(action, '/action:'+actionI+'/');
    });
    var updates = [];
    finishedActionCount = 0;
    uniqActions.forEach(function(action, uniqActionsI){
      //split up the actions, by the function name which will
      //be the first element, and it's arguments. As such:
      //['funcName','arg1','arg2','etc']
      var args = action.match(/[^\:\/][^\:]*/g);
      
      //The first arg(args.shift()) is the function name
      resolveFuncName(args.shift(),
                      args,
                      function(update, err){
                        if(update){
                          updates[uniqActionsI] = update;
                        }else{
                          //Else there is nothing to update, put old action back in.
                          //We don't want to remove the action from the message, even if
                          //there was an error.
                          updates[uniqActionsI] = action;
                          //If there was an error, then log it an continue.
                          if(err){ log(err.message); }
                        }
                        finishedActionCount++;
                        if(finishedActionCount === uniqActions.length){
                          updates.forEach(function(update, updateI){
                            newMsg = newMsg.replace('/action:'+updateI+'/', update);
                          });
                          callback(newMsg);
                        }
                      });
    });
  }else{
    callback(msg);
  }
}

function resolveFuncName(funcName, args, callback){
  funcFound = false;
  switch(funcName.toUpperCase()){
    case 'BN':
      funcFound = true;
      //removing the banUser function for now
      callback(' ');
      /*
      banUsers(args, userList, function(newUserList){
                                 userList = newUserList
                                 //Remove this action from the message
                                 callback(' ');
                                 });*/
      break;
    case 'IMG':
      funcFound = true;
      chatImgSearch(args, callback);
      break;
    default:
      callback(null);
      break;
  }
  if(funcFound) log('function call->'+funcName);
}

function chatImgSearch(terms, callback){
  //If there are multiple search terms, combine them together
  var term = '';
  terms.forEach(function(aTerm){ 
                  term += aTerm + ';'; 
                });
  goog.searchGoogleImages(term, 
      function(images, err){
        if(!err && images){
          var imgLink = '';
          //If there a thumbnail, return that, if not the full size image
          if(images[0].image.thumbnailLink){
            imgLink = images[0].image.thumbnailLink;
          }else{
            imgLink = images[0].link;
          }
          callback(imgLink+' ');
        }else{
          //Image lookup failed
          callback(null, err);
        }
      });
}

MAX_MSGS=250;
var msgArray = [];
function addMsgToArr(msg, callback){
  //Add the message to the beginning of the array, so that we
  //can slice off messages beyond MAX_MSGS
  msgArray.unshift(msg);
  msgArray = msgArray.slice(0, MAX_MSGS);
  
  if (callback) callback();
}

var msgId = 0;
function getMsgId(){
  msgId++;
  var newMsgId = Date.now().toString() + '_' + msgId.toString();
  return newMsgId;
}

function getOldMsgs(){
  return msgArray;
}

io.on('connection', function(socket){
  log('connection established');
  
  socket.on('user connect', function(user){
    user.id = userIdSeq.nextVal();
    addUser(user, function(updUserRes){
      if(updUserRes.failed){
        socket.emit('bad user name', updUserRes.reason);
      }else{
        log('user "' + user.name + '" connected');
        
        //Keep users from reconnecting multiple times
        socket.removeAllListeners('user connect');
        io.emit('user list update', getUserData(userList));
        socket.emit('server connection', 
                    { "oldMsgs" : getOldMsgs()});
    
        //Setting the following socket listeners only after 
        //a user has successfully connected
        
        socket.on('chat message', function(msg){
          log('msg->' + user.name + ' -> ' + msg);
          //Find all possible actions
          var specActions = msg.match(specMsgRegEx);
          //plainMsg has all commands removed, and replaced
          findSpecFuncs(specActions, msg, function(plainMsg){
            var nextMsgId = getMsgId();
            //TODO:REMOVE USERID FROM THE MESSAGE
            var msgObj = { 'user' : user,
                           'id'   : nextMsgId,
                           'msg'  : plainMsg };
            addMsgToArr(msgObj);
            io.emit('chat message', msgObj);
          });
        });
          
        socket.on('update user data', function(userData){
          user.img = userData.img;
          io.emit('user list update', getUserData(userList));
        });
          
        socket.on('disconnect', function(){
          log('user "'+ user.name +'" disconnected');
          removeUserName(userList, user.name);
          io.emit('user list update', getUserData(userList));
        });
      }
    });
  });
});


fs.readFile('./config.json', 'utf8', function (err, data) {
  if (err) throw err;
  config = JSON.parse(data);
  
  server.listen(config.port, function(){
      log('listening on *:' + config.port);
  });
});
