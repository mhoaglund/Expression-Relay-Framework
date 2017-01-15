var request = require('request');
var isJSON = require('is-json');
var vurl = require('valid-url');
var Trello = require('trello');
var pdfdoc = require('pdfkit');
var pdfmake = require('pdfmake');
var nconf = require('nconf');
var http = require('http');
var fs = require('fs');
var lodash = require('lodash');
var querystring = require('querystring');
var AWS = require('aws-sdk');
var async = require('async');
var Q = require('q');
var s3 = new AWS.S3();

//Refactor with promises to try to clear this up for future intervention

function grabLists(){
    var deferred = Q.defer();
    //get lists from trello and return
    trello.getListsOnBoard(params.targetboard, function(error, lists){
        if(!error & typeof lists != 'string'){
            var Meta = [];
                if(params.name){
                    nlname = decodeURI(params.name);
                    docname = nlname.split(' ').slice(-1)[0];
                    Meta.push(nlname);
                }
                
                var All = [];
                var validationResult = [];
                deferred.resolve();
        }
    });
    return deferred.promise();
}

grabLists()
    .then(filterLists)
    .then(grabProperties)
function filterLists(lists){
    var deferred = Q.defer();
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
            ResolveListOrder(listnames, data, function(err, ordereddata){
                if(validationResult.length ==0) {
                    deferred.resolve();
                    //MakePDF(Meta, ordereddata, defaultfilename, params);
                }
                else{
                    deferred.reject();
                }
            });
        });
    });
    return deferred.promise();
}

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
                        hLineWidth: function(){return 1;}, //TODO update pdfmake so we can just pass a value in here like we can with color.
                        vLineWidth: function(){return 1;}  //TODO fix pdfmake's offset math when using o.5 for both widths.
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
        else if(list.name.toLowerCase() == listnames[1]){ //Tags
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
    var deferred = Q.defer();
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
                //var responseBody = process.env.S3BUCKET.toString() + docname;
                deferred.resolve();
                //_context.succeed({location: responseBody});
            }
            else{
                //var responseBody = process.env.ERRPAGE;
                //console.log('Error occurred: ' + err);
                deferred.reject();
                //_context.succeed({location: responseBody});
                
            } 
        });
        return deferred.promise();
};

function grabProperties(){
    var deferred = Q.defer();
    trello.getBoardFieldbyName(params.targetboard, 'name', function(err, data){
        if(!err){
            Meta.push(data._value);
            deferred.resolve();  
        }
        else deferred.reject();
    });
    return deferred.promise();
}

function CleanColors(lists, cb){
    var validationstring = '';
    async.filter(lists, function(list, callback){
        list.cards.forEach(function(card){
            if(card.hasOwnProperty('color')){
                if(card.color && validColors.indexOf(card.color) == -1){
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
