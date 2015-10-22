var app = require('express')();
var http = require('http').Server(app);
var https = require('https');
var io = require('socket.io')(http);
var path = require('path');
var fs = require('fs');
var favicon = require('serve-favicon');
var config = {};

////////////////////////////////////////////////////////////
//COMMON FUNCTIONS
function pl(msg){
  console.log('DEBUG->'+msg);
}
//This returns an array with unique elements
function uniq(a) {
  var seen = new Set();
  return a.filter(function(x) {
    return !seen.has(x) && seen.add(x);
  })
}
///////////////////////////////////////////////////////////

app.use(favicon(__dirname + '/public/images/favicon.ico'));

app.get('/', function (req, res) {
    res.sendFile(path.resolve('index.html'));
});

app.get('/beeper', function (req, res) {
    res.sendFile(path.resolve('beeper.html'));
});

app.get('/sounds/:resource', function (req, res) {
    var resourceFilePath = path.resolve(__dirname 
                            + '/public/sounds/' 
                            + req.params.resource);
    if(fs.existsSync(resourceFilePath)){
      res.sendFile(resourceFilePath);
    }else{
      res.status(404).send('404: Page not Found');
    }
});

app.get('/shared/:resource', function (req, res) {
    var resourceFilePath = path.resolve(__dirname 
                            + '/public/shared/' 
                            + req.params.resource);
    if(fs.existsSync(resourceFilePath)){
      res.sendFile(resourceFilePath);
    }else{
      res.status(404).send('404: Page not Found');
    }
});

function searchImgLink(terms, callback){
  //If there are multiple search terms, combine them together
  term = '';
  terms.forEach(function(aTerm){
    term += aTerm + ';';
  });
  
  searchGoogleImages(term, function(items){
    if(items){
      //If there a thumbnail, return that, if not the full size image
      if(items[0].image.thumbnailLink){
        callback(items[0].image.thumbnailLink);
      }else{
        callback(items[0].link);
      }
    }else{
      callback(null);
    }
  });
}

function searchGoogleImages(term, callback){
  var imgSearchStr='https://www.googleapis.com/customsearch/v1?key=AIzaSyCe4ud61IKC8B2dfQ2bDAgdvfxLGE9dNTw&cx=002547328973189675934:shd-4zof6nk&q='
                 + term
                 + '&searchType=image&alt=json';
                    //&fileType=jpg
  
  https.get(imgSearchStr, function(res){
    var body = '';
    res.on('data', function(data){
      body += data;
    });
    res.on('end', function(){
      var parsed = JSON.parse(body);
      if(parsed.error){
        console.log('*****ERROR***** searchGoogleImages:');
        console.log('*****ERROR***** ' + parsed.error.message);
        callback(null);
      }else{
        callback(parsed.items);
      }
    });
  }).on('error',function(e){
    console.log('ERROR: ' + e.message);
  });
}


function printArr(arr){
  var i = 0;
  arr.forEach(function(index){
    pl(i + ' - ' + index.userName);
    i += 1;
  });
}

var userList = [];
var banList = [];
var specMsgRegEx = /\/([^\:\/][^\/\s]*)/g;//////Problem with RegEx. Needs to handle spaces

function getDateTime() {
    var date = new Date();
    var hour = date.getHours();
    hour = (hour < 10 ? "0" : "") + hour;
    var min  = date.getMinutes();
    min = (min < 10 ? "0" : "") + min;
    var sec  = date.getSeconds();
    sec = (sec < 10 ? "0" : "") + sec;
    var month = date.getMonth() + 1;
    month = (month < 10 ? "0" : "") + month;
    var day  = date.getDate();
    day = (day < 10 ? "0" : "") + day;
    return month + "/" + day + " " + hour + ":" + min + ":" + sec;
}


function nameExistsIn(name, set){
  var matches = set.filter(function (entry){
                  return entry.userName === name;
                });
  return matches;
}

