var https = require('https');

exports.findAnImgLink = findAnImgLink;
exports.searchGoogleImages = searchGoogleImages;

function findAnImgLink(searchTerm, callback){
  searchGoogleImages(searchTerm, function(items, err){
    if(items){
      //If there a thumbnail, return that, if not the full size image
      if(items[0].image.thumbnailLink){
        callback(items[0].image.thumbnailLink);
      }else{
        callback(items[0].link);
      }
    }else{
      callback(null, err);
    }
  });
}

function searchGoogleImages(term, callback){
  var imgSearchStr='https://www.googleapis.com/customsearch/v1?key=AIzaSyCe4ud61IKC8B2dfQ2bDAgdvfxLGE9dNTw&cx=002547328973189675934:shd-4zof6nk&q='
                 + term
                 + '&searchType=image&alt=json';
                    //&fileType=jpg
  
  var err = { 'message' : '' };
    
  https.get(imgSearchStr, function(res){
    var body = '';
    res.on('data', function(data){
      body += data;
    });
    res.on('end', function(){
      var parsed = JSON.parse(body);
      if(parsed.error){
        err.message = '***ERROR*** searchGoogleImages res.on "end":\n'
                    + '***ERROR*** ' + parsed.error.message;
        callback(null, err);
      }else{
        callback(parsed.items);
      }
    });
  }).on('error',function(e){
    err.message = '***ERROR*** searchGoogleImages https.get.on "error":\n'
                + '***ERROR*** ' + e.message;
    callback(null, err);
  });
}

