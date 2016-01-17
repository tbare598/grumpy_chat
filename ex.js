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
var banList = [];
var specMsgRegEx = /\/([^\:\/][^\/\s]*)/g;//////TODO:HANDLE SPACES USING QUOTES

function usernameExistsIn(name, set){
  var matches = set.filter(function (entry){
                  return entry.userName === name;
                });
  if(matches && matches.length > 0)
    return true;
  else
    return false;
}

function addUser(user, response, callback){
  //If the user's socket exists within the UserList, then remove it.
  //Though it should not be in there in the first place
  removeSocket(user.socket, userList);
  if(usernameExistsIn(user.userName, userList)){
    response.failed = true;
    response.reason = 'duplicate';
  }else{
    user.uid = uni.getRandToken(1024) + user.userName;
    userList.push(user);
    response.failed = false;
  }
  callback(response);
}

function updateUser(user, callback){
  var response = { "reason" : "", "failed" : true };
  var userFound = false;
  if(user.uid){
    userList.forEach(function (aUser){
      if(aUser.userName === user.userName){
        userFound = true;
        //The uid and username have to be the same for a user
        if(aUser.uid === user.uid){
          aUser.socket = user.socket;
          response.failed = false;
        }else{
          response.failed = true;
          response.reason = "username uid mismatch";
        }
      }
    });
    if(!userFound)
      addUser(user, response, callback);
    else
      callback(response);
  }else{
    addUser(user, response, callback);
  }
}

function getUserNameList(set){
  var nameList = [];
  for(var i = 0; i < set.length; i++){
    nameList.push(set[i].userName);
  }
  return nameList;
}

function removeSocket(socket, set, callback){
  userList = set.filter(function(entry){
                    var ans = entry.socket !== socket;
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

function banUsers(userNames, userSet, callback){
  var newUserSet = userSet;
  //For each user name that we want to remove
  userNames.forEach(function(userName){
    //If true, that means the userName already exists. If false, we want
    //to create that userName, and set it to banned
    if(nameExistsIn(userName, newUserSet).length > 0){
      //Loop through all the users, and ban the user with the matching userName
      newUserSet.forEach(function(user){
        //If this user is in the list of names to be kicked,
        //disconnect them and set them to banned
        if(userName === user.userName){
          user.socket.emit('disconnect reason', 'You have been kicked');
          user.socket.disconnect();
          user.banned = true;
        //If the next user's banned status is not defined, set it to false
        }else if(typeof user.banned === 'undefined'){
          user.banned = false;
        }else{
          user.banned = user.banned;
        }
      });
    }else{
      var newUser = { "userName" : userName,
                        "banned" : true };
      newUserSet.push(newUser);
    }
  });
  callback(newUserSet);
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
    user.socket = socket;
	
    updateUser(user, function(updUserRes){
      if(updUserRes.failed){
        socket.emit('bad user name', updUserRes.reason);
      }else{
        log('user "' + user.userName + '" connected');
        
        //Keep users from reconnecting multiple times
        socket.removeAllListeners('user connect');
        io.emit('user list update', getUserNameList(userList));
        socket.emit('server connection', 
                    { "uid"     : user.uid, 
                      "oldMsgs" : getOldMsgs()});
    
        //Setting the following socket listeners only after 
        //a user has successfully connected
        
        socket.on('chat message', function(msg){
          log('msg->' + user.userName + ' -> ' + msg);
          //Find all possible actions
          var specActions = msg.match(specMsgRegEx);
          //plainMsg has all commands removed, and replaced
          findSpecFuncs(specActions, msg, function(plainMsg){
            var usrMsg = user.userName + ' -> ' + plainMsg;
            var nextMsgId = getMsgId();
            var msgObj = { 'msg' : usrMsg,
                           'id'  : nextMsgId };
            addMsgToArr(msgObj);
            io.emit('chat message', msgObj);
          });
        });
          
        socket.on('disconnect', function(){
          log('user disconnected');
          removeSocket(socket, userList);
          io.emit('user list update', getUserNameList(userList));
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