function addUser(userName,socket){
  var response = { "reason" : "", "failed" : false };
  var dupUsers = nameExistsIn(userName, userList);
  //If there are already users found with that name
  if(dupUsers && dupUsers.length > 0){
    response.failed = true;
    
    //There really should only be one user found, because we
    //wouldn't of added it before, if there were dups found
    dupUsers.forEach(function(name){
      //If any of the names were found to be banned,
      //respond with that
      if(name.banned){
        response.reason = "banned";
        return response;
      }
    });
    if(response.reason != "banned")
      response.reason = "duplicate";
  }else{
    userList.push({ 'userName' : userName,
                    'socket'   : socket,
                    'banned'   : false});
    response.failed = false;
  }
  return response;
}

function updateUserSocket(userName, socket){
  userFound = false;
  userList.forEach(function (user){
      if(user.userName === userName){
        user.socket = socket;
        userFound = true;
      }
    });
  if(! userFound)
    addUser(userName,socket);
}

function getUserNameList(set){
  var nameList = [];
  for(var i = 0; i < set.length; i++){
    if(!set[i].banned){
      nameList.push(set[i].userName);
    }
  }
  return nameList;
}

function removeSocket(socket, set){
  return set.filter(function(entry){
                    var ans = entry.socket !== socket;
                    return ans;
                   });
}

//'actions' is a list of actions to be taken that are
//in this kind of format  /func:arg1:arg2:etc
function findSpecFuncs(actions, msg, callback){
  if(actions){
    var uniqActions = uniq(actions);
    //Replacing the actions in the msg with placeholders TODO:REMEMEBER TO REPLACE WITH OLD ACTION IF IT IS NOT AN ACTION
    var newMsg = msg;
    uniqActions.forEach(function(action, actionI){
      pl('newMsg->'+newMsg);
      pl('action->'+action);
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
                      function(update){
                        if(update){
                          updates[uniqActionsI] = update;
                        }else{
                          //Else there is nothing to update, put old action back in
                          updates[uniqActionsI] = action;
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
  switch(funcName.toUpperCase()){
    case 'BN':
      banUsers(args, userList, function(newUserList){
                                 userList = newUserList
                                 //Remove this action from the message
                                 callback(' ');
                                 });
      break;
    case 'IMG':
      //We only use the first arg, because it is the only
      searchImgLink(args, function(imgLink){
                                          if(imgLink){
                                            callback(imgLink+' ');
                                          }else{
                                            //Image lookup failed
                                            callback(null);
                                          }
                                          });
      break;
    default:
      callback(null);
      break;
  }
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

io.on('connection', function(socket){
  pl('connection established - ' + getDateTime());
  socket.emit('request user data');
  
  socket.on('user name response', function(user){
    if(user.userName){
      pl('User Connected: ' + user.userName);
      updateUserSocket(user.userName,socket);
      io.emit('user list update', getUserNameList(userList));
    }else{
      pl('New User Connected');
    }
  });
  
  //Give the newly connected user, the userList
  socket.emit('user list update', getUserNameList(userList));
  
  socket.on('chat message', function(msg){
    //Find all possible actions
    var specActions = msg.msg.match(specMsgRegEx);
    //plainMsg has all commands removed, and replaced
    findSpecFuncs(specActions, msg.msg, function(plainMsg){
      pl('plainMsg->' + plainMsg);
      //If the user name wasn't passed in
      if(! msg.userName){
        io.emit('chat message', plainMsg);
      //Else it is a new user sending his first message
      }else{
        addUserRes = addUser(msg.userName,socket);
        if(addUserRes.failed){
          socket.emit('bad user name', addUserRes.reason);
        }else{
          io.emit('chat message', plainMsg);
        }
      }
      //Send update
      io.emit('user list update', getUserNameList(userList));
    });
  });
  
  socket.on('disconnect', function(){
    pl('user disconnected - ' + getDateTime());
    userList = removeSocket(socket, userList);
    socket.disconnect();//TODO:ADD A RECONNECT ATTEMPT
    io.emit('user list update', getUserNameList(userList));
  });
});


fs.readFile('./config.json', 'utf8', function (err, data) {
  if (err) throw err;
  config = JSON.parse(data);
  
  http.listen(config.port, function(){
      console.log('listening on *:' + config.port);
  });
});