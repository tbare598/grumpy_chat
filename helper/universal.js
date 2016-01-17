exports.log = log;
exports.uniq = uniq;
exports.getRandInt = getRandInt;
exports.getDateTime = getDateTime;
exports.getRandToken = getRandToken;

function log(msg){
  console.log(getDateTime() + ' - ' + msg);
}

//This returns an array with unique elements
function uniq(a) {
  var seen = new Set();
  return a.filter(function(x) {
    return !seen.has(x) && seen.add(x);
  })
}

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

function getRandInt(min, max) {
    return Math.floor(min + (Math.random() * max));
}

function getRandToken(len){
  var a = 'abcdefghijklmnopqrstuwxyzABCDEFGHIJKLMNOPQRSTUWXYZ0123456789~!@#$%^&*()_+{}|:"?><`-=[]\;,./';
  var token = ''; 
  for(x=0;x<len;x++){
    randNumb = getRandInt(0, a.length-1);
    token += a[randNumb];
  }
  return token;
}
