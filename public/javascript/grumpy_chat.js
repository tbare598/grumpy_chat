var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
var userData = {};

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

function pl(msg) {
    console.log('DEBUG->' + msg);
};

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
    for(var msgsIndex = msgs.length - 1; msgsIndex >= 0; msgsIndex--){
      postMsg(msgs[msgsIndex]);
    }
  }
  
  function postMsg(aMsg){
    var liMsg=$('#liMsg_'+aMsg.id);
    //If the msg li element does not exist, create it
    if(!liMsg.length){
      //Creating an li and adding timestamp, id, and formatted msg
      //Making a list object with HTML safe text
      liMsg = $('<li '
               + 'id="liMsg_'+aMsg.id+'" '
               + 'title="' + formatTime(new Date()) + '">').text(aMsg.msg);
      //Hiding the message, until it is finished formatting.
      liMsg.hide();
               
      //Converting back to text
      var msgText = liMsg[0].innerHTML;
    
      //Adding links/images. When that's done, display it
      formatMessage(msgText, function(msg){
        //Clear the text from the list element, then add the formatted
        //text to the list element
        liMsg.text('');
        liMsg.append(msg);
        liMsg.show();
        
        var div = $('#divChat');
        div.scrollTop(div[0].scrollHeight);
      });
    }
    //Put/Move the li element on/to the end
    $('#messages').append(liMsg);
  }
  
  $('#frmUserName').submit(function(){
    userData = {};
    userData.userName = $('#txtUserName').val();
    
    socket.emit('user connect', userData);
    return false;
  });

  $('#frmChatSend').submit(function(){
    var msg = $('#txtMsg').val();
    
    if(!(userData.userName && userData.uid)){
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
  
  socket.on('server connection', function(data){
    pl('connected with server');
    userData.uid = data.uid;
    postOldMsgs(data.oldMsgs);
    $('#divOverlay').hide();
    $('#txtMsg').focus();
  });
  
  socket.on('reconnect', function(){
    pl('reconnected with server');
    if(userData.userName && userData.uid)
      socket.emit('user connect', userData);
  });
  
  socket.on('chat message', function(msg){
      postMsg(msg);
      doAlert();
  });
  
  socket.on('user list update', function(userNameList){
    var listOfIds = [];
    
    var newList = [];
    //Append 'liUserNameID' to the front of all of them, so that
    //a user can't make a username that is the id of another element
    userNameList.forEach(function(index){
      newList.push('liUserNameID' + index);
    });

    //If the current user list has a name that isn't in the new 
    //list, remove it
    $('#userList').each(function(){
        $(this).find('li').each(function(){
            var currId = $(this).attr('id');
            listOfIds.push(currId);
            if(newList.indexOf(currId) === -1) $(this).remove();
        });
    });

    //If a new user has been added to the list, add them
    newList.forEach(function(id) {
      if(listOfIds.indexOf(id) === -1){
          var newLi = $('<li>').text(id.substring(12));
          newLi.attr('id', id);
          $('#userList').append(newLi);
      }
    });
    
  });
  
  socket.on('bad user name', function(reason){
    switch(reason){
      case 'banned': 
        alert('That username has been banned.\nGO AWAY!');
        break;
      case 'duplicate':
        alert('User Name Unavailable, Use Another.');
        break;
      case 'username uid mismatch':
        alert('That should not have happened...');
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