var request = require('request');
var isJSON = require('is-json');
var vurl = require('valid-url');
var Trello = require('trello');
var pdfdoc = require('pdfkit');
var nconf = require('nconf');
var async = require('async');
var http = require('http');
var fs = require('fs');
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
                var All = [];
                var validationResult = [];
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
                                    var Card = new Object();
                                    var clr;
                                    
                                    //maybe try if(params.isColorCoded && IsCCListName(list.name)){...}
                                    //TODO: this is a localization loose end here...
                                    if(params.isColorCoded && list.name.toLowerCase() == "color code"){
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
                                    }
                                    else{
                                        Card.color = 'none';
                                        Card.info = card.name;
                                    }

                                    //var cvr = ValidateDataAgainst(validation, Card);
                                    var cvr = ValidateDataAgainst('', Card);
                                    if(!cvr)coll.push(Card);
                                    else validationResult.push(cvr);

                                    bottomcallback(null, card);
                                }, function(err, cardresults){
                                    var ThisList = new Object();
                                    ThisList.cards = coll;
                                    ThisList.name = list.name;
                                    All.push(ThisList);                                     
                                    topcallback(null, coll);
                                });
                            }
                        });
                    }
                }, 
                function(err, fullResults){
                    console.log('Card Result:'); 
                     if(params.isColorCoded){
                         CleanColors(All, function(err, data, colorvalidation){
                            if(colorvalidation) validationResult += colorvalidation.toString();
                            console.log('Validation Result:');
                            console.log(validationResult);
                            CreatePDF(data);
                         });
                    }
                    else{
                        console.log(All);
                        console.log('Validation Result:');
                        console.log(validationResult);
                        CreatePDF(All);
                    }
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
    var result = null; //null is cleaned
    if(val_obj.limittype){
        var length = (val_obj.limittype == "word") ? entry.name.split(" ").length : entry.name.length;
        if(val_obj.max){
            if(length > val_obj.max){
                var errmsg = nconf.get('spec:validation:messages:toolong');
                result += errmsg;
            }
        }
    }

    if(val_obj.mustcontain){
        //what kind of nasty regex stuff can do this?
        if(val_obj.mustcontain == 'question'){
            if(entry.name.indexOf('?') > -1){//potential localization weakness here.
                var errmsg = nconf.get('spec:validation:messages:missing') + val_obj.mustcontain;
                result += errmsg;
            }
        }
    }

    return result;
};

//Just check the name of a list against the current name of the CC list. Mainly for localization.
function IsCCListName(name){

};

//Doublecheck use of colors on cards. The spec allows for color coding but only when used declaratively.
function CleanColors(lists, cb){
    var validationstring = '';
    async.filter(lists, function(list, callback){
        list.cards.forEach(function(card){
            if(card.hasOwnProperty('color')){
                if(card.color && validColors.indexOf(card.color) == -1){
                    //Color not null and not shown in color code list, can't allow it
                    validationstring += ('Removed color: '+ card.color + ' from card "' + card.info + '" ');
                    card.color = 'none';
                }
            }
        }); 
        callback(null, list);
    },
    function(err, cardresults){   
        if(!err){
            return cb(err, cardresults, validationstring); 
        }                       
    });
};

//The order of lists as they are finally shown can be controlled by advanced users or can follow a default from the spec.
function ResolveListOrder(listorder, lists, cb){
    var ol = [];
    if(listorder){
        //...
    }
    else{
        ol = lists; //just a passthru for now since this is pretty low priority stuff
        return cb(ol);
    }
};

function CreatePDF(data){
    doc = new pdfdoc;
    doc.pipe(fs.createWriteStream('result.pdf'));
    //TODO loop over the lists and carefully render each card.
    lorem = JSON.stringify(data);
    other = "test string";
    doc.fillColor('green').text(lorem.slice(0, 500), {
        width: 465,
        continued: true
    }).fillColor('red').text(lorem.slice(500));
    doc.rect(doc.x, 0, 465, doc.y).stroke('black');
    doc.end();
}

function returnError(){
    var output = "The ERF service is currently down. Please try again later."
    context.succeed(output);
};

function returnPDF(doc){
    context.succeed(doc);
};

Array.prototype.move = function (old_index, new_index) {
    if (new_index >= this.length) {
        var k = new_index - this.length;
        while ((k--) + 1) {
            this.push(undefined);
        }
    }
    this.splice(new_index, 0, this.splice(old_index, 1)[0]);
    return this; // for testing purposes
};