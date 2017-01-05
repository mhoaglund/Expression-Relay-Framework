setOalls();

var data = {
	active: initText,
	google : {families: ['Cardo:italic', 'Roboto:300,100', 'Cutive Mono', 'Oranienbaum', 'Nunito Sans:900,700,500,300,200']}
};

WebFont.load(data);

var oallht;
var oallwth;
var oallctr;

function setOalls(){
	 oallht = $(document).height();
	 oallwth = $(document).width(); 
	 winht = $(window).height();
	 oallctr = {x: (oallwth/2), y: (oallht/2) };
	 formht = $('#formcontainer').height();
	 $('#plate').css({
		 height: winht
	 });
}

//var body_location = 'https://s3.amazonaws.com/erf-materials/ERFspec.md';
var body_location = 'ERFspec.md';
function getText(myUrl){
            var result = null;
            $.ajax( { url: myUrl, 
                      type: 'get', 
                      dataType: 'html',
					  contentType: 'text/html;charset=utf-8',
                      async: false,
                      success: function(data) { result = data; } 
                    }
            );
            FileReady = true;
            return result;
        }

var markdown_source = getText(body_location);
var output = markdown.toHTML( markdown_source );
$('#specdoc').append(output);
var reveal = '<svg width="48" height="48" class="cornerfold paper" version="1.1" xmlns="http://www.w3.org/2000/svg"><polygon points="0 0, 48 0, 48 48" fill="#e6d69f"></polygon></svg>';
var dogear = '<svg width="48" height="48" class="cornerfold paper dogear" version="1.1" xmlns="http://www.w3.org/2000/svg"><polygon points="0 0, 0 48, 48 48" fill="#ffffff"></polygon></svg>';
$('#specdoc').prepend(reveal);
$('#specdoc').prepend(dogear);
function initText(){
	setOalls();
}

$( window ).resize(function() {
	setOalls();
});