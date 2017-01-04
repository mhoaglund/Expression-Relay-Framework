var data = {
	active: initText,
	google : {families: ['Cardo:italic', 'Roboto:300,100', 'Cutive Mono', 'Oranienbaum', 'Nunito Sans:900,700,500,300']}
};

WebFont.load(data);

var oallht;
var oallwth;
var oallctr;

function setOalls(){
	 oallht = $(window).height();
	 oallwth = $(window).width(); 
	 oallctr = {x: (oallwth/2), y: (oallht/2) };
	 formht = $('#formcontainer').height();
	 $('.slab').css({
		 height: formht + 'px'
	 });
}

function initText(){
	setOalls();
}

$( window ).resize(function() {
	setOalls();
	txtRemake();
});