var request = require('request');
var isJSON = require('is-json');
var vurl = require('valid-url');
var Trello = require('trello');
var pdfdoc = require('pdfkit');
var pdfmake = require('pdfmake');
var nconf = require('nconf');
var async = require('async');
var http = require('http');
var fs = require('fs');
var lodash = require('lodash');
var querystring = require('querystring');
var AWS = require('aws-sdk');
var Q = require('q');
var s3 = new AWS.S3();

if(process.env.TRELLOKEY){
    var trello = new Trello(process.env.TRELLOKEY,process.env.TRELLOTOKEN);
}

var listnames = [];
var validColors = [];
var yellowCorrection = '#F2D600';
var blueCorrection = '#0079BF';
var redCorrection = '#EB5A46';
var baseGray = '#545454';

var fonts = {
        Roboto: {
            normal: 'fonts/NotoSans-Regular.ttf',
            bold: 'fonts/NotoSans-Bold.ttf',
            italics: 'fonts/NotoSans-Italic.ttf',
            bolditalics: 'fonts/NotoSans-BoldItalic.ttf'
        }
    };

var vnum = 'v0.1';
var currdate = new Date().toJSON().slice(0,10).toString();

var boardMeta = ['name'];

var defaultfilename = 'statement';
var defaultappend = '_1';

var docname = "yourstatement"
var specname = "en_erfspec.json";
nconf.file('spec', specname); //TODO get this from S3, skip the nconf step and just grab a json obj
var _context = ''; //this is stupid
exports.handler = function(event, context){
    _context = context;
    console.log(event);
    Execute(event);
    
};

//example query
//http://localhost:8124/&targetboard=yeaRDUaD&isColorCoded=yes&lang=en&ccodestyle=outline&gutter=10&name=Maxwell%20Hoaglund

