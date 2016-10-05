var request = require('request');
var isJSON = require('is-json');
var vurl = require('valid-url');
var Trello = require('trello');
var pdfkit = require('pdfkit');
var nconf = require('nconf');
var async = require('async');
var http = require('http');
var querystring = require('querystring');

//nconf.file({file:'https://s3.amazonaws.com/erf-materials/trelloconfig.json'});
nconf.file('tokens', 'trelloconfig.json');
//nconf.file('spec', 'en_erfspec.json')

var trello = new Trello(nconf.get('trello:key'),nconf.get('trello:token'));
var listnames = [];
var validColors = [];
//var speclistname = nconf.get('')

//Example URL:  https://trello.com/b/yeaRDUaD/work-description
//OR:           https://trello.com/b/yeaRDUaD
//iterate over the board, building a pdf out of it, then replying with the pdf.
//exports.handler = function(event, context){
    // hook up query params in API gateway
    // event.targetboard
    // event.colorcoded
    // event.lang
    // etc...
    // Users can send a board id or a full url, so...
//    Execute(event);
//};

//TEST URL
//http://localhost:8124/&targetboard=yeaRDUaD&isColorCoded=1&lang=en

function Execute(query){
    var boarduri = '';
    var params = querystring.parse(query.url)
    if(vurl.isUri(params.targetboard)){
        boarduri = params.targetboard;
    }
    else{
        var boarduri = 'https://trello.com/b/' + params.targetboard
    }
    boarduri += '.json';
    var options = {
        url: boarduri,
        headers: {
            'User-Agent': 'Mozilla/5.0'
        }
    }

    //Can localize using alternate language specs
    var awsloc = "";
    //var awsloc = 'https://s3.amazonaws.com/erf-materials/';
    var specname = "";
    
    if(params.lang){
        specname = params.lang + "_" + "erfspec.json";
    }
    else{
        specname = 'en_erfspec.json';
    }
    //nconf.file({file:'https://s3.amazonaws.com/erf-materials/trelloconfig.json'});
    nconf.file('spec', awsloc + specname);
    listnames = nconf.get('spec:listnames');
    
    //TODO: track an error string through this to intelligently help users who didnt quite nail the spec
    trello.getListsOnBoard(params.targetboard, function(error, lists){
            if(!error){
                var allCards = [];
                
                //loop over lists, validating
                if(typeof lists == 'string') return; //sometimes trello's api will just chuck an error string back at you.
                async.filter(lists, function(list, topcallback){
                    var validation;
                    if(ValidateName(list.name) == true){
                        console.log('Grabbing cards from ' + list.name);  
                        validation = LoadValidationSchema(list.name);
                        var coll = [];
                        trello.getCardsOnList(list.id, function(err, data){
                            if(!err){
                                async.filter(data, function(card, bottomcallback){
                                    //TODO: attach metadata for lists
                                    //TODO: card validation, load a validation object
                                    var Card = new Object();
                                    var clr;
                                    //TODO: this is a localization loose end here...
                                    //maybe try if(params.isColorCoded && IsCCListName(list.name)){...}
                                    if(params.isColorCoded && list.name == "color code"){
                                        //store color codes in an array so we can check for valid application of the colors in the cards
                                        clr = null;
                                        if(card.labels.length > 0) clr = (card.labels[0].color) ? card.labels[0].color : 'none';
                                        if(validColors.indexOf(clr) == -1){
                                            validColors.push(clr);
                                        }
                                    }
                                    if(params.isColorCoded){
                                        clr = null;
                                        if(card.labels.length > 0) clr = (card.labels[0].color) ? card.labels[0].color : 'none';
                                        Card.color = clr;
                                        Card.info = card.name;
                                        coll.push(Card);
                                    }
                                    else{
                                        Card.color = 'none';
                                        Card.info = card.name;
                                        coll.push(Card);
                                    }
                                    bottomcallback(null, card);
                                }, function(err, cardresults){
                                    allCards.push(list.name);     
                                    allCards.push(coll);                                    
                                    topcallback(null, coll);
                                });
                            }
                        });
                    }
                }, 
                function(err, fullResults){
                    console.log('done!'); 
                    if(params.isColorCoded) CleanColors(allCards);
                    console.log(allCards);
                });
            }
        });
};

http.createServer(function (req, res) {
    res.writeHead(200, {'Content-Type': 'text/html'});
    //console.log(req);
    Execute(req);
    res.end('ok');
}).listen(8124);

function handleRequest(request, response){
    response.end('It Works!! Path Hit: ' + request.url);
}

//If its one of our target names, remove it from the name array and return true.
function ValidateName(name){
    var ion = listnames.indexOf(name);
    if(ion > -1){
        listnames.splice(ion, 1);
        return true;
    }
    else return true;
};

//TODO: look at the erfspec validation component. we need to be able to intelligently hydrate those properties for use with single lists.
function LoadValidationSchema(listname){
    var loc = 'spec:validation:' + listname.toLowerCase();
    var raw = nconf.get(loc);
    var validator = new Object();
        validator.mustContain = (raw.mustcontain) ? raw.mustcontain : null;
        validator.limittype = (raw.limittype) ? raw.limittype : null;
        validator.max = (raw.max) ? raw.max : null;
        validator.min = (raw.min) ? raw.min : null;
    return validator;
};

//TODO: pass in a validator object and use it to check.
function ValidateDataAgainst(val_obj, entry){
    
};

//Just check the name of a list against the current name of the CC list. Mainly for localization.
function IsCCListName(name){

};

//TODO: loop over the cards we got, and with the color list in hand
//TODO: double up this nesting. currently just looping over lists of cards, need the cards themselves.
function CleanColors(cards){
    var cleaned;
    async.filter(cards, function(card, callback){
        if(card.hasOwnProperty('color')){
            if(validColors.indexOf(card.color) == -1){
                //Color not shown in color code list, can't allow it
                card.color = 'none';
            }
        }
    },
    function(err, cardresults){   
        allCards = cardresults;                                  
    });
};

function composePDF(json){
    var id=json[0][0]['id'];
    if(id){
        //TODO make the pdf
        trello.getListsOnBoard(id, function(error, lists){
            if(!error){
                async.filter(lists, function(list, callback){
                    if(list.ValidateName == true){
                        console.log('starting grab...');
                        var cardsPromise = trello.getCardsOnList(list.listId);
                        cardsPromise.then((cards) => {
                            return callback(cards);
                        })
                        //get cards for lists and save in collections?
                        
                    }
                }, function(fullResults){
                    console.log(fullResults);
                });
                //loop over lists, validating
                returnPDF(pdf);
            }
            
        });
    }
    else returnError();
};

function returnError(){
    var output = "The ERF service is currently down. Please try again later."
    context.succeed(output);
};

function returnPDF(doc){
    context.succeed(doc);
};