var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
var userData = {};
var userList = [];

function formatTime(time){
  var formatted = '';
  
  formatted += months[time.getMonth()] + '-' + time.getDate();
  
  formatted += '  '
  
  var hours = time.getHours();
  var mins = time.getMinutes();
  var secs = time.getSeconds();
  if(hours < 10) hours = '0' + hours;
  if(mins < 10) mins = '0' + mins;
  if(secs < 10) secs = '0' + secs;
  
  formatted += hours + ':' + mins + ':' + secs;
  
  return formatted;
}

function sanitize(aStr){
  var sanitizedTxt = $('<div>').text(aStr).html();
  return sanitizedTxt;
}

function pl(msg) {
    console.log('DEBUG->' + msg);
};

function obj(objToPrint) {
    console.log(objToPrint);
};

function compareObjects(obj1, obj2){
  var keys1 = Object.keys(obj1);
  var keys2 = Object.keys(obj2);
  
  if(keys1.length !== keys2.length) return false;
  
  var returnVal = true;
  keys1.forEach(function(key){
    if(obj1[key] !== obj2[key]) returnVal = false;
  });
  
  return returnVal;
}

function removeUserName(set, name, callback){
  set = set.filter(
    function(entry){
      return entry.name !== name;
    });
  callback(set);
}