function Execute(query){

    var params = query; //event object from aws
    var awsloc = process.env.S3BUCKET.toString();
    
    // if(params.lang){
    //     get the proper thing from s3...
    // }

    listnames = nconf.get('spec:listnames');

    //TODO: track an error string through this to intelligently help users who didnt quite nail the spec
    trello.getListsOnBoard(params.targetboard, function(error, lists){
            if(!error){
                var Meta = [];
                if(params.name){
                    nlname = decodeURI(params.name);
                    docname = nlname.split(' ').slice(-1)[0];
                    Meta.push(nlname);
                }
                
                var All = [];
                var validationResult = [];
                if(typeof lists == 'string') return;
                trello.getBoardFieldbyName(params.targetboard, 'name', function(err, data){
                    if(!err){
                        Meta.push(data._value);  
                    }
                    else console.log(err);
                });
                async.filter(lists, function(list, topcallback){
                    var validation;
                    if(ValidateName(list.name) == true){
                        validation = LoadValidationSchema(list.name);
                        var coll = [];
                        trello.getCardsOnList(list.id, function(err, data){
                            if(!err){
                                async.filter(data, function(card, bottomcallback){
                                    var Card = new Object();
                                    var clr;
                                    if(params.isColorCoded == "yes" && list.name.toLowerCase() == listnames[0]){
                                        clr = null;
                                        if(card.labels.length > 0) clr = (card.labels[0].color) ? card.labels[0].color : 'none';
                                        if(validColors.indexOf(clr) == -1){
                                            validColors.push(clr);
                                        }
                                    }
                                    if(params.isColorCoded == "yes"){
                                        clr = null;
                                        if(card.labels.length > 0) clr = (card.labels[0].color) ? card.labels[0].color : 'none';
                                        Card.color = clr;
                                        Card.info = card.name;
                                    }
                                    else{
                                        Card.color = 'none';
                                        Card.info = card.name;
                                    }

                                    //var cvr = ValidateDataAgainst(validation, Card); TODO implement the validation for real
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
                    CleanColors(All, function(err, data, colorvalidation){
                        //if(colorvalidation) validationResult += colorvalidation.toString();
                        console.log(validationResult);
                        ResolveListOrder(listnames, data, function(err, ordereddata){
                            if(validationResult.length ==0) {
                                MakePDF(Meta, ordereddata, defaultfilename, params);
                            }
                            else{
                                SendValidationReport(validationResult);
                            }
                        });
                    });
                });
            }
        });
};

//If the list name is one of our target names, remove it from the name array and return true.
function ValidateName(name){
    var ion = listnames.indexOf(name);
    if(ion > -1){
        listnames.splice(ion, 1);
        return true;
    }
    else return true;
};

//TODO: look at the erfspec validation component. we need to be able to intelligently hydrate those properties for use with single lists.
//from an academic/elegance POV I am not super into the way this method is impd, but I dont know what would be satisfying.
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

function ValidateDataAgainst(val_obj, entry){
    var result = null;
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
        //what kind of nasty regex/NLP stuff can do this the right way? a question is more than its mark.
        if(val_obj.mustcontain == 'question'){
            if(entry.name.indexOf('?') > -1){//potential localization weakness with this qmark.
                var errmsg = nconf.get('spec:validation:messages:missing') + val_obj.mustcontain;
                result += errmsg;
            }
        }
        if(val_obj.mustcontain == 'hyperlink'){
            //TODO sort out hyperlink detection here, try to quickly/sipmply validate that links are intact.
        }
    }
    return result;
};

//TODO: API gateway will want our response to have a content-type, and we have either a pdf or an error string. how do we deal with that?
function SendValidationReport(report){
    var responseBody = process.env.ERRPAGE;
    console.log('Error occurred: ' + report);
    _context.succeed({location: responseBody});
}

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
                if(card.color == 'yellow'){
                    card.color = yellowCorrection;
                }
                if(card.color == 'blue'){
                    card.color = blueCorrection;
                }
                if(card.color == 'red'){
                    card.color = redCorrection;
                }
                if(card.color == 'black' | card.color == null | card.color == 'none'){
                    card.color = baseGray;
                }
            }
            else{
                card.color = baseGray;
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
        async.eachSeries(listorder, function(listname, callback){
            var found = lodash.find(lists, x => x.name.toLowerCase() == listname);
            if(found && lists.indexOf(found) != -1){
                console.log('Added ' + found.name + ' in order');
                ol.push(found);
            }
            callback(null, null);
        }, function(err, results){
            return cb(null, ol);
        });
    }
    else{
        ol = lists;
        return cb(ol);
    }
};

function MakePDF(meta, data, filename, params){
    //TODO pass in a font that was sent with the form

    var docdef = {content:[], styles:{ //TODO load these styles from aws
        _default:{
            fontSize: 8,
            alignment: 'left'
        },
        _subhead:{
            fontSize: 8,
            alignment: 'left',
            margin: [0, 8]
        },
        _footer:{
            fontSize: 6,
            italics: true,
            color: baseGray,
            margin: [0, 8]
        },
        table: {

		},
        vmargin:{
            margin: [0, 8],
            columnGap: parseInt(params.gutter)
        }
    }};

    meta.forEach(function(line){
        docdef.content.push({ text: line, style: '_default'});
    });

    async.filter(data, function(list,callback){
        var list_title = { text: list.name, style: '_subhead'}; //should users be able to color code a whole list?
        docdef.content.push(list_title);
        if(list.name.toLowerCase() == listnames[0]){
            if(params.ccodestyle == "outline"){ 
                var columnhost = {style: 'vmargin',columns:[]};
                list.cards.forEach(function(card){
                    var tableobj = {width: 'auto', table:{style: 'table', headerRows: 0, widths:[], body:[]}};
                    var colorrow = [];
                    var cardcolor = baseGray;
                    if(card.hasOwnProperty('color') && card.color){
                        cardcolor = card.color;
                    }
                    var paragraph = { text: card.info.toString(), color: cardcolor, style: '_default'};
                    tableobj.table.widths.push('auto');
                    colorrow.push(paragraph);
                    tableobj.table.body.push(colorrow);
                    tableobj.layout = {
                        hLineColor: cardcolor,
                        vLineColor: cardcolor,
                        hLineWidth: function(){return 1;},
                        vLineWidth: function(){return 1;}
                    };
                    columnhost.columns.push(tableobj);
                }); 
                docdef.content.push(columnhost);
            }
            else{
                var tableobj = {table:{headerRows: 0, widths:[], body:[]}};
                var colorrow = [];
                list.cards.forEach(function(card){
                    var cardcolor = 'black';
                    if(card.hasOwnProperty('color') && card.color){
                        cardcolor = card.color;
                    }
                    var paragraph = { text: card.info.toString(), color: cardcolor, style: '_default'};
                    tableobj.table.widths.push('*');
                    colorrow.push(paragraph);
                }); 
                tableobj.table.body.push(colorrow);
                docdef.content.push(tableobj);
            }
        }
        else if(list.name.toLowerCase() == listnames[1]){
            var alltags = { text: [], style: '_default'};
            list.cards.forEach(function(card){
                var cardcolor = 'black';
                if(card.hasOwnProperty('color') && card.color){
                    cardcolor = card.color;
                }
                var paragraph = { text: card.info.toString() + ', ', color: cardcolor, style: '_default'};
                alltags.text.push(paragraph);
            }); 
            docdef.content.push(alltags);
        }
        else{
            list.cards.forEach(function(card){
                var cardcolor = 'black';
                if(card.hasOwnProperty('color') && card.color){
                    cardcolor = card.color;
                }
                var paragraph = { text: card.info.toString(), color: cardcolor, style: '_default'};
                docdef.content.push(paragraph);
            }); 
        }
        callback(null, list);
    }, function(err, res){
        docdef.content.push({ text: 'Compiled with Expression Relay Framework ' + vnum + ' on ' + currdate, style: '_footer'});
        dropPDF(docdef);
    });
}

function dropPDF(_doc){
        var localname = '/tmp/makepdfexample.pdf'
        var PdfPrinter = require('pdfmake/src/printer');
        var printer = new PdfPrinter(fonts);
        var pdfDoc = printer.createPdfKitDocument(_doc);
        pdfDoc.pipe(fs.createWriteStream(localname)); //TODO do we really need to reuse the stream object here?
        pdfDoc.end();

        var _stream = fs.createReadStream(localname);
        var params = {
            Bucket: 'erf-materials',
            Key: docname,
            ContentType: 'application/pdf',
            ACL: 'public-read',
            Body: _stream
        };
        s3.upload(params, function(err){
            if(!err) {
                var responseBody = process.env.S3BUCKET.toString() + docname;
                _context.succeed({location: responseBody});
            }
            else{
                var responseBody = process.env.ERRPAGE;
                console.log('Error occurred: ' + err);
                _context.succeed({location: responseBody});
                
            } 
        });
};
