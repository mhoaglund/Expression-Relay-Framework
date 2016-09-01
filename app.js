var request = require('request');
var isJSON = require('is-json');
var vurl = require('valid-url');
var Trello = require('trello');
var pdfkit = require('pdfkit');
var nconf = require('nconf');
nconf.file({file:'https://s3.amazonaws.com/erf-materials/trelloconfig.json'});
var trello = new Trello(nconf.get('trello:key'),nconf.get('trello:secret'));

//Example URL:  https://trello.com/b/yeaRDUaD/work-description
//OR:           https://trello.com/b/yeaRDUaD
//iterate over the board, building a pdf out of it, then replying with the pdf.
exports.handler = function(event, context){
    //hook up query params in API gateway
    //event.targetboard
    //event.colorcoded
    //event.lang
    //etc...
    //Users can send a board id or a full url, so...
    var boarduri = '';
    if(vurl.isUri(event.targetboard)){
        boarduri = event.targetboard;
    }
    else{
        var boarduri = 'https://trello.com/b/' + event.targetboard
    }
    boarduri += '.json';
    request(boarduri, function (error, response, body) {
        if (!error && response.statusCode == 200) {
            if(isJSON(body)){
                composePDF(JSON.parse(body));
            }
        }
    })
};

function composePDF(json){
    var id=json[0][0]['id'];
    if(id){
        //TODO make the pdf
        trello.getListsOnBoard(id, function(){
            //loop over lists, validating
            returnPDF();
        });
    }
    else returnError();
};

function returnError(){

};

function returnPDF(){

};