$(document).ready(function() {
  var socket = io();
  
  var linkRegEx = /(https?:\/\/[^"\s<>]+)(\s|$)/g
  var winFocus = false;
  var stopAlerts = false;
  
  pageLoad();
  
  function pageLoad(){
    //requestUsername();
  }

  function formatMessage(msg,callback){
    var newMsg = msg;
    var links = newMsg.match(linkRegEx);
    var callbackCount = 0;
    if(links){
      links.forEach(function(link){
        isUrlAnImage(link, function(isValid){
          if(isValid){
            newMsg = newMsg.replace(link, '<img src="'+link+'" alt="imgRegEx">');
          }else{
            newMsg = newMsg.replace(link, '<a href="'+link+'" target="_blank">'+link+'</a>');
          }
          callbackCount++;
          //If we got all the callbacks returned, then callback
          if(callbackCount == links.length){
            callback(newMsg);
          }
        });
      });
    }else{
      callback(newMsg);
    }
  }
  
  function isUrlAnImage(url, callback){
    var img = new Image();
    img.onerror = function() { callback(false); }
    img.onload =  function() { callback(true); }
    img.src = url;
  }
  
  $(window).blur(function(){
    winFocus = false;
  });
  $(window).focus(function(){
    winGainFocus();
  });
  $(window).click(function(){
    winGainFocus();
  });
  
  function winGainFocus(){
    winFocus = true;
    //start alerts because now when the user navigates away, they
    //will get alerts again
    startAlerts(true);
  }
  
  //If you pass this false, it will stop extra alerts from appearing
  function startAlerts(contAlerts){
    stopAlerts = !contAlerts;
  }
  
  //Updating the alert message to make the page gain focus
  (function() {
      var _old_alert = window.alert;
      window.alert = function() {
        _old_alert.apply(window,arguments);
        winGainFocus();
      };
  })();
  
  function doAlert() {
    if(!winFocus){
        //This is for sound alert
        if ($('#chkSound').is(':checked')){
            var audio = new Audio('sounds/notif.wav');
            audio.play();
            //When audio is done, show alert alert
            audio.addEventListener("ended", function(){
                audio.currentTime = 0;
            });
        }
      
        //This is for popup alert and for title bar flashy text
        //We want this after the sound finishes, because otherwise 
        //the sound will be paused until this alert is clicked away.
        if((!stopAlerts) && $('#chkPopup').is(':checked')){
            //Stop more alerts
            startAlerts(false);
            var oldTitle = document.title;
            var msg = "New Message!";
            var timeoutId;
            var blink = function() { document.title = document.title == msg ? ' ' : msg; };
            var clear = function() {
                clearInterval(timeoutId);
                document.title = oldTitle;
                window.onmousemove = null;
                timeoutId = null;
            };
            
            if (!timeoutId) {
                timeoutId = setInterval(blink, 1000);
                window.onmousemove = clear;
            }
            if ($('#chkPopup').is(':checked'))
                alert(msg);
        }
    }
  }
  
  function postOldMsgs(msgs){
    //Using object so that it can be passed by reference
    var loaded  = 0;
    
    for(var msgsIndex = msgs.length - 1; msgsIndex >= 0; msgsIndex--){
      postMsg(msgs[msgsIndex], function(msgElm){
        if (++loaded === msgs.length){
          $('#divChat li').show();
          var div = $('#divChat');
          div.scrollTop(div[0].scrollHeight);
        }else
          msgElm.hide();
      });
    }
  }
  
  function postMsg(aMsg, callback){
    var liMsg=$('#liMsg_'+aMsg.id);
    //If the msg li element does not exist, create it
    if(!liMsg.length){
      //Creating an li and adding timestamp, id, and formatted msg
      //Making a list object with HTML safe text
      liMsg = $('<li '
              + 'id="liMsg_'+aMsg.id+'" '
              + 'title="' + formatTime(new Date()) + '">');
      //Hiding the message, until it is finished formatting.
      liMsg.hide();
      //Put/Move the li element on/to the end
      $('#messages').append(liMsg);
               
      //Converting back to text
      var msgText = sanitize(aMsg.msg);
    
      //Adding links/images. When that's done, display it
      formatMessage(msgText, function(msg){
        formatUserTag(aMsg.user, function(userTag){
          liMsg.append(userTag+' -> '+msg);
          liMsg.show();
          
          var div = $('#divChat');
          div.scrollTop(div[0].scrollHeight);
          
          if(callback) callback(liMsg);
        });
      });
    }
  }

  function formatUserTag(user,callback){
    var safeUsername = sanitize(user.name);
    //Note that we need all the else clauses because isUrlAnImage is Async
    if(user.img){
      var escapedLinks = sanitize(user.img);
      var links = escapedLinks.match(linkRegEx);
      //A user should only have one link in there
      if(links && links.length == 1){
        var link = links[0];
        isUrlAnImage(link, function(isValid){
          if(isValid){
            var userTag = getUserImgTag(user);
            callback(userTag);
          }else{
            callback(safeUsername);
          }
        });
      }else{
        callback(safeUsername);
      }
    }else{
      callback(safeUsername);
    }
  }
  
  function getUserImgTag(user){
    var iconTag = "";
    if(user.img){
      var safeName = sanitize(user.name);
      var safeLink = sanitize(user.img);
      iconTag =  '<img class="icon" '
                    + 'title="'+safeName+'" '
                    + 'src="'+safeLink+'" '
                    + 'alt="'+safeName+'" />';
    }else{
      iconTag = '<img class="icon" />';
    }
    return iconTag;
  }
  
  function updateUserData(user){
    socket.emit('update user data', user);
  }
  
  $('#ulOptions li label').hover(function(){
    $(this).addClass('label_hover');
  },function(){
    $(this).removeClass('label_hover');
  });
  
  $('#imgPlusSign').hover(function(){
    $(this).removeClass('see_through');
    $('#imgIconPreview').addClass('see_through');
  },function(){
    $(this).addClass('see_through');
    $('#imgIconPreview').removeClass('see_through');
  });
  
  $('#txtAddIconURL').on('input', function(){
    imgUrl = $('#txtAddIconURL').val();
    var escapedLinks = sanitize(imgUrl);
    var links = escapedLinks.match(linkRegEx);
    //A user should only have one link in there
    if(links && links.length == 1){
      isUrlAnImage(links[0], function(isValid){
        if(isValid){
          $('#imgIconPreview').attr("src", links[0]);
        }
        else
          $('#imgIconPreview').attr("src", '');
      });
    }
  });

  $('#frmUserName').submit(function(){
    userData = {};
    userData.name = $('#txtUserName').val();
    
    socket.emit('user connect', userData);
    return false;
  });

  $('#frmChatSend').submit(function(){
    var msg = $('#txtMsg').val();
    
    if(!(userData.name)){
      alert('You need to connect with a username first.');
    }else if(msg !== ''){
      var msg;
      $('#txtMsg').val('');
      socket.emit('chat message', msg);
      //clear text box
      msg = '';
      return false;
    }
    return false;
  });
  
  $('#txtAddIconURL').on('keydown', function (e) {
    if (e.which == 13) {
      userData.img = $('#txtAddIconURL').val();
      updateUserData(userData);
      $("#btnOptions").dropdown("toggle");
    }
  });
  
  $('#imgPlusSign').click(function(){
    userData.img = $('#txtAddIconURL').val();
    updateUserData(userData);
  });
  
  socket.on('server connection', function(data){
    pl('connected with server');
    postOldMsgs(data.oldMsgs);
    $('#divOverlay').hide();
    $('#txtMsg').focus();
  });
  
  socket.on('reconnect', function(){
    pl('reconnected with server');
    if(userData.name)
      socket.emit('user connect', userData);
  });
  
  socket.on('chat message', function(msg){
    postMsg(msg);
    doAlert();
  });
  
  function updateUserImg(user){
    var safeName = sanitize(user.name);
    var safeLink = sanitize(user.img);
    
    var iconElm = $('#imgUserListIcon_'+safeName);
    if(iconElm) iconElm.attr('src', safeLink);
  }
  
  socket.on('user list update', function(serverUserList){
    var newUserList = serverUserList.slice();
    
    //Remove any user that isn't in the new list
    userList.forEach(function(user){
      var found = false;
      newUserList.forEach(function(newUser){
        if(user.name == newUser.name){
          found = true;
          //Now check if the the user icon need to be updated
          if(user.img !== newUser.img) updateUserImg(newUser);
          
          //If the user was found, that means that it is a old user
          //and does not have to be added to the user list
          removeUserName(newUserList, user.name, function(newSet){ newUserList = newSet });
        }
      });
      if(!found) $('#liUserNameID_' + user.name).remove();
    });
    
    newUserList.forEach(function(newUser){
      var safeName = sanitize(newUser.name);
      var userLi = $('<li id="'+'liUserNameID_'+safeName+'">');
      var userImgElm = $(getUserImgTag(newUser));
      userImgElm.attr('id', 'imgUserListIcon_'+safeName);
      
      userLi.append(userImgElm);
      userLi.append(' ' + newUser.name);
      $('#userList').append(userLi);
    });
    
    userList = serverUserList.slice();
  });
  
  socket.on('bad user name', function(reason){
    switch(reason){
      case 'banned': 
        alert('That username has been banned.\nGO AWAY!');
        break;
      case 'duplicate':
        alert('User Name Unavailable, Use Another.');
        break;
      default:
        alert('An Error Occured When Adding That Username.\nTry Again');
    };
  });
  
  socket.on('disconnect', function(){
    pl('server disconnected');
  });
  
  socket.on('disconnect reason', function(reason){
    oldAlertStatus = stopAlerts;
    startAlerts(true);
    if(reason){
      alert('Disconnected\n\n' + reason);
    }else{
      alert('You have been disconnected');
    }
    startAlerts(oldAlertStatus);
  });
});